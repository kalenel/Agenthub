import type { DispatchPlanItem, PendingDispatchPlan, StreamEvent } from '@/shared/types'

import {
  recordConversationTransition,
  recordDispatchMemory,
  recordStructuredMemory,
  resolveConversationMemoryContext,
} from './structured-memory'

type YiMemoryEventBus = {
  subscribe(listener: (event: StreamEvent) => void): () => void
}

type DispatchPlanPendingEvent = Extract<StreamEvent, { type: 'dispatch.plan.pending' }> & {
  pendingPlan: PendingDispatchPlan
}

type DispatchPlanResolvedEvent = Extract<StreamEvent, { type: 'dispatch.plan.resolved' }> & {
  pendingPlan?: PendingDispatchPlan
}

type DispatchPlanEvent = Extract<StreamEvent, { type: 'dispatch.plan' }>

const globalForBridge = globalThis as unknown as {
  __agenthubYiMemoryBridgeInstalled?: boolean
}

export function installYiMemoryBridge(eventBus: YiMemoryEventBus): void {
  if (globalForBridge.__agenthubYiMemoryBridgeInstalled) return
  globalForBridge.__agenthubYiMemoryBridgeInstalled = true

  eventBus.subscribe((event: StreamEvent) => {
    void handleStreamEvent(event).catch((error) => {
      console.warn('[yi-memory] bridge failed', error)
    })
  })
}

async function recordDispatchPlanReviewMemory(input: {
  conversationId: string
  pendingId: string
  runId: string
  status: 'pending' | 'approved' | 'rejected' | 'revising'
  source: string
  agentId?: string
  plan?: DispatchPlanItem[]
  feedback?: string
}): Promise<void> {
  const ctx = await resolveConversationMemoryContext(input.conversationId)
  const scope = ctx.projectKey ? 'project' : 'session'
  const taskCount = input.plan?.length ?? 0
  const sourceRef = `dispatch-plan-review:${input.pendingId}`

  const text = (() => {
    switch (input.status) {
      case 'pending':
        return `Dispatch plan pending review for run ${input.runId}${input.agentId ? ` (agent ${input.agentId})` : ''}: ${taskCount} task${taskCount === 1 ? '' : 's'} awaiting approval.`
      case 'approved':
        return `Dispatch plan approved for run ${input.runId}: review ${input.pendingId} now executing${taskCount > 0 ? ` (${taskCount} task${taskCount === 1 ? '' : 's'})` : ''}.`
      case 'rejected':
        return `Dispatch plan rejected for run ${input.runId}: review ${input.pendingId} cancelled.`
      case 'revising':
        return `Dispatch plan revision requested for run ${input.runId}: review ${input.pendingId} sent back to replanning${input.feedback ? `; ${input.feedback}` : ''}.`
    }
  })()

  await recordStructuredMemory({
    conversationId: input.conversationId,
    projectKey: ctx.projectKey,
    scope,
    kind: input.status === 'pending' ? 'transition' : 'decision',
    text,
    source: input.source,
    sourceRef,
    importance: input.status === 'pending' ? 3 : 4,
    confidence: 100,
    tags: ['dispatch', 'plan', 'review', input.status, input.pendingId],
    payload: {
      pendingId: input.pendingId,
      runId: input.runId,
      status: input.status,
      agentId: input.agentId ?? null,
      taskCount,
      taskIds: input.plan?.map((task) => task.id) ?? [],
      plan: input.plan ?? null,
      feedback: input.feedback ?? null,
    },
    recipient: input.status === 'pending' ? 'window' : 'ui',
    supersedeLatest: input.status !== 'pending',
    latestFilters: input.status !== 'pending'
      ? {
          scope,
          projectKey: ctx.projectKey,
          conversationId: input.conversationId,
          sourceRef,
        }
      : undefined,
  })
}

async function recordDispatchPlanExecutionMemory(input: {
  conversationId: string
  runId: string
  plan: DispatchPlanItem[]
  source: string
}): Promise<void> {
  const ctx = await resolveConversationMemoryContext(input.conversationId)
  const scope = ctx.projectKey ? 'project' : 'session'
  const taskCount = input.plan.length
  const sourceRef = `dispatch-plan:${input.runId}`

  await recordStructuredMemory({
    conversationId: input.conversationId,
    projectKey: ctx.projectKey,
    scope,
    kind: 'decision',
    text: `Dispatch plan execution started for run ${input.runId}: ${taskCount} task${taskCount === 1 ? '' : 's'} queued for execution.`,
    source: input.source,
    sourceRef,
    importance: 4,
    confidence: 100,
    tags: ['dispatch', 'plan', 'execute', input.runId],
    payload: {
      runId: input.runId,
      taskCount,
      taskIds: input.plan.map((task) => task.id),
      plan: input.plan,
    },
    recipient: 'ui',
    supersedeLatest: true,
    latestFilters: {
      scope,
      projectKey: ctx.projectKey,
      conversationId: input.conversationId,
      sourceRef,
      status: 'active',
    },
  })
}

async function handleStreamEvent(event: StreamEvent): Promise<void> {
  if (event.type === 'dispatch.plan.pending') {
    const pendingEvent = event as DispatchPlanPendingEvent
    await recordDispatchPlanReviewMemory({
      conversationId: pendingEvent.conversationId,
      pendingId: pendingEvent.pendingPlan.id,
      runId: pendingEvent.pendingPlan.runId,
      status: 'pending',
      source: 'event_bus',
      agentId: pendingEvent.pendingPlan.agentId,
      plan: pendingEvent.pendingPlan.plan,
    })
    return
  }

  if (event.type === 'dispatch.plan.resolved') {
    const resolvedEvent = event as DispatchPlanResolvedEvent
    await recordDispatchPlanReviewMemory({
      conversationId: resolvedEvent.conversationId,
      pendingId: resolvedEvent.pendingId,
      runId: resolvedEvent.runId,
      status: resolvedEvent.approved ? 'approved' : resolvedEvent.revising ? 'revising' : 'rejected',
      source: 'event_bus',
      agentId: resolvedEvent.pendingPlan?.agentId,
      plan: resolvedEvent.pendingPlan?.plan,
    })
    return
  }

  if (event.type === 'dispatch.plan') {
    const planEvent = event as DispatchPlanEvent
    await recordDispatchPlanExecutionMemory({
      conversationId: planEvent.conversationId,
      runId: planEvent.runId,
      plan: planEvent.plan,
      source: 'event_bus',
    })
    return
  }

  if (event.type === 'dispatch.start') {
    await recordDispatchMemory({
      conversationId: event.conversationId,
      taskId: event.taskId,
      status: 'progress',
      text: `Task ${event.taskId} started by agent ${event.agentId}`,
      source: 'event_bus',
      recipient: 'subagent',
    })
    return
  }

  if (event.type === 'dispatch.progress') {
    await recordDispatchMemory({
      conversationId: event.conversationId,
      taskId: event.taskId,
      status: 'progress',
      text: `Task ${event.taskId} progress ${event.progress.percent ?? 'unknown'}%: ${event.progress.summary}`,
      source: 'event_bus',
      progress: event.progress,
      recipient: 'subagent',
    })
    return
  }

  if (event.type === 'dispatch.end') {
    await recordDispatchMemory({
      conversationId: event.conversationId,
      taskId: event.taskId,
      status: event.status === 'skipped' ? 'aborted' : event.status,
      text: `Task ${event.taskId} ended with status ${event.status}${event.error ? `. ${event.error}` : ''}`,
      source: 'event_bus',
      error: event.error,
      recipient: 'subagent',
    })
    return
  }

  if (event.type === 'sub_agent.created') {
    await recordConversationTransition({
      conversationId: event.conversationId,
      source: 'event_bus',
      reason: `sub-agent created: ${event.subAgent.name}`,
      trigger: event.subAgent.id,
      recipient: 'window',
    })
    return
  }

  if (event.type === 'sub_agent.updated') {
    await recordConversationTransition({
      conversationId: event.conversationId,
      source: 'event_bus',
      reason: `sub-agent updated: ${event.subAgent.name} (${event.subAgent.status})`,
      trigger: event.subAgent.id,
      recipient: 'window',
    })
    return
  }

  if (event.type === 'sub_agent.removed') {
    await recordConversationTransition({
      conversationId: event.conversationId,
      source: 'event_bus',
      reason: `sub-agent removed: ${event.subAgentId}`,
      trigger: event.subAgentId,
      recipient: 'window',
    })
  }
}
