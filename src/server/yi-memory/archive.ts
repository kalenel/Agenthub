import { Buffer } from 'node:buffer'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { eq } from 'drizzle-orm'
import JSZip from 'jszip'

import { db, schema, sqlite } from '@/db/client'
import { getAttachmentAbsolutePath, listAttachments } from '@/server/attachment-service'
import { newAttachmentId } from '@/server/ids'
import { isPathWithin } from '@/server/workspace-utils'

import { yiGetMemoryPack, type YiGetMemoryPackInput } from './service'
import {
  insertMemoryRecord,
  listMemoryRecords,
  type MemoryPackInput,
  type MemoryRecord,
  type MemoryRecipient,
  type MemoryScope,
  type MemoryStatus,
} from './memory-store'

const ARCHIVE_FORMAT = 'agenthub-memory-pack'
const ARCHIVE_VERSION = 1
const ATTACHMENTS_DIR = 'attachments'
const MANIFEST_FILE = 'manifest.json'
const CORE_FILE = 'core-memory.jsonl'
const PROJECT_FILE = 'project-memory.jsonl'
const SESSION_FILE = 'session-memory.jsonl'
const EXPORT_STATUSES: MemoryStatus[] = ['active', 'superseded', 'conflicted', 'archived']

export interface MemoryPackArchiveExportInput extends YiGetMemoryPackInput {
  includeAttachments?: boolean
  start?: string
  end?: string
}

export interface MemoryPackArchiveAttachmentEntry {
  id: string
  archiveName: string
  fileName: string
  kind: 'image' | 'file'
  mimeType: string
  size: number
  createdAt: number
}

export interface MemoryPackArchiveManifest {
  format: typeof ARCHIVE_FORMAT
  version: typeof ARCHIVE_VERSION
  exportedAt: string
  source: {
    mode: MemoryPackInput['mode']
    recipient: MemoryRecipient
    conversationId: string | null
    projectKey: string | null
    query?: string
    queryHits: number
    start?: string
    end?: string
  }
  counts: {
    core: number
    project: number
    session: number
    attachments: number
  }
  files: {
    manifest: typeof MANIFEST_FILE
    core: typeof CORE_FILE
    project: typeof PROJECT_FILE
    session: typeof SESSION_FILE
    attachmentsDir: typeof ATTACHMENTS_DIR
  }
  attachments: MemoryPackArchiveAttachmentEntry[]
  warnings: string[]
}

export interface MemoryPackArchiveExportResult {
  manifest: MemoryPackArchiveManifest
  buffer: Buffer
  fileName: string
}

export interface MemoryPackArchiveImportResult {
  manifest: MemoryPackArchiveManifest
  targetConversationId: string
  targetProjectKey: string | null
  importedRecords: number
  reusedRecords: number
  remappedRecords: number
  importedAttachments: number
  reusedAttachments: number
  remappedAttachments: number
  warnings: string[]
}

type ArchiveRecord = Omit<MemoryRecord, 'whyLoaded'>
type AttachmentRow = typeof schema.attachments.$inferSelect

type AttachmentRestoreResult = { id: string; reused: boolean; remapped: boolean }

type ArchiveTimeWindow = {
  start?: number
  end?: number
  startRaw?: string
  endRaw?: string
}

export async function buildMemoryPackArchive(
  input: MemoryPackArchiveExportInput,
): Promise<MemoryPackArchiveExportResult> {
  const pack = await yiGetMemoryPack(input)
  const sourceConversationId = pack.conversationId
  const sourceProjectKey = pack.projectKey
  const recipient = pack.recipient
  const queryHits = pack.pack.queryHits

  const timeWindow = normalizeArchiveTimeWindow(input.start, input.end)
  const coreRecords = readArchiveRecords('core', undefined, timeWindow.start, timeWindow.end)
  const projectRecords = sourceProjectKey ? readArchiveRecords('project', sourceProjectKey, timeWindow.start, timeWindow.end) : []
  const sessionRecords = sourceConversationId ? readArchiveRecords('session', sourceConversationId, timeWindow.start, timeWindow.end) : []

  const includeAttachments = input.includeAttachments ?? Boolean(sourceConversationId)
  const sourceAttachments = includeAttachments && sourceConversationId ? await listAttachments(sourceConversationId) : []
  const referencedAttachmentIds = collectAttachmentIdsFromRecords([...coreRecords, ...projectRecords, ...sessionRecords])
  const filteredAttachments = includeAttachments && sourceConversationId ? filterAttachmentsByIds(sourceAttachments, referencedAttachmentIds) : []
  const attachmentEntries: MemoryPackArchiveAttachmentEntry[] = []
  const warnings: string[] = []

  if (includeAttachments && sourceConversationId && referencedAttachmentIds.size > 0 && filteredAttachments.length < referencedAttachmentIds.size) {
    const missing = [...referencedAttachmentIds].filter((id) => !sourceAttachments.some((attachment) => attachment.id === id))
    if (missing.length > 0) {
      warnings.push('Missing attachments referenced by export window: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? '...' : ''))
    }
  }

  const zip = new JSZip()
  zip.file(CORE_FILE, toJsonl(coreRecords))
  zip.file(PROJECT_FILE, toJsonl(projectRecords))
  zip.file(SESSION_FILE, toJsonl(sessionRecords))

  if (includeAttachments && sourceConversationId) {
    for (const attachment of filteredAttachments) {
      const absPath = await getAttachmentAbsolutePath(attachment.id)
      if (!absPath) {
        throw new Error(`Attachment file missing on disk: ${attachment.id}`)
      }
      const archiveName = buildAttachmentArchiveName(attachment.id, attachment.fileName)
      zip.file(path.posix.join(ATTACHMENTS_DIR, archiveName), readFileSync(absPath))
      attachmentEntries.push({
        id: attachment.id,
        archiveName,
        fileName: attachment.fileName,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      })
    }
  }

  const manifest: MemoryPackArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      mode: pack.mode,
      recipient,
      conversationId: sourceConversationId,
      projectKey: sourceProjectKey,
      query: input.query?.trim() || undefined,
      queryHits,
      start: timeWindow.startRaw,
      end: timeWindow.endRaw,
    },
    counts: {
      core: coreRecords.length,
      project: projectRecords.length,
      session: sessionRecords.length,
      attachments: attachmentEntries.length,
    },
    files: {
      manifest: MANIFEST_FILE,
      core: CORE_FILE,
      project: PROJECT_FILE,
      session: SESSION_FILE,
      attachmentsDir: ATTACHMENTS_DIR,
    },
    attachments: attachmentEntries,
    warnings,
  }

  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  return {
    manifest,
    buffer,
    fileName: buildArchiveFileName(pack.mode),
  }
}

export async function restoreMemoryPackArchive(
  archive: ArrayBuffer | ArrayBufferView | Buffer,
  targetConversationId: string,
): Promise<MemoryPackArchiveImportResult> {
  const zip = await JSZip.loadAsync(toBuffer(archive))
  const manifest = await readManifest(zip)
  validateManifest(manifest)

  const targetWorkspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, targetConversationId),
  })
  if (!targetWorkspace) {
    throw new Error(`Workspace not found for target conversation: ${targetConversationId}`)
  }

  const targetProjectKey = targetWorkspace.id
  const warnings = [...manifest.warnings]
  const idMap = new Map<string, string>()
  const attachmentIdMap = new Map<string, string>()

  let importedAttachments = 0
  let reusedAttachments = 0
  let remappedAttachments = 0

  for (const attachment of manifest.attachments) {
    const entry = zip.file(path.posix.join(ATTACHMENTS_DIR, attachment.archiveName))
    if (!entry) {
      throw new Error(`Attachment missing from archive: ${attachment.archiveName}`)
    }
    const bytes = await entry.async('nodebuffer')
    const restored = await restoreAttachmentFromArchive({
      attachment,
      bytes,
      targetConversationId,
      targetWorkspaceRoot: targetWorkspace.rootPath,
    })
    attachmentIdMap.set(attachment.id, restored.id)
    if (restored.reused) {
      reusedAttachments += 1
    } else {
      importedAttachments += 1
    }
    if (restored.remapped) remappedAttachments += 1
  }

  const records = [
    ...parseArchiveRecords(await readArchiveText(zip, manifest.files.core)),
    ...parseArchiveRecords(await readArchiveText(zip, manifest.files.project)),
    ...parseArchiveRecords(await readArchiveText(zip, manifest.files.session)),
  ].sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))

  let importedRecords = 0
  let reusedRecords = 0
  let remappedRecords = 0

  for (const sourceRecord of records) {
    const candidate = remapRecordForTarget(sourceRecord, targetConversationId, targetProjectKey, attachmentIdMap)
    const exactExisting = findExactMemoryRecord(candidate)
    if (exactExisting) {
      idMap.set(sourceRecord.id, exactExisting.id)
      reusedRecords += 1
      continue
    }

    const existingById = getMemoryRecordById(sourceRecord.id)
    let finalId = sourceRecord.id
    if (existingById) {
      if (isSameMemoryRecord(existingById, candidate)) {
        idMap.set(sourceRecord.id, existingById.id)
        reusedRecords += 1
        continue
      }
      finalId = newMemoryRecordId()
      remappedRecords += 1
    }

    const supersedesId = resolveImportedReferenceId(sourceRecord.supersedesId, idMap)
    const inserted = insertMemoryRecord({
      ...candidate,
      id: finalId,
      supersedesId,
    })
    idMap.set(sourceRecord.id, inserted.id)
    importedRecords += 1
  }

  return {
    manifest,
    targetConversationId,
    targetProjectKey,
    importedRecords,
    reusedRecords,
    remappedRecords,
    importedAttachments,
    reusedAttachments,
    remappedAttachments,
    warnings,
  }
}

function buildArchiveFileName(mode: MemoryPackInput['mode']): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `memory-pack-${mode}-${stamp}.zip`
}

function buildAttachmentArchiveName(attachmentId: string, fileName: string): string {
  const ext = safeAttachmentExt(fileName)
  return `${attachmentId}${ext}`
}

function safeAttachmentExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

function toJsonl(records: ArchiveRecord[]): string {
  if (records.length === 0) return ''
  return records.map((record) => JSON.stringify(stripWhyLoaded(record))).join('\n') + '\n'
}

function stripWhyLoaded(record: MemoryRecord): ArchiveRecord {
  const { whyLoaded: _whyLoaded, ...rest } = record
  return rest
}

function parseArchiveRecords(text: string): ArchiveRecord[] {
  if (!text.trim()) return []
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ArchiveRecord)
}

function normalizeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowToMemoryRecord(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    scope: row.scope === 'project' || row.scope === 'session' ? row.scope : 'core',
    kind: String(row.kind ?? ''),
    text: String(row.text ?? ''),
    payload: normalizeJson<Record<string, unknown>>(row.payload, {}),
    source: String(row.source ?? 'unknown'),
    sourceRef: row.source_ref == null ? null : String(row.source_ref),
    importance: Number(row.importance ?? 0),
    confidence: Number(row.confidence ?? 100),
    status:
      row.status === 'superseded' || row.status === 'conflicted' || row.status === 'archived'
        ? row.status
        : 'active',
    projectKey: row.project_key == null ? null : String(row.project_key),
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    lastAccessedAt: row.last_accessed_at == null ? null : Number(row.last_accessed_at),
    tags: normalizeJson<string[]>(row.tags, []),
    supersedesId: row.supersedes_id == null ? null : String(row.supersedes_id),
  }
}

function readArchiveRecords(scope: MemoryScope, selector?: string | null, start?: number, end?: number): MemoryRecord[] {
  const filters: Parameters<typeof listMemoryRecords>[0] = {
    scope,
    status: EXPORT_STATUSES,
    limit: 50_000,
  }
  if (scope === 'project' && selector) filters.projectKey = selector
  if (scope === 'session' && selector) filters.conversationId = selector
  return listMemoryRecords(filters)
    .filter((record) => (start === undefined || record.createdAt >= start) && (end === undefined || record.createdAt <= end))
    .sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
}

function normalizeArchiveTimeWindow(start?: string, end?: string): ArchiveTimeWindow {
  const startRaw = start?.trim() || undefined
  const endRaw = end?.trim() || undefined
  const parsedStart = startRaw ? Date.parse(startRaw) : undefined
  const parsedEnd = endRaw ? Date.parse(endRaw) : undefined

  if (startRaw && (parsedStart === undefined || !Number.isFinite(parsedStart))) {
    throw new Error('Invalid export start time: ' + startRaw)
  }
  if (endRaw && (parsedEnd === undefined || !Number.isFinite(parsedEnd))) {
    throw new Error('Invalid export end time: ' + endRaw)
  }
  if (parsedStart !== undefined && parsedEnd !== undefined && parsedStart > parsedEnd) {
    throw new Error('Export start must be before export end')
  }

  return { start: parsedStart, end: parsedEnd, startRaw, endRaw }
}

function collectAttachmentIdsFromRecords(records: MemoryRecord[]): Set<string> {
  const ids = new Set<string>()
  for (const record of records) {
    collectAttachmentIdsFromValue(record.payload, ids)
  }
  return ids
}

function collectAttachmentIdsFromValue(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectAttachmentIdsFromValue(entry, ids)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'attachmentId' && typeof entry === 'string' && entry.trim()) {
      ids.add(entry.trim())
      continue
    }
    if (key === 'attachmentIds' && Array.isArray(entry)) {
      for (const attachmentId of entry) {
        if (typeof attachmentId === 'string' && attachmentId.trim()) ids.add(attachmentId.trim())
      }
      continue
    }
    collectAttachmentIdsFromValue(entry, ids)
  }
}

function filterAttachmentsByIds<T extends { id: string }>(attachments: T[], referencedIds: Set<string>): T[] {
  if (referencedIds.size === 0) return []
  return attachments.filter((attachment) => referencedIds.has(attachment.id))
}

function readManifest(zip: JSZip): Promise<MemoryPackArchiveManifest> {
  const file = zip.file(MANIFEST_FILE)
  if (!file) throw new Error('Missing manifest.json')
  return file.async('string').then((text) => JSON.parse(text) as MemoryPackArchiveManifest)
}

function validateManifest(manifest: MemoryPackArchiveManifest): void {
  if (manifest.format !== ARCHIVE_FORMAT) {
    throw new Error(`Unsupported archive format: ${String((manifest as { format?: string }).format)}`)
  }
  if (manifest.version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported archive version: ${String((manifest as { version?: number }).version)}`)
  }
}

function readArchiveText(zip: JSZip, name: string): Promise<string> {
  const file = zip.file(name)
  if (!file) return Promise.resolve('')
  return file.async('string')
}

function remapRecordForTarget(
  sourceRecord: ArchiveRecord,
  targetConversationId: string,
  targetProjectKey: string | null,
  attachmentIdMap: Map<string, string>,
): ArchiveRecord {
  return {
    ...sourceRecord,
    conversationId: sourceRecord.scope === 'core' ? null : targetConversationId,
    projectKey: sourceRecord.scope === 'core' ? null : targetProjectKey,
    payload: remapPayloadAttachments(sourceRecord.payload, attachmentIdMap) as Record<string, unknown>,
  }
}

function remapPayloadAttachments(value: unknown, attachmentIdMap: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => remapPayloadAttachments(item, attachmentIdMap))
  }
  if (!value || typeof value !== 'object') return value

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(input)) {
    if (key === 'attachmentId' && typeof entry === 'string') {
      output[key] = attachmentIdMap.get(entry) ?? entry
      continue
    }
    if (key === 'attachmentIds' && Array.isArray(entry)) {
      output[key] = entry.map((item) => (typeof item === 'string' ? attachmentIdMap.get(item) ?? item : item))
      continue
    }
    output[key] = remapPayloadAttachments(entry, attachmentIdMap)
  }
  return output
}

function resolveImportedReferenceId(sourceId: string | null | undefined, idMap: Map<string, string>): string | null {
  if (!sourceId) return null
  const mapped = idMap.get(sourceId)
  if (mapped) return mapped
  return getMemoryRecordById(sourceId) ? sourceId : null
}

function findExactMemoryRecord(candidate: ArchiveRecord): MemoryRecord | null {
  const namespace = candidate.scope === 'project' ? candidate.projectKey : candidate.scope === 'session' ? candidate.conversationId : undefined
  const records = readArchiveRecords(candidate.scope, namespace)
  return records.find((existing) => isSameMemoryRecord(existing, candidate)) ?? null
}

function isSameMemoryRecord(existing: MemoryRecord, candidate: ArchiveRecord): boolean {
  return (
    existing.scope === candidate.scope &&
    existing.kind === candidate.kind &&
    existing.text === candidate.text &&
    JSON.stringify(existing.payload ?? {}) === JSON.stringify(candidate.payload ?? {}) &&
    existing.source === candidate.source &&
    existing.sourceRef === (candidate.sourceRef ?? null) &&
    existing.importance === candidate.importance &&
    existing.confidence === candidate.confidence &&
    existing.status === candidate.status &&
    existing.projectKey === (candidate.projectKey ?? null) &&
    existing.conversationId === (candidate.conversationId ?? null) &&
    existing.createdAt === candidate.createdAt &&
    existing.updatedAt === candidate.updatedAt &&
    JSON.stringify(existing.tags ?? []) === JSON.stringify(candidate.tags ?? []) &&
    existing.supersedesId === (candidate.supersedesId ?? null)
  )
}

function getMemoryRecordById(id: string): MemoryRecord | null {
  const row = sqlite.prepare('SELECT * FROM memory_records WHERE id = ? LIMIT 1').get(id) as Record<string, unknown> | undefined
  return row ? rowToMemoryRecord(row) : null
}

function newMemoryRecordId(): string {
  return `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

async function restoreAttachmentFromArchive(input: {
  attachment: MemoryPackArchiveAttachmentEntry
  bytes: Buffer
  targetConversationId: string
  targetWorkspaceRoot: string
}): Promise<AttachmentRestoreResult> {
  const existingById = await db.query.attachments.findFirst({
    where: eq(schema.attachments.id, input.attachment.id),
  })
  if (existingById && isSameAttachment(existingById, input.attachment, input.targetConversationId)) {
    const absPath = resolveAttachmentPath(input.targetWorkspaceRoot, existingById.filePath)
    writeFileWithinWorkspace(input.targetWorkspaceRoot, absPath, input.bytes)
    return { id: existingById.id, reused: true, remapped: false }
  }

  const exactExisting = await findExactAttachment(input.targetConversationId, input.attachment)
  if (exactExisting) {
    const absPath = resolveAttachmentPath(input.targetWorkspaceRoot, exactExisting.filePath)
    writeFileWithinWorkspace(input.targetWorkspaceRoot, absPath, input.bytes)
    return { id: exactExisting.id, reused: true, remapped: exactExisting.id !== input.attachment.id }
  }

  const finalId = existingById ? newAttachmentId() : input.attachment.id
  const ext = safeAttachmentExt(input.attachment.fileName)
  const filePath = path.posix.join('uploads', `${finalId}${ext}`)
  const absPath = resolveAttachmentPath(input.targetWorkspaceRoot, filePath)
  writeFileWithinWorkspace(input.targetWorkspaceRoot, absPath, input.bytes)

  await db.insert(schema.attachments).values({
    id: finalId,
    conversationId: input.targetConversationId,
    kind: input.attachment.kind,
    fileName: input.attachment.fileName,
    filePath,
    size: input.attachment.size,
    mimeType: input.attachment.mimeType,
    createdAt: input.attachment.createdAt,
  })

  return { id: finalId, reused: false, remapped: finalId !== input.attachment.id }
}

async function findExactAttachment(
  conversationId: string,
  candidate: MemoryPackArchiveAttachmentEntry,
): Promise<AttachmentRow | null> {
  const rows = await listAttachments(conversationId)
  return rows.find((row) => isSameAttachment(row, candidate, conversationId)) ?? null
}

function isSameAttachment(
  existing: AttachmentRow,
  candidate: MemoryPackArchiveAttachmentEntry,
  conversationId: string,
): boolean {
  return (
    existing.conversationId === conversationId &&
    existing.kind === candidate.kind &&
    existing.fileName === candidate.fileName &&
    existing.size === candidate.size &&
    existing.mimeType === candidate.mimeType &&
    existing.createdAt === candidate.createdAt
  )
}

function resolveAttachmentPath(rootPath: string, filePath: string): string {
  const resolved = path.resolve(path.join(rootPath, filePath))
  if (!isPathWithin(resolved, rootPath)) {
    throw new Error('Path traversal detected while restoring attachment')
  }
  return resolved
}

function writeFileWithinWorkspace(rootPath: string, absPath: string, bytes: Buffer): void {
  if (!isPathWithin(path.resolve(absPath), rootPath)) {
    throw new Error('Path traversal detected while restoring attachment')
  }
  mkdirSync(path.dirname(absPath), { recursive: true })
  writeFileSync(absPath, bytes)
}

function toBuffer(input: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof ArrayBuffer) return Buffer.from(input)
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength)
}
