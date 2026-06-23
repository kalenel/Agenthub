import {
  yiGetAll,
  yiGetCheckpoint,
  yiGetEnvironment,
  yiGetIdentity,
  yiGetMemoryPack,
  yiGetProgressLedger,
  yiGetRecent,
  yiGetState,
  yiGetStats,
  yiGetTasks,
  yiGetTimeline,
  yiGetTransitionLedger,
  yiLocalStatus,
  yiRecallMemory,
  yiRecordMemory,
  yiRecordProgressMemory,
  yiRecordTransitionLedger,
  yiSaveEnvironment,
  yiSaveMemory,
  yiSaveState,
  yiSaveTask,
  yiScanBackups,
  yiScanText,
  yiSemanticSearch,
  yiUpdateCheckpoint,
  yiUpdateTask,
} from '@/server/yi-memory/service'
import type { ToolContext, ToolDef, ToolResult } from './types'

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asMemoryMode(value: unknown): 'coding' | 'chat' | 'report' | 'recovery' | 'subagent' | 'search' | undefined {
  return value === 'coding' || value === 'chat' || value === 'report' || value === 'recovery' || value === 'subagent' || value === 'search'
    ? value
    : undefined
}

function asMemoryRecipient(value: unknown): 'model' | 'subagent' | 'window' | 'ui' | 'search' | undefined {
  return value === 'model' || value === 'subagent' || value === 'window' || value === 'ui' || value === 'search'
    ? value
    : undefined
}

function asMemoryScope(value: unknown): 'core' | 'project' | 'session' | undefined {
  return value === 'core' || value === 'project' || value === 'session' ? value : undefined
}

function ok(value: unknown): ToolResult {
  return { ok: true, value }
}

function fail(err: unknown): ToolResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

function wrapTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  run: (args: Record<string, unknown>) => unknown,
): ToolDef {
  return {
    name,
    description,
    parameters,
    handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
      const args = (raw ?? {}) as Record<string, unknown>
      try {
        return ok(await Promise.resolve(run(args)))
      } catch (err) {
        return fail(err)
      }
    },
  }
}

export const yisave_memoryTool = wrapTool(
  'yi_save_memory',
  'Save one memory. type memory kind, content text.',
  { type: 'object', properties: { type: { type: 'string' }, content: { type: 'string' } }, required: ['type', 'content'] },
  (args) => yiSaveMemory(asString(args.type), asString(args.content)),
)

export const yirecall_memoryTool = wrapTool(
  'yi_recall_memory',
  'Keyword search memories.',
  { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, scope: { type: 'string' } }, required: ['query'] },
  (args) => yiRecallMemory(asString(args.query), asNumber(args.limit, 10), asMemoryScope(args.scope)),
)

export const yisemantic_searchTool = wrapTool(
  'yi_semantic_search',
  'Semantic search memories.',
  { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 8 }, threshold: { type: 'number', default: 0 }, scope: { type: 'string' } }, required: ['query'] },
  (args) => yiSemanticSearch(asString(args.query), asNumber(args.limit, 8), asNumber(args.threshold, 0), asMemoryScope(args.scope)),
)

export const yiget_timelineTool = wrapTool(
  'yi_get_timeline',
  'View memory timeline.',
  { type: 'object', properties: { type: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: [] },
  (args) => yiGetTimeline(
    typeof args.type === 'string' ? args.type : undefined,
    typeof args.start === 'string' ? args.start : undefined,
    typeof args.end === 'string' ? args.end : undefined,
  ),
)

export const yiget_packTool = wrapTool(
  'yi_get_pack',
  'Get a memory pack for a recipient.',
  {
    type: 'object',
    properties: {
      mode: { type: 'string' },
      query: { type: 'string' },
      projectKey: { type: 'string' },
      conversationId: { type: 'string' },
      limit: { type: 'number' },
      maxTokens: { type: 'number' },
      recipient: { type: 'string' },
    },
    required: [],
  },
  (args) => yiGetMemoryPack({
    mode: asMemoryMode(args.mode),
    query: typeof args.query === 'string' ? args.query : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    limit: asNumber(args.limit, NaN),
    maxTokens: asNumber(args.maxTokens, NaN),
    recipient: asMemoryRecipient(args.recipient),
  }),
)

export const yi_get_progressTool = wrapTool(
  'yi_get_progress',
  'Get progress ledger.',
  {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      projectKey: { type: 'string' },
      itemId: { type: 'string' },
      episodeId: { type: 'string' },
      checkpointId: { type: 'string' },
      limit: { type: 'number' },
    },
    required: [],
  },
  (args) => yiGetProgressLedger({
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    itemId: typeof args.itemId === 'string' ? args.itemId : undefined,
    episodeId: typeof args.episodeId === 'string' ? args.episodeId : undefined,
    checkpointId: typeof args.checkpointId === 'string' ? args.checkpointId : undefined,
    limit: asNumber(args.limit, NaN),
  }),
)

export const yi_get_progress_ledgerTool = wrapTool(
  'yi_get_progress_ledger',
  'Get progress ledger.',
  {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      projectKey: { type: 'string' },
      itemId: { type: 'string' },
      episodeId: { type: 'string' },
      checkpointId: { type: 'string' },
      limit: { type: 'number' },
    },
    required: [],
  },
  (args) => yiGetProgressLedger({
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    itemId: typeof args.itemId === 'string' ? args.itemId : undefined,
    episodeId: typeof args.episodeId === 'string' ? args.episodeId : undefined,
    checkpointId: typeof args.checkpointId === 'string' ? args.checkpointId : undefined,
    limit: asNumber(args.limit, NaN),
  }),
)

export const yi_get_transition_ledgerTool = wrapTool(
  'yi_get_transition_ledger',
  'Get transition ledger.',
  {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      projectKey: { type: 'string' },
      transitionId: { type: 'string' },
      fromState: { type: 'string' },
      toState: { type: 'string' },
      limit: { type: 'number' },
    },
    required: [],
  },
  (args) => yiGetTransitionLedger({
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    transitionId: typeof args.transitionId === 'string' ? args.transitionId : undefined,
    fromState: typeof args.fromState === 'string' ? args.fromState : undefined,
    toState: typeof args.toState === 'string' ? args.toState : undefined,
    limit: asNumber(args.limit, NaN),
  }),
)

export const yi_record_progressTool = wrapTool(
  'yi_record_progress',
  'Record progress memory.',
  {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      projectKey: { type: 'string' },
      scope: { type: 'string' },
      itemId: { type: 'string' },
      episodeId: { type: 'string' },
      checkpointId: { type: 'string' },
      previousCheckpointId: { type: 'string' },
      latestCheckpoint: { type: 'string' },
      status: { type: 'string' },
      blockedReason: { type: 'string' },
      nextAction: { type: 'string' },
      evidenceRef: { type: 'string' },
      evidenceRefs: { type: 'array', items: { type: 'string' } },
      text: { type: 'string' },
      source: { type: 'string' },
      sourceRef: { type: 'string' },
      importance: { type: 'number' },
      confidence: { type: 'number' },
      recipient: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      payload: { type: 'object' },
      supersedeLatest: { type: 'boolean' },
    },
    required: ['text', 'source'],
  },
  (args) => yiRecordProgressMemory({
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    scope: typeof args.scope === 'string' ? (args.scope as 'core' | 'project' | 'session') : undefined,
    itemId: typeof args.itemId === 'string' ? args.itemId : undefined,
    episodeId: typeof args.episodeId === 'string' ? args.episodeId : undefined,
    checkpointId: typeof args.checkpointId === 'string' ? args.checkpointId : undefined,
    previousCheckpointId: typeof args.previousCheckpointId === 'string' ? args.previousCheckpointId : undefined,
    latestCheckpoint: typeof args.latestCheckpoint === 'string' ? args.latestCheckpoint : undefined,
    status: typeof args.status === 'string' ? (args.status as 'active' | 'blocked' | 'waiting' | 'done' | 'abandoned') : undefined,
    blockedReason: typeof args.blockedReason === 'string' ? args.blockedReason : undefined,
    nextAction: typeof args.nextAction === 'string' ? args.nextAction : undefined,
    evidenceRef: typeof args.evidenceRef === 'string' ? args.evidenceRef : undefined,
    evidenceRefs: asStringArray(args.evidenceRefs),
    text: asString(args.text),
    source: asString(args.source),
    sourceRef: typeof args.sourceRef === 'string' ? args.sourceRef : undefined,
    importance: asNumber(args.importance, NaN),
    confidence: asNumber(args.confidence, NaN),
    recipient: asMemoryRecipient(args.recipient),
    tags: asStringArray(args.tags),
    payload: typeof args.payload === 'object' && args.payload ? (args.payload as Record<string, unknown>) : undefined,
    supersedeLatest: Boolean(args.supersedeLatest),
  }),
)

export const yi_record_transition_ledgerTool = wrapTool(
  'yi_record_transition_ledger',
  'Record transition ledger.',
  {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      projectKey: { type: 'string' },
      scope: { type: 'string' },
      transitionId: { type: 'string' },
      fromState: { type: 'string' },
      toState: { type: 'string' },
      reason: { type: 'string' },
      trigger: { type: 'string' },
      scopeImpact: { type: 'string' },
      recoveryTarget: { type: 'string' },
      evidenceRef: { type: 'string' },
      evidenceRefs: { type: 'array', items: { type: 'string' } },
      text: { type: 'string' },
      source: { type: 'string' },
      sourceRef: { type: 'string' },
      importance: { type: 'number' },
      confidence: { type: 'number' },
      recipient: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      payload: { type: 'object' },
      supersedeLatest: { type: 'boolean' },
    },
    required: ['reason', 'source'],
  },
  (args) => yiRecordTransitionLedger({
    conversationId: typeof args.conversationId === 'string' ? args.conversationId : undefined,
    projectKey: typeof args.projectKey === 'string' ? args.projectKey : undefined,
    scope: typeof args.scope === 'string' ? (args.scope as 'core' | 'project' | 'session') : undefined,
    transitionId: typeof args.transitionId === 'string' ? args.transitionId : undefined,
    fromState: typeof args.fromState === 'string' ? args.fromState : undefined,
    toState: typeof args.toState === 'string' ? args.toState : undefined,
    reason: asString(args.reason),
    trigger: typeof args.trigger === 'string' ? args.trigger : undefined,
    scopeImpact: typeof args.scopeImpact === 'string' ? args.scopeImpact : undefined,
    recoveryTarget: typeof args.recoveryTarget === 'string' ? args.recoveryTarget : undefined,
    evidenceRef: typeof args.evidenceRef === 'string' ? args.evidenceRef : undefined,
    evidenceRefs: asStringArray(args.evidenceRefs),
    text: typeof args.text === 'string' ? args.text : undefined,
    source: asString(args.source),
    sourceRef: typeof args.sourceRef === 'string' ? args.sourceRef : undefined,
    importance: asNumber(args.importance, NaN),
    confidence: asNumber(args.confidence, NaN),
    recipient: asMemoryRecipient(args.recipient),
    tags: asStringArray(args.tags),
    payload: typeof args.payload === 'object' && args.payload ? (args.payload as Record<string, unknown>) : undefined,
    supersedeLatest: Boolean(args.supersedeLatest),
  }),
)

export const yisave_taskTool = wrapTool(
  'yi_save_task',
  'Create one task.',
  { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] }, detail: { type: 'string' } }, required: ['title'] },
  (args) => yiSaveTask(asString(args.title), (typeof args.status === 'string' ? args.status : 'pending') as 'pending' | 'in_progress' | 'done', asString(args.detail)),
)

export const yiget_tasksTool = wrapTool(
  'yi_get_tasks',
  'List tasks.',
  { type: 'object', properties: { status: { type: 'string' } }, required: [] },
  (args) => yiGetTasks(typeof args.status === 'string' ? args.status : undefined),
)

export const yiupdate_taskTool = wrapTool(
  'yi_update_task',
  'Update one task.',
  { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string' }, detail: { type: 'string' } }, required: ['title'] },
  (args) => yiUpdateTask(asString(args.title), typeof args.status === 'string' ? args.status : undefined, typeof args.detail === 'string' ? args.detail : undefined),
)

export const yiget_identityTool = wrapTool('yi_get_identity', 'Get identity memory.', { type: 'object', properties: {}, required: [] }, () => yiGetIdentity())
export const yiget_recentTool = wrapTool('yi_get_recent', 'Get recent memories.', { type: 'object', properties: { n: { type: 'number' } }, required: [] }, (args) => yiGetRecent(asNumber(args.n, 10)))
export const yiget_allTool = wrapTool('yi_get_all', 'Get all active memories.', { type: 'object', properties: {}, required: [] }, () => yiGetAll())
export const yiget_statsTool = wrapTool('yi_get_stats', 'Memory stats.', { type: 'object', properties: {}, required: [] }, () => yiGetStats())
export const yilocal_statusTool = wrapTool('yi_local_status', 'Storage health check.', { type: 'object', properties: {}, required: [] }, () => yiLocalStatus())
export const yiget_checkpointTool = wrapTool('yi_get_checkpoint', 'Get checkpoint.', { type: 'object', properties: {}, required: [] }, () => yiGetCheckpoint())

export const yiupdate_checkpointTool = wrapTool(
  'yi_update_checkpoint',
  'Update checkpoint.',
  { type: 'object', properties: { last_core_index: { type: 'number' }, last_save_time: { type: 'string' } }, required: [] },
  (args) => yiUpdateCheckpoint({
    last_core_index: typeof args.last_core_index === 'number' ? args.last_core_index : undefined,
    last_save_time: typeof args.last_save_time === 'string' ? args.last_save_time : undefined,
  }),
)

export const yisave_stateTool = wrapTool(
  'yi_save_state',
  'Save work progress.',
  { type: 'object', properties: { task: { type: 'string' }, status: { type: 'string' }, next: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: [] },
  (args) => yiSaveState({
    task: typeof args.task === 'string' ? args.task : undefined,
    status: typeof args.status === 'string' ? args.status : undefined,
    next: typeof args.next === 'string' ? args.next : undefined,
    files: asStringArray(args.files),
  }),
)

export const yiget_stateTool = wrapTool('yi_get_state', 'Get work progress.', { type: 'object', properties: {}, required: [] }, () => yiGetState())
export const yiscan_backupsTool = wrapTool('yi_scan_backups', 'Scan backup files.', { type: 'object', properties: { limit: { type: 'number', default: 20 } }, required: [] }, (args) => yiScanBackups(asNumber(args.limit, 20)))
export const yiscan_textTool = wrapTool('yi_scan_text', 'Scan important text.', { type: 'object', properties: { text: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['text'] }, (args) => yiScanText(asString(args.text), asNumber(args.limit, 10)))
export const yisave_environmentTool = wrapTool('yi_save_environment', 'Save environment snapshot.', { type: 'object', properties: {}, required: [] }, () => yiSaveEnvironment())
export const yiget_environmentTool = wrapTool('yi_get_environment', 'Get environment snapshot.', { type: 'object', properties: {}, required: [] }, () => yiGetEnvironment())

export const YI_MEMORY_TOOL_NAMES = [
  'yi_save_memory',
  'yi_recall_memory',
  'yi_semantic_search',
  'yi_get_timeline',
  'yi_get_pack',
  'yi_get_progress',
  'yi_get_progress_ledger',
  'yi_get_transition_ledger',
  'yi_record_progress',
  'yi_record_transition_ledger',
  'yi_save_task',
  'yi_get_tasks',
  'yi_update_task',
  'yi_get_identity',
  'yi_get_recent',
  'yi_get_all',
  'yi_get_stats',
  'yi_local_status',
  'yi_get_checkpoint',
  'yi_update_checkpoint',
  'yi_save_state',
  'yi_get_state',
  'yi_scan_backups',
  'yi_scan_text',
  'yi_save_environment',
  'yi_get_environment',
] as const

export const yiMemoryTools: ToolDef[] = [
  yisave_memoryTool,
  yirecall_memoryTool,
  yisemantic_searchTool,
  yiget_timelineTool,
  yiget_packTool,
  yi_get_progressTool,
  yi_get_progress_ledgerTool,
  yi_get_transition_ledgerTool,
  yi_record_progressTool,
  yi_record_transition_ledgerTool,
  yisave_taskTool,
  yiget_tasksTool,
  yiupdate_taskTool,
  yiget_identityTool,
  yiget_recentTool,
  yiget_allTool,
  yiget_statsTool,
  yilocal_statusTool,
  yiget_checkpointTool,
  yiupdate_checkpointTool,
  yisave_stateTool,
  yiget_stateTool,
  yiscan_backupsTool,
  yiscan_textTool,
  yisave_environmentTool,
  yiget_environmentTool,
]
