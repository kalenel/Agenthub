import { NextRequest, NextResponse } from 'next/server'

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
  yiRecordDispatch,
  yiRecordMemory,
  yiRecordProgressMemory,
  yiRecordTransition,
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

function isTaskStatus(value: unknown): value is 'pending' | 'in_progress' | 'done' {
  return value === 'pending' || value === 'in_progress' || value === 'done'
}

function isMemoryMode(value: unknown): value is 'coding' | 'chat' | 'report' | 'recovery' | 'subagent' | 'search' {
  return (
    value === 'coding' ||
    value === 'chat' ||
    value === 'report' ||
    value === 'recovery' ||
    value === 'subagent' ||
    value === 'search'
  )
}

function isMemoryRecipient(value: unknown): value is 'model' | 'subagent' | 'window' | 'ui' | 'search' {
  return value === 'model' || value === 'subagent' || value === 'window' || value === 'ui' || value === 'search'
}

function isProgressState(value: unknown): value is 'active' | 'blocked' | 'waiting' | 'done' | 'abandoned' {
  return value === 'active' || value === 'blocked' || value === 'waiting' || value === 'done' || value === 'abandoned'
}

function isMemoryScope(value: unknown): value is 'core' | 'project' | 'session' {
  return value === 'core' || value === 'project' || value === 'session'
}

function pickMemoryScope(value: unknown): 'core' | 'project' | 'session' | undefined {
  return isMemoryScope(value) ? value : undefined
}

function pickMemoryRecipient(value: unknown): 'model' | 'subagent' | 'window' | 'ui' | 'search' | undefined {
  return isMemoryRecipient(value) ? value : undefined
}

function pickMemoryMode(value: unknown): 'coding' | 'chat' | 'report' | 'recovery' | 'subagent' | 'search' | undefined {
  return isMemoryMode(value) ? value : undefined
}

function pickProgressState(value: unknown): 'active' | 'blocked' | 'waiting' | 'done' | 'abandoned' | undefined {
  return isProgressState(value) ? value : undefined
}

function toNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { action?: string; [key: string]: unknown }
    const { action, ...args } = body

    const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
      save_memory: (input) => yiSaveMemory(String(input.type ?? ''), String(input.content ?? '')),
      recall_memory: (input) => yiRecallMemory(String(input.query ?? ''), Number(input.limit ?? 10), pickMemoryScope(input.scope)),
      semantic_search: (input) => yiSemanticSearch(String(input.query ?? ''), Number(input.limit ?? 8), Number(input.threshold ?? 0), pickMemoryScope(input.scope)),
      get_timeline: (input) =>
        yiGetTimeline(
          typeof input.type === 'string' ? input.type : undefined,
          typeof input.start === 'string' ? input.start : undefined,
          typeof input.end === 'string' ? input.end : undefined,
        ),
      get_pack: (input) =>
        yiGetMemoryPack({
          mode: pickMemoryMode(input.mode),
          query: typeof input.query === 'string' ? input.query : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          limit: toNumber(input.limit),
          maxTokens: toNumber(input.maxTokens),
          recipient: pickMemoryRecipient(input.recipient),
        }),
      get_progress: (input) =>
        yiGetProgressLedger({
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          itemId: typeof input.itemId === 'string' ? input.itemId : undefined,
          episodeId: typeof input.episodeId === 'string' ? input.episodeId : undefined,
          checkpointId: typeof input.checkpointId === 'string' ? input.checkpointId : undefined,
          limit: toNumber(input.limit),
        }),
      get_progress_ledger: (input) =>
        yiGetProgressLedger({
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          itemId: typeof input.itemId === 'string' ? input.itemId : undefined,
          episodeId: typeof input.episodeId === 'string' ? input.episodeId : undefined,
          checkpointId: typeof input.checkpointId === 'string' ? input.checkpointId : undefined,
          limit: toNumber(input.limit),
        }),
      get_transition_ledger: (input) =>
        yiGetTransitionLedger({
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          transitionId: typeof input.transitionId === 'string' ? input.transitionId : undefined,
          fromState: typeof input.fromState === 'string' ? input.fromState : undefined,
          toState: typeof input.toState === 'string' ? input.toState : undefined,
          limit: toNumber(input.limit),
        }),
      save_task: (input) =>
        yiSaveTask(
          String(input.title ?? ''),
          isTaskStatus(input.status) ? input.status : undefined,
          typeof input.detail === 'string' ? input.detail : '',
        ),
      get_tasks: (input) => yiGetTasks(typeof input.status === 'string' ? input.status : undefined),
      update_task: (input) =>
        yiUpdateTask(
          String(input.title ?? ''),
          isTaskStatus(input.status) ? input.status : undefined,
          typeof input.detail === 'string' ? input.detail : undefined,
        ),
      get_identity: () => yiGetIdentity(),
      get_recent: (input) => yiGetRecent(Number(input.n ?? 10)),
      get_all: () => yiGetAll(),
      get_stats: () => yiGetStats(),
      local_status: () => yiLocalStatus(),
      get_checkpoint: () => yiGetCheckpoint(),
      update_checkpoint: (input) => yiUpdateCheckpoint(input as { last_core_index?: number; last_save_time?: string }),
      save_state: (input) => yiSaveState(input as { task?: string; status?: string; next?: string; files?: string[] }),
      get_state: () => yiGetState(),
      save_environment: () => yiSaveEnvironment(),
      get_environment: () => yiGetEnvironment(),
      scan_backups: (input) => yiScanBackups(Number(input.limit ?? 20)),
      scan_text: (input) => yiScanText(String(input.text ?? ''), Number(input.limit ?? 10)),
      record_memory: (input) => yiRecordMemory(input as any),
      record_progress: (input) =>
        yiRecordProgressMemory({
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          scope: pickMemoryScope(input.scope),
          itemId: typeof input.itemId === 'string' ? input.itemId : undefined,
          episodeId: typeof input.episodeId === 'string' ? input.episodeId : undefined,
          checkpointId: typeof input.checkpointId === 'string' ? input.checkpointId : undefined,
          previousCheckpointId: typeof input.previousCheckpointId === 'string' ? input.previousCheckpointId : undefined,
          latestCheckpoint: typeof input.latestCheckpoint === 'string' ? input.latestCheckpoint : undefined,
          status: pickProgressState(input.status),
          blockedReason: typeof input.blockedReason === 'string' ? input.blockedReason : undefined,
          nextAction: typeof input.nextAction === 'string' ? input.nextAction : undefined,
          evidenceRef: typeof input.evidenceRef === 'string' ? input.evidenceRef : undefined,
          evidenceRefs: toStringArray(input.evidenceRefs),
          text: String(input.text ?? ''),
          source: String(input.source ?? ''),
          sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : undefined,
          importance: toNumber(input.importance),
          confidence: toNumber(input.confidence),
          recipient: pickMemoryRecipient(input.recipient),
          tags: toStringArray(input.tags),
          payload: typeof input.payload === 'object' && input.payload ? (input.payload as Record<string, unknown>) : undefined,
          supersedeLatest: Boolean(input.supersedeLatest),
        }),
      record_transition: (input) => yiRecordTransition(input as any),
      record_transition_ledger: (input) =>
        yiRecordTransitionLedger({
          conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
          projectKey: typeof input.projectKey === 'string' ? input.projectKey : undefined,
          scope: pickMemoryScope(input.scope),
          transitionId: typeof input.transitionId === 'string' ? input.transitionId : undefined,
          fromState: typeof input.fromState === 'string' ? input.fromState : undefined,
          toState: typeof input.toState === 'string' ? input.toState : undefined,
          reason: String(input.reason ?? ''),
          trigger: typeof input.trigger === 'string' ? input.trigger : undefined,
          scopeImpact: typeof input.scopeImpact === 'string' ? input.scopeImpact : undefined,
          recoveryTarget: typeof input.recoveryTarget === 'string' ? input.recoveryTarget : undefined,
          evidenceRef: typeof input.evidenceRef === 'string' ? input.evidenceRef : undefined,
          evidenceRefs: toStringArray(input.evidenceRefs),
          text: typeof input.text === 'string' ? input.text : undefined,
          source: String(input.source ?? ''),
          sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : undefined,
          importance: toNumber(input.importance),
          confidence: toNumber(input.confidence),
          recipient: pickMemoryRecipient(input.recipient),
          tags: toStringArray(input.tags),
          payload: typeof input.payload === 'object' && input.payload ? (input.payload as Record<string, unknown>) : undefined,
          supersedeLatest: Boolean(input.supersedeLatest),
        }),
      record_dispatch: (input) => yiRecordDispatch(input as any),
    }

    const handler = action ? handlers[action] : undefined
    if (!handler) {
      return NextResponse.json({ ok: false, error: `Unknown action: ${String(action)}` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, action, result: await Promise.resolve(handler(args)) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Yi Memory API',
    version: '1.9.0',
    usage: 'POST /api/yi-memory { action: "get_pack", conversationId: "...", mode: "chat" }',
    actions: ['get_pack', 'get_progress', 'get_transition_ledger', 'record_memory', 'record_progress', 'record_transition', 'record_transition_ledger', 'record_dispatch'],
  })
}
