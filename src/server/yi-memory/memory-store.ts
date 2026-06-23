import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { estimateTokens } from '@/shared/model-registry'
import { sqlite } from '@/db/client'

const LEGACY_USB = join('F:', '蹇嗙殑璁板繂')
const LEGACY_LOCAL = join(process.env.USERPROFILE || 'C:', 'Users', 'xiong', 'Documents', 'Codex', '蹇嗙殑璁板繂')
const LEGACY_MEMORY_FILE = '蹇嗙殑鑷垜.jsonl'

const CREATE_MEMORY_TABLE = `
  CREATE TABLE IF NOT EXISTS memory_records (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL,
    source_ref TEXT,
    importance INTEGER NOT NULL DEFAULT 0,
    confidence INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'active',
    project_key TEXT,
    conversation_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    supersedes_id TEXT REFERENCES memory_records(id) ON DELETE SET NULL
  )
`

const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_memory_scope_created ON memory_records(scope, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_project_created ON memory_records(project_key, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_conversation_created ON memory_records(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_status_created ON memory_records(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_supersedes ON memory_records(supersedes_id)`,
]

sqlite.exec(CREATE_MEMORY_TABLE)
for (const stmt of CREATE_INDEXES) sqlite.exec(stmt)

export type MemoryScope = 'core' | 'project' | 'session'
export type MemoryStatus = 'active' | 'superseded' | 'conflicted' | 'archived'
export type MemoryRecipient = 'model' | 'subagent' | 'window' | 'ui' | 'search'

export interface MemoryRecord {
  id: string
  scope: MemoryScope
  kind: string
  text: string
  payload: Record<string, unknown>
  source: string
  sourceRef: string | null
  importance: number
  confidence: number
  status: MemoryStatus
  projectKey: string | null
  conversationId: string | null
  createdAt: number
  updatedAt: number
  lastAccessedAt: number | null
  tags: string[]
  supersedesId: string | null
  whyLoaded?: string[]
}

export interface NewMemoryRecord {
  scope: MemoryScope
  id?: string
  kind: string
  text: string
  payload?: Record<string, unknown>
  source: string
  sourceRef?: string | null
  importance?: number
  confidence?: number
  status?: MemoryStatus
  projectKey?: string | null
  conversationId?: string | null
  tags?: string[]
  supersedesId?: string | null
  createdAt?: number
  updatedAt?: number
}

export interface MemoryPackInput {
  mode: 'coding' | 'chat' | 'report' | 'recovery' | 'subagent' | 'search'
  query?: string
  projectKey?: string | null
  conversationId?: string | null
  limit?: number
  maxTokens?: number
  recipient?: MemoryRecipient
}

export interface MemoryPack {
  mode: MemoryPackInput['mode']
  records: MemoryRecord[]
  counts: { session: number; project: number; core: number }
  queryHits: number
  recipient?: MemoryRecipient
  highlights?: MemoryPackHighlights
}

export interface MemoryPackCheckpointHighlight {
  id: string
  itemId: string | null
  episodeId: string | null
  checkpointId: string | null
  latestCheckpoint: string | null
  previousCheckpointId: string | null
  summary: string
  status: string
  blockedReason: string | null
  nextAction: string | null
  evidenceRef: string | null
  updatedAt: number
}

export interface MemoryPackTransitionHighlight {
  id: string
  transitionId: string | null
  fromState: string | null
  toState: string | null
  reason: string
  trigger: string | null
  scopeImpact: string | null
  recoveryTarget: string | null
  timestamp: number
}

export interface MemoryPackHighlights {
  latestCheckpoint: MemoryPackCheckpointHighlight | null
  blockers: MemoryPackCheckpointHighlight[]
  keyTransitions: MemoryPackTransitionHighlight[]
  evidenceRefs: string[]
}

export interface ProgressLedgerQuery {
  conversationId?: string | null
  projectKey?: string | null
  itemId?: string | null
  episodeId?: string | null
  checkpointId?: string | null
  limit?: number
}

export interface ProgressLedgerResult {
  count: number
  latestCheckpoint: MemoryPackCheckpointHighlight | null
  blockers: MemoryPackCheckpointHighlight[]
  records: MemoryRecord[]
  highlights: MemoryPackHighlights | undefined
}

export interface TransitionLedgerQuery {
  conversationId?: string | null
  projectKey?: string | null
  transitionId?: string | null
  fromState?: string | null
  toState?: string | null
  limit?: number
}

export interface TransitionLedgerResult {
  count: number
  records: MemoryRecord[]
  highlights: MemoryPackHighlights | undefined
}

export interface MemoryRecordFilters {
  scope?: MemoryScope | MemoryScope[]
  kind?: string | string[]
  projectKey?: string | null
  conversationId?: string | null
  sourceRef?: string | null
  status?: MemoryStatus | MemoryStatus[]
  limit?: number
}

export interface MemoryRecordWriteOptions {
  dedupe?: boolean
  supersedeLatest?: boolean
  latestFilters?: Omit<MemoryRecordFilters, 'limit'>
}

interface LegacyMemoryRow {
  type: string
  time: string
  content: string
}

let hydratedLegacy = false

function now(): number {
  return Date.now()
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeTags(tags?: string[]): string[] {
  return Array.isArray(tags)
    ? [...new Set(tags.filter((tag) => typeof tag === 'string' && tag.trim()))]
    : []
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowToRecord(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    scope: row.scope === 'project' || row.scope === 'session' ? row.scope : 'core',
    kind: String(row.kind ?? ''),
    text: String(row.text ?? ''),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
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
    tags: parseJson<string[]>(row.tags, []),
    supersedesId: row.supersedes_id == null ? null : String(row.supersedes_id),
  }
}

function recordToRow(record: NewMemoryRecord): Record<string, unknown> {
  const createdAt = record.createdAt ?? now()
  const updatedAt = record.updatedAt ?? createdAt
  const id = record.id ?? randomUUID()
  return {
    id,
    scope: record.scope,
    kind: record.kind.trim(),
    text: normalizeText(record.text),
    payload: JSON.stringify(record.payload ?? {}),
    source: record.source.trim(),
    source_ref: record.sourceRef ?? null,
    importance: record.importance ?? 0,
    confidence: record.confidence ?? 100,
    status: record.status ?? 'active',
    project_key: record.projectKey ?? null,
    conversation_id: record.conversationId ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    last_accessed_at: null,
    tags: JSON.stringify(normalizeTags(record.tags)),
    supersedes_id: record.supersedesId ?? null,
  }
}

function getLegacyMemoryPath(): string {
  const usb = join(LEGACY_USB, LEGACY_MEMORY_FILE)
  return existsSync(usb) ? usb : join(LEGACY_LOCAL, LEGACY_MEMORY_FILE)
}

function loadLegacyMemoryRows(): LegacyMemoryRow[] {
  const path = getLegacyMemoryPath()
  if (!existsSync(path)) return []
  const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').trim()
  if (!raw) return []
  return raw
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line) as LegacyMemoryRow
      } catch {
        return null
      }
    })
    .filter((entry): entry is LegacyMemoryRow => Boolean(entry))
}

function normalizeScopeFromType(type: string): MemoryScope {
  const t = type.toLowerCase()
  if (/(core|身份|关系|偏好|原则|价值|长期|记忆)/.test(t)) return 'core'
  if (/(progress|checkpoint|进度|状态|blocked|blocker|里程碑|project|恢复|任务|incident|故障|异常)/.test(t)) {
    return 'project'
  }
  return 'session'
}

function normalizeKindFromType(type: string): string {
  const t = type.toLowerCase()
  if (/(progress|checkpoint|进度|状态|blocked|blocker|里程碑|恢复)/.test(t)) return 'progress'
  if (/(transition|切换|迁移|provenance|why|from|入口|窗口)/.test(t)) return 'transition'
  if (/(incident|故障|异常|错误|失败|阻塞|crash|bug)/.test(t)) return 'incident'
  if (/(decision|决定|决策|chosen|choice)/.test(t)) return 'decision'
  if (/(summary|摘要|总结|概览|overview)/.test(t)) return 'summary'
  if (/(relationship|关系|协作|agent|window|群聊)/.test(t)) return 'relationship'
  if (/(warning|警告|注意)/.test(t)) return 'warning'
  if (/(preference|偏好|习惯|喜欢)/.test(t)) return 'preference'
  if (/(task|任务|todo)/.test(t)) return 'task'
  if (/(fact|事实|身份|原则|长期)/.test(t)) return 'fact'
  return 'note'
}

function legacyRowToRecord(row: LegacyMemoryRow): NewMemoryRecord {
  const ts = Date.parse(row.time)
  const createdAt = Number.isFinite(ts) ? ts : now()
  const scope = normalizeScopeFromType(row.type)
  const kind = normalizeKindFromType(row.type)
  return {
    scope,
    kind,
    text: row.content,
    payload: { legacyType: row.type, legacyTime: row.time, source: 'legacy_jsonl' },
    source: 'memory',
    sourceRef: `legacy:${row.time}`,
    importance: scope === 'core' ? 5 : kind === 'progress' ? 4 : kind === 'transition' ? 3 : 1,
    confidence: 90,
    tags: ['legacy', row.type, kind],
    createdAt,
    updatedAt: createdAt,
  }
}

function hydrateLegacyRowsIfNeeded(): void {
  if (hydratedLegacy) return
  const countRow = sqlite.prepare('SELECT COUNT(1) AS count FROM memory_records').get() as { count: number }
  hydratedLegacy = true
  if (countRow.count > 0) return

  const seen = new Set<string>()
  for (const legacyRow of loadLegacyMemoryRows()) {
    const record = legacyRowToRecord(legacyRow)
    const signature = [
      record.scope,
      record.kind,
      normalizeText(record.text),
      record.source,
      record.sourceRef ?? '',
      record.projectKey ?? '',
      record.conversationId ?? '',
      JSON.stringify(record.payload ?? {}),
      JSON.stringify(normalizeTags(record.tags)),
    ].join('::')
    if (seen.has(signature)) continue
    seen.add(signature)
    rawInsertMemoryRecord(record)
  }
}

function buildWhereClause(filters: MemoryRecordFilters): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.scope) {
    const scopes = Array.isArray(filters.scope) ? filters.scope : [filters.scope]
    clauses.push(`scope IN (${scopes.map(() => '?').join(', ')})`)
    params.push(...scopes)
  }
  if (filters.kind) {
    const kinds = Array.isArray(filters.kind) ? filters.kind : [filters.kind]
    clauses.push(`kind IN (${kinds.map(() => '?').join(', ')})`)
    params.push(...kinds.map((kind) => kind.trim()))
  }
  if (filters.projectKey !== undefined) {
    clauses.push(filters.projectKey === null ? 'project_key IS NULL' : 'project_key = ?')
    if (filters.projectKey !== null) params.push(filters.projectKey)
  }
  if (filters.conversationId !== undefined) {
    clauses.push(filters.conversationId === null ? 'conversation_id IS NULL' : 'conversation_id = ?')
    if (filters.conversationId !== null) params.push(filters.conversationId)
  }
  if (filters.sourceRef !== undefined) {
    clauses.push(filters.sourceRef === null ? 'source_ref IS NULL' : 'source_ref = ?')
    if (filters.sourceRef !== null) params.push(filters.sourceRef)
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`)
    params.push(...statuses)
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function queryMemoryRecords(
  filters: MemoryRecordFilters = {},
  orderBy = 'importance DESC, updated_at DESC, created_at DESC',
  limit = filters.limit ?? 100,
): MemoryRecord[] {
  hydrateLegacyRowsIfNeeded()
  if (limit <= 0) return []
  const { where, params } = buildWhereClause(filters)
  const rows = sqlite
    .prepare(`SELECT * FROM memory_records ${where} ORDER BY ${orderBy} LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[]
  return rows.map(rowToRecord)
}

function touchMemoryRecords(ids: string[]): void {
  if (ids.length === 0) return
  const placeholder = ids.map(() => '?').join(', ')
  sqlite
    .prepare(`UPDATE memory_records SET last_accessed_at = ? WHERE id IN (${placeholder})`)
    .run(now(), ...ids)
}

export function inferMemoryScopeFromType(type: string): MemoryScope {
  return normalizeScopeFromType(type)
}

export function inferMemoryKindFromType(type: string): string {
  return normalizeKindFromType(type)
}

export function insertMemoryRecord(record: NewMemoryRecord): MemoryRecord {
  hydrateLegacyRowsIfNeeded()
  return rawInsertMemoryRecord(record)
}

function rawInsertMemoryRecord(record: NewMemoryRecord): MemoryRecord {
  const row = recordToRow(record)
  sqlite
    .prepare(
      `INSERT INTO memory_records (
        id, scope, kind, text, payload, source, source_ref,
        importance, confidence, status, project_key, conversation_id,
        created_at, updated_at, last_accessed_at, tags, supersedes_id
      ) VALUES (
        @id, @scope, @kind, @text, @payload, @source, @source_ref,
        @importance, @confidence, @status, @project_key, @conversation_id,
        @created_at, @updated_at, @last_accessed_at, @tags, @supersedes_id
      )`,
    )
    .run(row)

  if (row.supersedes_id) {
    sqlite
      .prepare(`UPDATE memory_records SET status = 'superseded', updated_at = ? WHERE id = ? AND status = 'active'`)
      .run(row.updated_at, row.supersedes_id)
  }

  return rowToRecord(row)
}

export function listMemoryRecords(filters: MemoryRecordFilters = {}): MemoryRecord[] {
  return queryMemoryRecords(filters)
}

export function findLatestMemoryRecord(filters: Omit<MemoryRecordFilters, 'limit'> = {}): MemoryRecord | null {
  const records = queryMemoryRecords({ ...filters, status: filters.status ?? 'active' }, 'updated_at DESC, created_at DESC', 1)
  return records[0] ?? null
}

function scoreMemoryKind(kind: string): number {
  switch (kind) {
    case 'progress':
      return 1000
    case 'transition':
      return 930
    case 'incident':
      return 900
    case 'decision':
      return 860
    case 'summary':
      return 820
    case 'fact':
      return 780
    case 'task':
      return 760
    case 'relationship':
      return 720
    case 'warning':
      return 680
    case 'preference':
      return 640
    default:
      return 500
  }
}

function scopeLimit(mode: MemoryPackInput['mode']): { session: number; project: number; core: number } {
  switch (mode) {
    case 'coding':
      return { session: 3, project: 2, core: 1 }
    case 'subagent':
      return { session: 4, project: 2, core: 1 }
    case 'search':
      return { session: 0, project: 0, core: 0 }
    case 'recovery':
      return { session: 10, project: 8, core: 6 }
    case 'report':
    case 'chat':
      return { session: 8, project: 6, core: 4 }
    default:
      return { session: 3, project: 2, core: 1 }
  }
}

function defaultMemoryPackBudgetForMode(mode: MemoryPackInput['mode']): number {
  switch (mode) {
    case 'chat':
    case 'report':
      return 2800
    case 'recovery':
      return 2200
    case 'coding':
      return 700
    case 'subagent':
      return 500
    case 'search':
      return 500
    default:
      return 700
  }
}

function expandedCandidateLimit(limit: number): number {
  return Math.max(12, limit * 4, limit + 8)
}

type MemoryPackSource = 'session' | 'project' | 'core' | 'query'

function describeMemoryPackSource(source: MemoryPackSource): string {
  switch (source) {
    case 'session':
      return 'session: current conversation'
    case 'project':
      return 'project: current workspace'
    case 'core':
      return 'core: stable global memory'
    case 'query':
      return 'query: search match'
  }
}

function buildMemoryLoadReasons(input: MemoryPackInput, source: MemoryPackSource): string[] {
  const reasons = [describeMemoryPackSource(source), `mode=${input.mode}`]
  if (input.recipient) reasons.push(`recipient=${input.recipient}`)
  if (source === 'query' && input.query?.trim()) reasons.push(`query=${input.query.trim()}`)
  return reasons
}

function annotateLoadedRecords(records: MemoryRecord[], input: MemoryPackInput, source: MemoryPackSource): MemoryRecord[] {
  const reasons = buildMemoryLoadReasons(input, source)
  return records.map((record) => ({ ...record, whyLoaded: reasons }))
}

function payloadString(record: MemoryRecord, key: string): string | null {
  const value = record.payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function payloadNumber(record: MemoryRecord, key: string): number | null {
  const value = record.payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function payloadStringArray(record: MemoryRecord, key: string): string[] {
  const value = record.payload[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function buildMemoryPackHighlights(records: MemoryRecord[]): MemoryPackHighlights | undefined {
  const progressRecords = records
    .filter((record) => record.kind === 'progress' || record.kind === 'incident')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const transitionRecords = records
    .filter((record) => record.kind === 'transition')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const latestCheckpointRecord = progressRecords[0] ?? null
  const blockers = progressRecords
    .filter((record) => payloadString(record, 'status') === 'blocked' || payloadString(record, 'blockedReason'))
    .slice(0, 3)
  const evidenceRefs = new Set<string>()
  for (const record of [...progressRecords, ...transitionRecords]) {
    for (const extraEvidenceRef of payloadStringArray(record, 'evidenceRefs')) evidenceRefs.add(extraEvidenceRef)
    const evidenceRef = payloadString(record, 'evidenceRef') ?? record.sourceRef
    if (evidenceRef) evidenceRefs.add(evidenceRef)
    if (evidenceRefs.size >= 5) break
  }
  if (!latestCheckpointRecord && blockers.length === 0 && transitionRecords.length === 0 && evidenceRefs.size === 0) return undefined
  return {
    latestCheckpoint: latestCheckpointRecord ? buildCheckpointHighlight(latestCheckpointRecord) : null,
    blockers: blockers.map(buildCheckpointHighlight),
    keyTransitions: transitionRecords.slice(0, 4).map(buildTransitionHighlight),
    evidenceRefs: [...evidenceRefs],
  }
}

function buildCheckpointHighlight(record: MemoryRecord): MemoryPackCheckpointHighlight {
  return {
    id: record.id,
    itemId: payloadString(record, 'itemId'),
    episodeId: payloadString(record, 'episodeId'),
    checkpointId: payloadString(record, 'checkpointId') ?? record.id,
    latestCheckpoint: payloadString(record, 'latestCheckpoint') ?? payloadString(record, 'checkpointId') ?? record.id,
    previousCheckpointId: payloadString(record, 'previousCheckpointId'),
    summary: record.text,
    status: payloadString(record, 'status') ?? record.status,
    blockedReason: payloadString(record, 'blockedReason'),
    nextAction: payloadString(record, 'nextAction'),
    evidenceRef: payloadString(record, 'evidenceRef') ?? record.sourceRef,
    updatedAt: record.updatedAt,
  }
}

function buildTransitionHighlight(record: MemoryRecord): MemoryPackTransitionHighlight {
  return {
    id: record.id,
    transitionId: payloadString(record, 'transitionId') ?? record.id,
    fromState: payloadString(record, 'fromState'),
    toState: payloadString(record, 'toState'),
    reason: record.text,
    trigger: payloadString(record, 'trigger'),
    scopeImpact: payloadString(record, 'scopeImpact'),
    recoveryTarget: payloadString(record, 'recoveryTarget'),
    timestamp: payloadNumber(record, 'timestamp') ?? record.updatedAt,
  }
}

function pickProgressRecords(input: ProgressLedgerQuery): MemoryRecord[] {
  const records = listMemoryRecords({
    kind: ['progress', 'incident'],
    conversationId: input.conversationId ?? undefined,
    projectKey: input.projectKey ?? undefined,
    status: ['active', 'superseded', 'conflicted', 'archived'],
    limit: Math.max(1, input.limit ?? 200),
  })
  const filtered = records.filter((record) => {
    if (input.itemId && payloadString(record, 'itemId') !== input.itemId) return false
    if (input.episodeId && payloadString(record, 'episodeId') !== input.episodeId) return false
    if (input.checkpointId && payloadString(record, 'checkpointId') !== input.checkpointId && record.id !== input.checkpointId) return false
    return true
  })
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

function pickTransitionRecords(input: TransitionLedgerQuery): MemoryRecord[] {
  const records = listMemoryRecords({
    kind: 'transition',
    conversationId: input.conversationId ?? undefined,
    projectKey: input.projectKey ?? undefined,
    status: ['active', 'superseded', 'conflicted', 'archived'],
    limit: Math.max(1, input.limit ?? 200),
  })
  const filtered = records.filter((record) => {
    if (input.transitionId && payloadString(record, 'transitionId') !== input.transitionId && record.id !== input.transitionId) return false
    if (input.fromState && payloadString(record, 'fromState') !== input.fromState) return false
    if (input.toState && payloadString(record, 'toState') !== input.toState) return false
    return true
  })
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

function scoreMemoryRecordForPack(record: MemoryRecord, input: MemoryPackInput): number {
  const recencyAnchor = Math.max(record.updatedAt, record.lastAccessedAt ?? 0, record.createdAt)
  const ageMinutes = Math.max(0, Math.floor((now() - recencyAnchor) / 60000))
  const freshness = Math.max(0, 240 - ageMinutes)

  const recipientBoost =
    input.recipient === 'subagent'
      ? record.kind === 'progress'
        ? 120
        : record.kind === 'transition'
          ? 100
          : record.kind === 'decision'
            ? 80
            : 0
      : input.recipient === 'window'
        ? record.kind === 'transition'
          ? 120
          : record.kind === 'summary'
            ? 100
            : record.kind === 'progress'
              ? 80
              : 0
        : input.recipient === 'ui'
          ? record.kind === 'summary'
            ? 120
            : record.kind === 'decision'
              ? 90
              : record.kind === 'fact'
                ? 70
                : 0
          : input.recipient === 'search'
            ? 40
            : 0

  const modeBoost =
    input.mode === 'coding'
      ? record.kind === 'progress'
        ? 120
        : record.kind === 'transition'
          ? 110
          : record.kind === 'decision'
            ? 100
            : record.kind === 'fact'
              ? 80
              : 0
      : input.mode === 'recovery'
        ? record.kind === 'transition'
          ? 140
          : record.kind === 'progress'
            ? 130
            : record.kind === 'incident'
              ? 120
              : record.kind === 'summary'
                ? 90
                : 0
        : input.mode === 'report' || input.mode === 'chat'
          ? record.kind === 'summary'
            ? 130
            : record.kind === 'transition'
              ? 110
              : record.kind === 'progress'
                ? 100
                : record.kind === 'decision'
                  ? 90
                  : 0
          : input.mode === 'subagent'
            ? record.kind === 'progress'
              ? 150
              : record.kind === 'transition'
                ? 130
                : record.kind === 'task'
                  ? 120
                  : record.kind === 'decision'
                    ? 100
                    : 0
            : 0

  const scopeBoost =
    input.mode === 'coding'
      ? record.scope === 'session'
        ? 300
        : record.scope === 'project'
          ? 220
          : 120
      : input.mode === 'recovery'
        ? record.scope === 'session'
          ? 320
          : record.scope === 'project'
            ? 260
            : 180
        : input.mode === 'report' || input.mode === 'chat'
          ? record.scope === 'session'
            ? 320
            : record.scope === 'project'
              ? 260
              : 200
          : input.mode === 'subagent'
            ? record.scope === 'session'
              ? 260
              : record.scope === 'project'
                ? 220
                : 160
            : 0

  return (
    scoreMemoryKind(record.kind) +
    recipientBoost +
    modeBoost +
    scopeBoost +
    record.importance * 12 +
    Math.floor(record.confidence / 10) +
    freshness
  )
}

function sortMemoryRecordsForPack(records: MemoryRecord[], input: MemoryPackInput): MemoryRecord[] {
  return [...records].sort((a, b) => {
    const scoreA = scoreMemoryRecordForPack(a, input)
    const scoreB = scoreMemoryRecordForPack(b, input)
    return scoreB - scoreA || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  })
}

export function searchMemoryRecords(query: string, limit = 10, scope?: MemoryScope): MemoryRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const candidateLimit = Math.max(200, limit * 40)
  const records = listMemoryRecords({ scope, status: 'active', limit: candidateLimit })
  const scored = records
    .map((record) => {
      const haystack = [
        record.kind,
        record.text,
        record.source,
        record.sourceRef ?? '',
        record.tags.join(' '),
        JSON.stringify(record.payload),
      ]
        .join(' ')
        .toLowerCase()
      const parts = q.split(/\s+/).filter(Boolean)
      let score = 0
      for (const part of parts) {
        if (haystack.includes(part)) score += 10
      }
      if (haystack.includes(q)) score += 25
      score += Math.min(12, record.importance)
      score += Math.min(8, Math.floor(record.confidence / 15))
      score += Math.max(
        0,
        24 - Math.floor((now() - Math.max(record.updatedAt, record.lastAccessedAt ?? 0, record.createdAt)) / 3600000),
      )
      return { record, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.record.updatedAt - a.record.updatedAt || b.record.createdAt - a.record.createdAt)
    .slice(0, limit)

  const hits = scored.map(({ record }) => record)
  touchMemoryRecords(hits.map((record) => record.id))
  return hits
}

function buildUntrimmedMemoryPack(input: MemoryPackInput): MemoryPack {
  const limit = scopeLimit(input.mode)
  const queryRecords = input.query?.trim() ? searchMemoryRecords(input.query, input.limit ?? 20) : []
  const annotatedQueryRecords = annotateLoadedRecords(queryRecords, input, 'query')

  if (input.mode === 'search') {
    return {
      mode: input.mode,
      records: annotatedQueryRecords,
      counts: { session: 0, project: 0, core: 0 },
      queryHits: annotatedQueryRecords.length,
      recipient: input.recipient,
      highlights: buildMemoryPackHighlights(annotatedQueryRecords),
    }
  }

  const sessionCandidates = listMemoryRecords({
    scope: 'session',
    conversationId: input.conversationId ?? null,
    status: 'active',
    limit: expandedCandidateLimit(limit.session),
  })
  const projectCandidates = listMemoryRecords({
    scope: 'project',
    projectKey: input.projectKey ?? null,
    status: 'active',
    limit: expandedCandidateLimit(limit.project),
  })
  const coreCandidates = listMemoryRecords({ scope: 'core', status: 'active', limit: expandedCandidateLimit(limit.core) })

  const sessionRecords = annotateLoadedRecords(sortMemoryRecordsForPack(sessionCandidates, input).slice(0, limit.session), input, 'session')
  const projectRecords = annotateLoadedRecords(sortMemoryRecordsForPack(projectCandidates, input).slice(0, limit.project), input, 'project')
  const coreRecords = annotateLoadedRecords(sortMemoryRecordsForPack(coreCandidates, input).slice(0, limit.core), input, 'core')

  const merged: MemoryRecord[] = []
  const seen = new Set<string>()
  for (const group of [sessionRecords, projectRecords, coreRecords, annotatedQueryRecords]) {
    for (const record of group) {
      if (seen.has(record.id)) continue
      seen.add(record.id)
      merged.push(record)
    }
  }

  return {
    mode: input.mode,
    records: merged,
    counts: {
      session: sessionRecords.length,
      project: projectRecords.length,
      core: coreRecords.length,
    },
    queryHits: annotatedQueryRecords.length,
    recipient: input.recipient,
    highlights: buildMemoryPackHighlights(merged),
  }
}


export function buildMemoryPack(input: MemoryPackInput): MemoryPack {
  const pack = buildUntrimmedMemoryPack(input)
  return trimMemoryPackToBudget(pack, {
    maxTokens: input.maxTokens ?? defaultMemoryPackBudgetForMode(input.mode),
    preserveSearchResults: input.mode === 'search',
  })
}

export function getProgressLedger(input: ProgressLedgerQuery): ProgressLedgerResult {
  const records = pickProgressRecords(input)
  return {
    count: records.length,
    latestCheckpoint: records[0] ? buildCheckpointHighlight(records[0]) : null,
    blockers: records.filter((record) => payloadString(record, 'status') === 'blocked' || payloadString(record, 'blockedReason')).slice(0, 5).map(buildCheckpointHighlight),
    records,
    highlights: buildMemoryPackHighlights(records),
  }
}

export function getTransitionLedger(input: TransitionLedgerQuery): TransitionLedgerResult {
  const records = pickTransitionRecords(input)
  return {
    count: records.length,
    records,
    highlights: buildMemoryPackHighlights(records),
  }
}

export function getMemoryStats(): { total: number; byScope: Record<MemoryScope, number> } {
  hydrateLegacyRowsIfNeeded()
  const rows = sqlite
    .prepare('SELECT scope, COUNT(1) AS count FROM memory_records GROUP BY scope')
    .all() as Array<{
    scope: MemoryScope
    count: number
  }>
  const byScope: Record<MemoryScope, number> = { core: 0, project: 0, session: 0 }
  for (const row of rows) {
    if (row.scope in byScope) byScope[row.scope] = row.count
  }
  const totalRow = sqlite.prepare('SELECT COUNT(1) AS count FROM memory_records').get() as { count: number }
  return { total: totalRow.count, byScope }
}

function isExactDuplicate(existing: MemoryRecord, record: NewMemoryRecord): boolean {
  return (
    existing.scope === record.scope &&
    existing.kind === record.kind.trim() &&
    normalizeText(existing.text) === normalizeText(record.text) &&
    existing.source === record.source.trim() &&
    existing.sourceRef === (record.sourceRef ?? null) &&
    existing.projectKey === (record.projectKey ?? null) &&
    existing.conversationId === (record.conversationId ?? null) &&
    JSON.stringify(existing.payload) === JSON.stringify(record.payload ?? {}) &&
    JSON.stringify(existing.tags) === JSON.stringify(normalizeTags(record.tags))
  )
}

export function recordMemoryRecord(record: NewMemoryRecord, options: MemoryRecordWriteOptions = {}): MemoryRecord {
  hydrateLegacyRowsIfNeeded()
  const candidate: NewMemoryRecord = {
    ...record,
    kind: record.kind.trim(),
    text: normalizeText(record.text),
    source: record.source.trim(),
    tags: normalizeTags(record.tags),
  }

  if (options.supersedeLatest) {
    const latest = findLatestMemoryRecord({
      ...(options.latestFilters ?? {}),
      scope: options.latestFilters?.scope ?? candidate.scope,
      projectKey: options.latestFilters?.projectKey ?? candidate.projectKey ?? null,
      conversationId: options.latestFilters?.conversationId ?? candidate.conversationId ?? null,
      sourceRef: options.latestFilters?.sourceRef ?? candidate.sourceRef ?? null,
      status: options.latestFilters?.status ?? 'active',
    })
    if (latest) candidate.supersedesId = latest.id
  }

  if (options.dedupe) {
    const existing = listMemoryRecords({
      scope: candidate.scope,
      projectKey: candidate.projectKey ?? null,
      conversationId: candidate.conversationId ?? null,
      sourceRef: candidate.sourceRef ?? null,
      status: 'active',
      limit: 200,
    }).find((item) => isExactDuplicate(item, candidate))
    if (existing) return existing
  }

  return rawInsertMemoryRecord(candidate)
}

export function saveMemoryRecord(record: NewMemoryRecord): MemoryRecord {
  return recordMemoryRecord(record, { dedupe: true })
}

export interface MemoryPackBudget {
  maxTokens: number
  preserveSearchResults?: boolean
}

export function trimMemoryPackToBudget(pack: MemoryPack, budget: MemoryPackBudget): MemoryPack {
  if (budget.preserveSearchResults) return { ...pack, highlights: buildMemoryPackHighlights(pack.records) ?? pack.highlights }
  if (budget.maxTokens <= 0) {
    return { ...pack, records: [], counts: { session: 0, project: 0, core: 0 }, queryHits: 0, highlights: undefined }
  }

  const kept: MemoryRecord[] = []
  let used = 0
  for (const record of pack.records) {
    const text = renderMemoryRecord(record)
    const cost = estimateTokens(text)
    if (kept.length > 0 && used + cost > budget.maxTokens) continue
    kept.push(record)
    used += cost
  }

  touchMemoryRecords(kept.map((record) => record.id))

  return {
    ...pack,
    records: kept,
    counts: {
      session: kept.filter((record) => record.scope === 'session').length,
      project: kept.filter((record) => record.scope === 'project').length,
      core: kept.filter((record) => record.scope === 'core').length,
    },
    highlights: buildMemoryPackHighlights(kept) ?? pack.highlights,
  }
}

function renderMemoryRecord(record: MemoryRecord): string {
  const attrs = [
    `scope=${record.scope}`,
    `kind=${record.kind}`,
    `source=${record.source}`,
    record.sourceRef ? `sourceRef=${record.sourceRef}` : null,
    `importance=${record.importance}`,
    `confidence=${record.confidence}`,
    `status=${record.status}`,
  ]
    .filter(Boolean)
    .join(' ')
  return `<memory ${attrs}>${record.text}</memory>`
}
