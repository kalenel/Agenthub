import { Buffer } from 'node:buffer'

import {
  buildMemoryPack,
  findLatestMemoryRecord,
  getMemoryStats,
  getProgressLedger as readProgressLedger,
  getTransitionLedger as readTransitionLedger,
  inferMemoryKindFromType,
  inferMemoryScopeFromType,
  listMemoryRecords,
  recordMemoryRecord,
  searchMemoryRecords,
  type MemoryPack,
  type MemoryPackInput,
  type MemoryRecord,
  type MemoryRecipient,
  type MemoryScope,
  type ProgressLedgerQuery,
  type ProgressLedgerResult,
  type TransitionLedgerQuery,
  type TransitionLedgerResult,
} from './memory-store'
import {
  recordConversationTransition,
  recordDispatchMemory,
  recordProgressMemory,
  recordStructuredMemory,
  recordTransitionLedger,
  resolveConversationMemoryContext,
  type ProgressMemoryInput,
  type StructuredMemoryInput,
  type TransitionLedgerInput,
} from './structured-memory'
import * as legacyCore from './core'

export interface YiMemoryEntry {
  type: string
  time: string
  content: string
}

export interface YiGetMemoryPackInput {
  mode?: MemoryPackInput['mode']
  query?: string
  projectKey?: string | null
  conversationId?: string | null
  limit?: number
  maxTokens?: number
  recipient?: MemoryRecipient
}

export interface YiMemoryPackResult {
  mode: MemoryPackInput['mode']
  conversationId: string | null
  projectKey: string | null
  recipient: MemoryRecipient
  pack: MemoryPack
}

async function resolveProjectKey(conversationId: string | null, projectKey?: string | null): Promise<string | null> {
  if (projectKey !== undefined) return projectKey
  if (!conversationId) return null
  const ctx = await resolveConversationMemoryContext(conversationId)
  return ctx.projectKey
}

function toYiMemoryEntry(record: MemoryRecord): YiMemoryEntry {
  return {
    type: (record.payload?.legacyType as string | undefined) ?? `${record.scope}:${record.kind}`,
    time: new Date(record.updatedAt || record.createdAt).toISOString(),
    content: record.text,
  }
}

function parseScopeFromType(type: string): MemoryScope {
  return inferMemoryScopeFromType(type)
}

function parseKindFromType(type: string): string {
  return inferMemoryKindFromType(type)
}

function isMemoryRecipient(value: unknown): value is MemoryRecipient {
  return value === 'model' || value === 'subagent' || value === 'window' || value === 'ui' || value === 'search'
}

function defaultModeForRecipient(recipient: MemoryRecipient): MemoryPackInput['mode'] {
  switch (recipient) {
    case 'subagent':
      return 'subagent'
    case 'search':
      return 'search'
    case 'window':
    case 'ui':
      return 'chat'
    case 'model':
    default:
      return 'coding'
  }
}

function defaultRecipientForMode(mode?: MemoryPackInput['mode']): MemoryRecipient {
  switch (mode) {
    case 'subagent':
      return 'subagent'
    case 'chat':
    case 'report':
      return 'ui'
    case 'search':
      return 'search'
    default:
      return 'model'
  }
}

function normalizeMemoryMode(value: unknown, recipient: MemoryRecipient): MemoryPackInput['mode'] {
  if (
    value === 'coding' ||
    value === 'chat' ||
    value === 'report' ||
    value === 'recovery' ||
    value === 'subagent' ||
    value === 'search'
  ) {
    return value
  }
  return defaultModeForRecipient(recipient)
}

function normalizeMemoryRecipient(value: unknown): MemoryRecipient | undefined {
  return isMemoryRecipient(value) ? value : undefined
}

export function yiSaveMemory(type: string, content: string) {
  const scope = parseScopeFromType(type)
  const kind = parseKindFromType(type)
  const text = content.trim()
  const record = recordMemoryRecord(
    {
      scope,
      kind,
      text,
      payload: { legacyType: type, source: 'yi_save_memory' },
      source: 'memory',
      sourceRef: `save_memory:${Date.now()}`,
      importance: scope === 'core' ? 5 : kind === 'progress' ? 4 : kind === 'transition' ? 3 : 1,
      confidence: 95,
      tags: ['memory', type, kind],
    },
    { dedupe: true },
  )
  return { ok: true, total: getMemoryStats().total, record: toYiMemoryEntry(record) }
}

export function yiRecallMemory(query: string, limit = 10, scope?: MemoryScope) {
  const results = searchMemoryRecords(query, limit, scope).map(toYiMemoryEntry)
  return { query, count: results.length, results }
}

export function yiSemanticSearch(query: string, limit = 8, threshold = 0, scope?: MemoryScope) {
  const results = searchMemoryRecords(query, limit, scope).map((record) => ({
    ...toYiMemoryEntry(record),
    relevance: Math.max(
      threshold,
      Math.round(
        ((record.importance + Math.min(10, record.confidence / 10) + Math.max(0, 24 - Math.floor((Date.now() - record.updatedAt) / 3600000))) / 50) *
          100,
      ) / 100,
    ),
  }))
  return { query, count: results.length, results: results.filter((item) => item.relevance >= threshold) }
}

export async function yiGetMemoryPack(input: YiGetMemoryPackInput): Promise<YiMemoryPackResult> {
  const recipient = normalizeMemoryRecipient(input.recipient) ?? defaultRecipientForMode(input.mode)
  const mode = normalizeMemoryMode(input.mode, recipient)
  const conversationId = input.conversationId ?? null
  const projectKey = await resolveProjectKey(conversationId, input.projectKey)

  const pack = buildMemoryPack({
    mode,
    query: input.query,
    projectKey,
    conversationId,
    limit: input.limit,
    maxTokens: input.maxTokens,
    recipient,
  })

  return { mode, conversationId, projectKey, recipient, pack }
}

export async function yiGetProgressLedger(input: ProgressLedgerQuery): Promise<ProgressLedgerResult> {
  const conversationId = input.conversationId ?? null
  const projectKey = await resolveProjectKey(conversationId, input.projectKey)
  return readProgressLedger({
    ...input,
    conversationId,
    projectKey,
  })
}

export async function yiGetTransitionLedger(input: TransitionLedgerQuery): Promise<TransitionLedgerResult> {
  const conversationId = input.conversationId ?? null
  const projectKey = await resolveProjectKey(conversationId, input.projectKey)
  return readTransitionLedger({
    ...input,
    conversationId,
    projectKey,
  })
}

export function yiGetTimeline(type?: string, start?: string, end?: string) {
  const kinds = type ? [parseKindFromType(type), type] : undefined
  let records = listMemoryRecords({
    kind: kinds,
    status: ['active', 'superseded', 'conflicted', 'archived'],
    limit: 2000,
  })
  if (start) {
    const startTs = Date.parse(start)
    if (Number.isFinite(startTs)) records = records.filter((record) => record.createdAt >= startTs)
  }
  if (end) {
    const endTs = Date.parse(end)
    if (Number.isFinite(endTs)) records = records.filter((record) => record.createdAt <= endTs)
  }
  records.sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt)

  const timeline: { date: string; count: number; entries: YiMemoryEntry[] }[] = []
  let currentDate = ''
  let bucket: YiMemoryEntry[] = []
  for (const record of records) {
    const date = new Date(record.createdAt).toISOString().slice(0, 10)
    if (date !== currentDate) {
      if (bucket.length > 0) timeline.push({ date: currentDate, count: bucket.length, entries: bucket })
      currentDate = date
      bucket = []
    }
    bucket.push(toYiMemoryEntry(record))
  }
  if (bucket.length > 0) timeline.push({ date: currentDate, count: bucket.length, entries: bucket })

  return {
    total: records.length,
    days: timeline.length,
    span: records.length
      ? `${new Date(records[0].createdAt).toISOString().slice(0, 19).replace('T', ' ')} -> ${new Date(records[records.length - 1].createdAt)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ')}`
      : 'none',
    timeline,
  }
}

export function yiSaveTask(title: string, status: 'pending' | 'in_progress' | 'done' = 'pending', detail = '') {
  return legacyCore.yiSaveTask(title, status, detail)
}

export function yiGetTasks(status?: string) {
  return legacyCore.yiGetTasks(status)
}

export function yiUpdateTask(title: string, status?: string, detail?: string) {
  return legacyCore.yiUpdateTask(title, status, detail)
}

export function yiGetIdentity() {
  const records = listMemoryRecords({ scope: 'core', status: 'active', limit: 200 })
  const filtered = records.filter((record) => ['fact', 'relationship', 'preference'].includes(record.kind))
  return { count: filtered.length, results: filtered.map(toYiMemoryEntry) }
}

export function yiGetRecent(n = 10) {
  const records = listMemoryRecords({ status: 'active', limit: n })
  return { count: Math.min(records.length, n), results: records.slice(0, n).map(toYiMemoryEntry) }
}

export function yiGetAll() {
  const records = listMemoryRecords({ status: 'active', limit: 5000 })
  return { count: records.length, results: records.map(toYiMemoryEntry) }
}

export function yiGetStats() {
  const stats = getMemoryStats()
  const records = listMemoryRecords({ status: 'active', limit: 5000 })
  const kinds: Record<string, number> = {}
  for (const record of records) {
    kinds[record.kind] = (kinds[record.kind] ?? 0) + 1
  }
  const sizeBytes = Buffer.byteLength(JSON.stringify(records.map((record) => record.text)), 'utf8')
  const tasks = legacyCore.yiGetTasks()
  return {
    total: stats.total,
    types: kinds,
    byScope: stats.byScope,
    sizeBytes,
    sizeKB: (sizeBytes / 1024).toFixed(1),
    tasks_total: tasks.total,
    tasks_done: tasks.summary.done,
  }
}

export function yiLocalStatus() {
  return legacyCore.yiLocalStatus()
}

export function yiGetCheckpoint() {
  return legacyCore.yiGetCheckpoint()
}

export function yiUpdateCheckpoint(args: { last_core_index?: number; last_save_time?: string }) {
  return legacyCore.yiUpdateCheckpoint(args)
}

export function yiSaveState(args: { task?: string; status?: string; next?: string; files?: string[] }) {
  return legacyCore.yiSaveState(args)
}

export function yiGetState() {
  return legacyCore.yiGetState()
}

export function yiSaveEnvironment() {
  return legacyCore.yiSaveEnvironment()
}

export function yiGetEnvironment() {
  return legacyCore.yiGetEnvironment()
}

export function yiScanBackups(limit = 20) {
  return legacyCore.yiScanBackups(limit)
}

export function yiScanText(text: string, limit = 10) {
  return legacyCore.yiScanText(text, limit)
}

export async function yiRecordMemory(input: StructuredMemoryInput): Promise<MemoryRecord> {
  const projectKey = await resolveProjectKey(input.conversationId ?? null, input.projectKey)
  return recordStructuredMemory({ ...input, projectKey })
}

export async function yiRecordProgressMemory(input: ProgressMemoryInput): Promise<MemoryRecord> {
  const projectKey = await resolveProjectKey(input.conversationId ?? null, input.projectKey)
  return recordProgressMemory({ ...input, projectKey })
}

export async function yiRecordTransitionLedger(input: TransitionLedgerInput): Promise<MemoryRecord> {
  const projectKey = await resolveProjectKey(input.conversationId ?? null, input.projectKey)
  return recordTransitionLedger({ ...input, projectKey })
}

export function yiRecordTransition(input: {
  conversationId: string
  fromConversationId?: string | null
  source: string
  reason: string
  trigger?: string | null
  recipient?: MemoryRecipient
}) {
  return recordConversationTransition(input)
}

export function yiRecordDispatch(input: {
  conversationId: string
  taskId: string
  status: 'progress' | 'complete' | 'failed' | 'blocked' | 'aborted'
  text: string
  source: string
  projectKey?: string | null
  progress?: unknown
  error?: string
  recipient?: MemoryRecipient
}) {
  return recordDispatchMemory(input)
}

export {
  buildMemoryPack,
  findLatestMemoryRecord,
  recordConversationTransition,
  recordDispatchMemory,
  recordMemoryRecord,
  recordProgressMemory,
  recordStructuredMemory,
  recordTransitionLedger,
  resolveConversationMemoryContext,
}
