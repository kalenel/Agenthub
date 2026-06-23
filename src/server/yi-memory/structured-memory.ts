import { db, schema } from '@/db/client'
import { eq } from 'drizzle-orm'

import {
  getProgressLedger as readProgressLedger,
  getTransitionLedger as readTransitionLedger,
  inferMemoryKindFromType,
  inferMemoryScopeFromType,
  recordMemoryRecord,
  type MemoryRecord,
  type MemoryRecipient,
  type MemoryScope,
  type MemoryStatus,
  type ProgressLedgerQuery,
  type ProgressLedgerResult,
  type TransitionLedgerQuery,
  type TransitionLedgerResult,
} from './memory-store'

export type ProgressState = 'active' | 'blocked' | 'waiting' | 'done' | 'abandoned'

export interface StructuredMemoryInput {
  conversationId?: string | null
  projectKey?: string | null
  scope?: MemoryScope
  kind?: string
  type?: string
  text: string
  source: string
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

export interface ConversationMemoryContext {
  conversationId: string
  projectKey: string | null
  workspaceId: string | null
}

function resolveProgressScope(projectKey: string | null, conversationId: string | null, scope?: MemoryScope): MemoryScope {
  if (scope) return scope
  if (projectKey) return 'project'
  if (conversationId) return 'session'
  return inferMemoryScopeFromType('progress')
}

function resolveTransitionScope(projectKey: string | null, conversationId: string | null, scope?: MemoryScope): MemoryScope {
  if (scope) return scope
  if (projectKey) return 'project'
  if (conversationId) return 'session'
  return inferMemoryScopeFromType('transition')
}

function compactStrings(values?: string[]): string[] {
  return Array.isArray(values) ? values.map((value) => value.trim()).filter(Boolean) : []
}

function uniqueTags(tags?: string[]): string[] {
  return [...new Set(compactStrings(tags))]
}

function mergePayload<T extends Record<string, unknown>>(payload: T | undefined, extras: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(payload ?? {}),
    ...extras,
  }
}

function buildProgressSourceRef(input: ProgressMemoryInput, conversationId: string | null): string {
  return (
    input.sourceRef ??
    `progress:${input.itemId ?? input.episodeId ?? input.checkpointId ?? conversationId ?? 'global'}`
  )
}

function buildTransitionSourceRef(input: TransitionLedgerInput, conversationId: string | null): string {
  return (
    input.sourceRef ??
    `transition:${input.transitionId ?? input.fromState ?? input.toState ?? conversationId ?? 'global'}`
  )
}

function defaultProgressImportance(status: ProgressState): number {
  switch (status) {
    case 'blocked':
      return 5
    case 'done':
      return 4
    case 'abandoned':
      return 4
    case 'waiting':
      return 3
    case 'active':
    default:
      return 4
  }
}

function defaultTransitionImportance(scopeImpact?: string | null): number {
  return scopeImpact ? 4 : 3
}

function buildProgressTags(input: ProgressMemoryInput, status: ProgressState): string[] {
  const tags = ['progress', status]
  if (input.itemId) tags.push(`item:${input.itemId}`)
  if (input.episodeId) tags.push(`episode:${input.episodeId}`)
  if (input.checkpointId) tags.push(`checkpoint:${input.checkpointId}`)
  return uniqueTags([...(input.tags ?? []), ...tags])
}

function buildTransitionTags(input: TransitionLedgerInput): string[] {
  const tags = ['transition']
  if (input.transitionId) tags.push(`transition:${input.transitionId}`)
  if (input.fromState) tags.push(`from:${input.fromState}`)
  if (input.toState) tags.push(`to:${input.toState}`)
  return uniqueTags([...(input.tags ?? []), ...tags])
}

function buildProgressPayload(input: ProgressMemoryInput, status: ProgressState): Record<string, unknown> {
  return mergePayload(input.payload, {
    itemId: input.itemId ?? null,
    episodeId: input.episodeId ?? null,
    checkpointId: input.checkpointId ?? null,
    previousCheckpointId: input.previousCheckpointId ?? null,
    latestCheckpoint: input.latestCheckpoint ?? input.checkpointId ?? input.itemId ?? null,
    status,
    blockedReason: input.blockedReason ?? null,
    nextAction: input.nextAction ?? null,
    evidenceRef: input.evidenceRef ?? null,
    evidenceRefs: compactStrings(input.evidenceRefs),
    recipient: input.recipient ?? undefined,
  })
}

function buildTransitionPayload(input: TransitionLedgerInput, timestamp: number): Record<string, unknown> {
  return mergePayload(input.payload, {
    transitionId: input.transitionId ?? null,
    fromState: input.fromState ?? null,
    toState: input.toState ?? null,
    reason: input.reason,
    trigger: input.trigger ?? null,
    scopeImpact: input.scopeImpact ?? null,
    recoveryTarget: input.recoveryTarget ?? null,
    evidenceRef: input.evidenceRef ?? null,
    evidenceRefs: compactStrings(input.evidenceRefs),
    timestamp,
    recipient: input.recipient ?? undefined,
  })
}

export async function resolveConversationMemoryContext(conversationId: string): Promise<ConversationMemoryContext> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.conversationId, conversationId),
  })
  return {
    conversationId,
    projectKey: workspace?.id ?? null,
    workspaceId: workspace?.id ?? null,
  }
}

export async function recordStructuredMemory(input: StructuredMemoryInput): Promise<MemoryRecord> {
  const scope =
    input.scope ??
    (input.projectKey ? 'project' : input.conversationId ? 'session' : inferMemoryScopeFromType(input.type ?? input.kind ?? 'note'))
  const kind = (input.kind ?? inferMemoryKindFromType(input.type ?? input.kind ?? 'note')).trim()
  const projectKey = input.projectKey ?? null
  const conversationId = input.conversationId ?? null
  const payload = {
    ...(input.payload ?? {}),
    recipient: input.recipient ?? undefined,
  }
  return recordMemoryRecord(
    {
      scope,
      kind,
      text: input.text,
      payload,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      importance: input.importance,
      confidence: input.confidence,
      status: input.status ?? 'active',
      projectKey,
      conversationId,
      tags: input.tags,
    },
    {
      dedupe: input.supersedeLatest ? false : true,
      supersedeLatest: input.supersedeLatest ?? false,
      latestFilters: input.latestFilters,
    },
  )
}

export async function recordProgressMemory(input: ProgressMemoryInput): Promise<MemoryRecord> {
  const conversationId = input.conversationId ?? null
  const resolvedProjectKey =
    input.projectKey !== undefined ? input.projectKey : conversationId ? (await resolveConversationMemoryContext(conversationId)).projectKey : null
  const scope = resolveProgressScope(resolvedProjectKey, conversationId, input.scope)
  const progressStatus = input.status ?? 'active'
  const kind = progressStatus === 'blocked' || progressStatus === 'abandoned' ? 'incident' : 'progress'
  const sourceRef = buildProgressSourceRef(input, conversationId)
  const latestFilters =
    input.latestFilters ??
    (input.supersedeLatest
      ? {
          scope,
          projectKey: resolvedProjectKey,
          conversationId,
          sourceRef,
          status: 'active' as const,
        }
      : undefined)
  return recordMemoryRecord(
    {
      scope,
      kind,
      text: input.text,
      payload: buildProgressPayload(input, progressStatus),
      source: input.source,
      sourceRef,
      importance: input.importance ?? defaultProgressImportance(progressStatus),
      confidence: input.confidence ?? 100,
      status: 'active',
      projectKey: resolvedProjectKey,
      conversationId,
      tags: buildProgressTags(input, progressStatus),
    },
    {
      dedupe: false,
      supersedeLatest: input.supersedeLatest ?? false,
      latestFilters,
    },
  )
}

export async function recordTransitionLedger(input: TransitionLedgerInput): Promise<MemoryRecord> {
  const conversationId = input.conversationId ?? null
  const resolvedProjectKey =
    input.projectKey !== undefined ? input.projectKey : conversationId ? (await resolveConversationMemoryContext(conversationId)).projectKey : null
  const scope = resolveTransitionScope(resolvedProjectKey, conversationId, input.scope)
  const sourceRef = buildTransitionSourceRef(input, conversationId)
  const timestamp = Date.now()
  const text = input.text?.trim() || `${input.fromState ?? 'state'} -> ${input.toState ?? 'state'}${input.reason ? `: ${input.reason}` : ''}`
  const latestFilters =
    input.latestFilters ??
    (input.supersedeLatest
      ? {
          scope,
          projectKey: resolvedProjectKey,
          conversationId,
          sourceRef,
          status: 'active' as const,
        }
      : undefined)
  return recordMemoryRecord(
    {
      scope,
      kind: 'transition',
      text,
      payload: buildTransitionPayload(input, timestamp),
      source: input.source,
      sourceRef,
      importance: input.importance ?? defaultTransitionImportance(input.scopeImpact),
      confidence: input.confidence ?? 100,
      status: 'active',
      projectKey: resolvedProjectKey,
      conversationId,
      tags: buildTransitionTags(input),
    },
    {
      dedupe: false,
      supersedeLatest: input.supersedeLatest ?? false,
      latestFilters,
    },
  )
}

export async function recordConversationTransition(input: {
  conversationId: string
  fromConversationId?: string | null
  source: string
  reason: string
  trigger?: string | null
  recipient?: MemoryRecipient
}): Promise<MemoryRecord> {
  const ctx = await resolveConversationMemoryContext(input.conversationId)
  const previous = input.fromConversationId ?? null
  return recordTransitionLedger({
    conversationId: input.conversationId,
    projectKey: ctx.projectKey,
    scope: ctx.projectKey ? 'project' : 'session',
    transitionId: `conversation-switch:${previous ?? 'none'}->${input.conversationId}`,
    fromState: previous,
    toState: input.conversationId,
    reason: input.reason,
    text: `切换到会话 ${input.conversationId}${previous && previous !== input.conversationId ? `，来自 ${previous}` : ''}。原因：${input.reason}`,
    source: input.source,
    sourceRef: `conversation-switch:${previous ?? 'none'}->${input.conversationId}`,
    importance: 4,
    confidence: 100,
    tags: ['conversation-switch', 'transition', input.source],
    payload: {
      fromConversationId: previous,
      toConversationId: input.conversationId,
      reason: input.reason,
      trigger: input.trigger ?? null,
    },
    recipient: input.recipient ?? 'window',
  })
}

export async function recordDispatchMemory(input: {
  conversationId: string
  taskId: string
  status: 'progress' | 'complete' | 'failed' | 'blocked' | 'aborted'
  text: string
  source: string
  projectKey?: string | null
  progress?: unknown
  error?: string
  recipient?: MemoryRecipient
}): Promise<MemoryRecord> {
  const ctx = input.projectKey !== undefined ? { projectKey: input.projectKey } : await resolveConversationMemoryContext(input.conversationId)
  const progressState: ProgressState =
    input.status === 'complete'
      ? 'done'
      : input.status === 'blocked'
        ? 'blocked'
        : input.status === 'failed'
          ? 'abandoned'
          : input.status === 'aborted'
            ? 'abandoned'
            : 'active'
  return recordProgressMemory({
    conversationId: input.conversationId,
    projectKey: ctx.projectKey,
    scope: ctx.projectKey ? 'project' : 'session',
    itemId: input.taskId,
    checkpointId: input.taskId,
    latestCheckpoint: input.taskId,
    status: progressState,
    blockedReason: input.status === 'blocked' || input.status === 'failed' || input.status === 'aborted' ? input.error ?? null : null,
    nextAction: null,
    evidenceRef: `task:${input.taskId}`,
    text: input.text,
    source: input.source,
    sourceRef: `task:${input.taskId}`,
    importance: input.status === 'progress' ? 4 : 5,
    confidence: 100,
    tags: ['dispatch', 'task', input.status, input.taskId],
    payload: {
      taskId: input.taskId,
      status: input.status,
      progress: input.progress ?? null,
      error: input.error ?? null,
    },
    recipient: input.recipient ?? 'subagent',
    supersedeLatest: true,
    latestFilters: {
      scope: ctx.projectKey ? 'project' : 'session',
      projectKey: ctx.projectKey,
      conversationId: input.conversationId,
      sourceRef: `task:${input.taskId}`,
      status: 'active',
    },
  })
}

export function getProgressLedger(input: ProgressLedgerQuery): ProgressLedgerResult {
  return readProgressLedger(input)
}

export function getTransitionLedger(input: TransitionLedgerQuery): TransitionLedgerResult {
  return readTransitionLedger(input)
}
