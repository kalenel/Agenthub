export type MemoryMode = 'coding' | 'chat' | 'report' | 'recovery' | 'subagent' | 'search'
export type MemoryRecipient = 'model' | 'subagent' | 'window' | 'ui' | 'search'
export type MemoryScope = 'core' | 'project' | 'session'
export type MemoryStatus = 'active' | 'superseded' | 'conflicted' | 'archived'
export type ProgressState = 'active' | 'blocked' | 'waiting' | 'done' | 'abandoned'

export interface MemoryEntry {
  type: string
  time: string
  content: string
}

export interface MemorySearchHit extends MemoryEntry {
  relevance: number
}

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

export interface MemoryPack {
  mode: MemoryMode
  records: MemoryRecord[]
  counts: { session: number; project: number; core: number }
  queryHits: number
  recipient?: MemoryRecipient
  highlights?: MemoryPackHighlights
}

export interface MemoryPackResult {
  mode: MemoryMode
  conversationId: string | null
  projectKey: string | null
  recipient: MemoryRecipient
  pack: MemoryPack
}

export interface MemorySaveResult {
  ok: true
  total: number
  record: MemoryEntry
}

export interface ProgressLedgerResult {
  count: number
  latestCheckpoint: MemoryPackCheckpointHighlight | null
  blockers: MemoryPackCheckpointHighlight[]
  records: MemoryRecord[]
  highlights?: MemoryPackHighlights
}

export interface TransitionLedgerResult {
  count: number
  records: MemoryRecord[]
  highlights?: MemoryPackHighlights
}

export interface MemoryRecentResult {
  count: number
  results: MemoryEntry[]
}

export interface MemorySearchResult {
  query: string
  count: number
  results: MemorySearchHit[]
}

export interface MemoryTimelineResult {
  total: number
  days: number
  span: string
  timeline: Array<{
    date: string
    count: number
    entries: MemoryEntry[]
  }>
}

export interface MemoryPackRequest {
  mode: MemoryMode
  query?: string
  projectKey?: string | null
  conversationId?: string | null
  limit?: number
  maxTokens?: number
  recipient?: MemoryRecipient
}

export interface MemoryRecordInput {
  conversationId?: string | null
  projectKey?: string | null
  scope?: MemoryScope
  kind?: string
  type?: string
  text: string
  source?: string
  sourceRef?: string | null
  importance?: number
  confidence?: number
  status?: MemoryStatus
  recipient?: MemoryRecipient
  tags?: string[]
  payload?: Record<string, unknown>
  supersedeLatest?: boolean
  latestFilters?: {
    scope?: MemoryScope | MemoryScope[]
    kind?: string | string[]
    projectKey?: string | null
    conversationId?: string | null
    sourceRef?: string | null
    status?: MemoryStatus | MemoryStatus[]
  }
}

export interface ProgressMemoryInput {
  conversationId?: string | null
  projectKey?: string | null
  scope?: MemoryScope
  itemId?: string | null
  episodeId?: string | null
  checkpointId?: string | null
  previousCheckpointId?: string | null
  latestCheckpoint?: string | null
  status?: ProgressState
  blockedReason?: string | null
  nextAction?: string | null
  evidenceRef?: string | null
  evidenceRefs?: string[]
  text: string
  source: string
  sourceRef?: string | null
  importance?: number
  confidence?: number
  recipient?: MemoryRecipient
  tags?: string[]
  payload?: Record<string, unknown>
  supersedeLatest?: boolean
  latestFilters?: {
    scope?: MemoryScope | MemoryScope[]
    kind?: string | string[]
    projectKey?: string | null
    conversationId?: string | null
    sourceRef?: string | null
    status?: MemoryStatus | MemoryStatus[]
  }
}

export interface TransitionLedgerInput {
  conversationId?: string | null
  projectKey?: string | null
  scope?: MemoryScope
  transitionId?: string | null
  fromState?: string | null
  toState?: string | null
  reason: string
  trigger?: string | null
  scopeImpact?: string | null
  recoveryTarget?: string | null
  evidenceRef?: string | null
  evidenceRefs?: string[]
  text?: string
  source: string
  sourceRef?: string | null
  importance?: number
  confidence?: number
  recipient?: MemoryRecipient
  tags?: string[]
  payload?: Record<string, unknown>
  supersedeLatest?: boolean
  latestFilters?: {
    scope?: MemoryScope | MemoryScope[]
    kind?: string | string[]
    projectKey?: string | null
    conversationId?: string | null
    sourceRef?: string | null
    status?: MemoryStatus | MemoryStatus[]
  }
}

export interface ProgressLedgerRequest {
  conversationId?: string | null
  projectKey?: string | null
  itemId?: string | null
  episodeId?: string | null
  checkpointId?: string | null
  limit?: number
}

export interface TransitionLedgerRequest {
  conversationId?: string | null
  projectKey?: string | null
  transitionId?: string | null
  fromState?: string | null
  toState?: string | null
  limit?: number
}

export interface MemoryPackArchiveExportInput extends MemoryPackRequest {
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
  format: string
  version: number
  exportedAt: string
  source: {
    mode: MemoryMode
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
    manifest: string
    core: string
    project: string
    session: string
    attachmentsDir: string
  }
  attachments: MemoryPackArchiveAttachmentEntry[]
  warnings: string[]
}

export interface MemoryPackArchiveDownload {
  blob: Blob
  fileName: string
}

export interface MemoryPackArchiveImportInput {
  conversationId: string
  archive: Blob
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

async function postMemoryAction<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/yi-memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; result?: T }
    | null

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${response.status}: ${response.statusText}`)
  }

  return data.result as T
}

export async function fetchMemoryPack(input: MemoryPackRequest): Promise<MemoryPackResult> {
  return postMemoryAction<MemoryPackResult>({ action: 'get_pack', ...input })
}

export async function fetchProgressLedger(input: ProgressLedgerRequest): Promise<ProgressLedgerResult> {
  return postMemoryAction<ProgressLedgerResult>({ action: 'get_progress', ...input })
}

export async function fetchTransitionLedger(input: TransitionLedgerRequest): Promise<TransitionLedgerResult> {
  return postMemoryAction<TransitionLedgerResult>({ action: 'get_transition_ledger', ...input })
}

export async function fetchRecentMemories(limit = 10): Promise<MemoryRecentResult> {
  return postMemoryAction<MemoryRecentResult>({ action: 'get_recent', n: limit })
}

export async function searchMemories(query: string, limit = 8, threshold = 0, scope?: MemoryScope): Promise<MemorySearchResult> {
  return postMemoryAction<MemorySearchResult>({ action: 'semantic_search', query, limit, threshold, scope })
}

export async function recordMemory(input: MemoryRecordInput): Promise<MemoryRecord> {
  return postMemoryAction<MemoryRecord>({ action: 'record_memory', ...input })
}

export async function recordProgressMemory(input: ProgressMemoryInput): Promise<MemoryRecord> {
  return postMemoryAction<MemoryRecord>({ action: 'record_progress', ...input })
}

export async function recordTransitionLedger(input: TransitionLedgerInput): Promise<MemoryRecord> {
  return postMemoryAction<MemoryRecord>({ action: 'record_transition_ledger', ...input })
}

export async function saveMemory(type: string, content: string): Promise<MemorySaveResult> {
  return postMemoryAction<MemorySaveResult>({ action: 'save_memory', type, content })
}

export async function fetchMemoryTimeline(
  type?: string,
  start?: string,
  end?: string,
): Promise<MemoryTimelineResult> {
  return postMemoryAction<MemoryTimelineResult>({ action: 'get_timeline', type, start, end })
}

export async function exportMemoryPackArchive(
  input: MemoryPackArchiveExportInput,
): Promise<MemoryPackArchiveDownload> {
  const params = new URLSearchParams()
  appendSearchParam(params, 'mode', input.mode)
  appendSearchParam(params, 'query', input.query)
  appendSearchParam(params, 'projectKey', input.projectKey)
  appendSearchParam(params, 'conversationId', input.conversationId)
  appendSearchParam(params, 'recipient', input.recipient)
  appendSearchParam(params, 'limit', input.limit)
  appendSearchParam(params, 'maxTokens', input.maxTokens)
  appendSearchParam(params, 'includeAttachments', input.includeAttachments)
  appendSearchParam(params, 'start', input.start)
  appendSearchParam(params, 'end', input.end)

  const query = params.toString()
  const response = await fetch(query ? `/api/yi-memory/export?${query}` : '/api/yi-memory/export')
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `HTTP ${response.status}: ${response.statusText}`)
  }

  const blob = await response.blob()
  return {
    blob,
    fileName: parseDownloadFileName(response.headers.get('content-disposition')) ?? `memory-pack-${input.mode}.zip`,
  }
}

export async function importMemoryPackArchive(
  input: MemoryPackArchiveImportInput,
): Promise<MemoryPackArchiveImportResult> {
  const form = new FormData()
  form.append('conversationId', input.conversationId)
  form.append('archive', input.archive, 'memory-pack.zip')

  const response = await fetch('/api/yi-memory/import', {
    method: 'POST',
    body: form,
  })

  const data = (await response.json().catch(() => null)) as { error?: string } | MemoryPackArchiveImportResult | null
  if (!response.ok || !data || 'error' in data) {
    throw new Error((data && 'error' in data && data.error) || `HTTP ${response.status}: ${response.statusText}`)
  }

  return data as MemoryPackArchiveImportResult
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value === undefined || value === null || value === '') return
  params.set(key, String(value))
}

function parseDownloadFileName(value: string | null): string | null {
  if (!value) return null

  const filenameStar = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (filenameStar?.[1]) {
    try {
      return decodeURIComponent(filenameStar[1])
    } catch {
      return filenameStar[1]
    }
  }

  const filename = value.match(/filename="?([^";]+)"?/i)
  return filename?.[1] ?? null
}
