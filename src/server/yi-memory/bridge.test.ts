import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamEvent, SubAgentHandle } from '@/shared/types'

const structuredMemoryMocks = vi.hoisted(() => ({
  recordConversationTransition: vi.fn(),
  recordDispatchMemory: vi.fn(),
  recordStructuredMemory: vi.fn(),
  resolveConversationMemoryContext: vi.fn(),
}))

vi.mock('./structured-memory', () => structuredMemoryMocks)

import { installYiMemoryBridge } from './bridge'

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function invokeCapturedListener(listener: ((event: StreamEvent) => void) | null, event: StreamEvent): void {
  if (!listener) throw new Error('Expected listener to be captured')
  listener(event)
}

function subAgentHandle(overrides: Partial<SubAgentHandle> = {}): SubAgentHandle {
  return {
    id: 'sub_1',
    name: 'Planner',
    status: 'running',
    createdAt: 1,
    parentAgentId: 'ag_parent',
    parentConvId: 'conv_2',
    ...overrides,
  }
}

describe('installYiMemoryBridge', () => {
  beforeEach(() => {
    structuredMemoryMocks.recordConversationTransition.mockReset()
    structuredMemoryMocks.recordDispatchMemory.mockReset()
    structuredMemoryMocks.recordStructuredMemory.mockReset()
    structuredMemoryMocks.resolveConversationMemoryContext.mockReset()
    delete (globalThis as { __agenthubYiMemoryBridgeInstalled?: boolean }).__agenthubYiMemoryBridgeInstalled
  })

  it('records dispatch plan reviews into memory', async () => {
    structuredMemoryMocks.resolveConversationMemoryContext.mockResolvedValue({
      conversationId: 'conv_plan_1',
      projectKey: 'proj_1',
      workspaceId: 'proj_1',
    })

    let capturedListener: ((event: StreamEvent) => void) | null = null
    const eventBus = {
      subscribe: vi.fn((fn: (event: StreamEvent) => void) => {
        capturedListener = fn
        return () => {
          capturedListener = null
        }
      }),
    }

    installYiMemoryBridge(eventBus)

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.plan.pending',
      conversationId: 'conv_plan_1',
      timestamp: Date.now(),
      pendingPlan: {
        id: 'pdp_1',
        conversationId: 'conv_plan_1',
        agentId: 'ag_orchestrator',
        runId: 'run_plan_1',
        plan: [
          { id: 't1', agentId: 'ag_pm', task: 'Write PRD' },
          { id: 't2', agentId: 'ag_frontend', task: 'Build UI' },
        ],
        createdAt: 123,
      },
    } as StreamEvent)
    await flush()

    expect(structuredMemoryMocks.recordStructuredMemory).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv_plan_1',
      projectKey: 'proj_1',
      scope: 'project',
      kind: 'transition',
      source: 'event_bus',
      sourceRef: 'dispatch-plan-review:pdp_1',
      importance: 3,
      confidence: 100,
      recipient: 'window',
      supersedeLatest: false,
      tags: ['dispatch', 'plan', 'review', 'pending', 'pdp_1'],
      payload: expect.objectContaining({
        pendingId: 'pdp_1',
        runId: 'run_plan_1',
        status: 'pending',
        agentId: 'ag_orchestrator',
        taskCount: 2,
        taskIds: ['t1', 't2'],
      }),
    }))

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.plan.resolved',
      conversationId: 'conv_plan_1',
      pendingId: 'pdp_1',
      runId: 'run_plan_1',
      approved: true,
      timestamp: Date.now(),
      pendingPlan: {
        id: 'pdp_1',
        conversationId: 'conv_plan_1',
        agentId: 'ag_orchestrator',
        runId: 'run_plan_1',
        plan: [
          { id: 't1', agentId: 'ag_pm', task: 'Write PRD' },
          { id: 't2', agentId: 'ag_frontend', task: 'Build UI' },
        ],
        createdAt: 123,
      },
    } as StreamEvent)
    await flush()

    expect(structuredMemoryMocks.recordStructuredMemory).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: 'conv_plan_1',
      projectKey: 'proj_1',
      scope: 'project',
      kind: 'decision',
      source: 'event_bus',
      sourceRef: 'dispatch-plan-review:pdp_1',
      importance: 4,
      confidence: 100,
      recipient: 'ui',
      supersedeLatest: true,
      tags: ['dispatch', 'plan', 'review', 'approved', 'pdp_1'],
      payload: expect.objectContaining({
        pendingId: 'pdp_1',
        runId: 'run_plan_1',
        status: 'approved',
        agentId: 'ag_orchestrator',
        taskCount: 2,
        taskIds: ['t1', 't2'],
      }),
    }))
  })

  it('records dispatch plan execution start into memory', async () => {
    structuredMemoryMocks.resolveConversationMemoryContext.mockResolvedValue({
      conversationId: 'conv_plan_2',
      projectKey: null,
      workspaceId: null,
    })

    let capturedListener: ((event: StreamEvent) => void) | null = null
    const eventBus = {
      subscribe: vi.fn((fn: (event: StreamEvent) => void) => {
        capturedListener = fn
        return () => {
          capturedListener = null
        }
      }),
    }

    installYiMemoryBridge(eventBus)

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.plan',
      conversationId: 'conv_plan_2',
      timestamp: Date.now(),
      runId: 'run_plan_2',
      plan: [
        { id: 't1', agentId: 'ag_pm', task: 'Write PRD' },
        { id: 't2', agentId: 'ag_frontend', task: 'Build UI' },
      ],
    } as StreamEvent)
    await flush()

    expect(structuredMemoryMocks.recordStructuredMemory).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv_plan_2',
      projectKey: null,
      scope: 'session',
      kind: 'decision',
      text: 'Dispatch plan execution started for run run_plan_2: 2 tasks queued for execution.',
      source: 'event_bus',
      sourceRef: 'dispatch-plan:run_plan_2',
      importance: 4,
      confidence: 100,
      recipient: 'ui',
      supersedeLatest: true,
      tags: ['dispatch', 'plan', 'execute', 'run_plan_2'],
      latestFilters: expect.objectContaining({
        scope: 'session',
        projectKey: null,
        conversationId: 'conv_plan_2',
        sourceRef: 'dispatch-plan:run_plan_2',
        status: 'active',
      }),
      payload: expect.objectContaining({
        runId: 'run_plan_2',
        taskCount: 2,
        taskIds: ['t1', 't2'],
      }),
    }))
  })

  it('records dispatch lifecycle events into memory', async () => {
    let capturedListener: ((event: StreamEvent) => void) | null = null
    const eventBus = {
      subscribe: vi.fn((fn: (event: StreamEvent) => void) => {
        capturedListener = fn
        return () => {
          capturedListener = null
        }
      }),
    }

    installYiMemoryBridge(eventBus)
    expect(eventBus.subscribe).toHaveBeenCalledTimes(1)

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.start',
      conversationId: 'conv_1',
      taskId: 'task_1',
      agentId: 'ag_1',
      parentRunId: 'run_parent',
      childRunId: 'run_child',
      timestamp: Date.now(),
    })
    await flush()

    expect(structuredMemoryMocks.recordDispatchMemory).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      taskId: 'task_1',
      status: 'progress',
      text: 'Task task_1 started by agent ag_1',
      source: 'event_bus',
      recipient: 'subagent',
    })

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.progress',
      conversationId: 'conv_1',
      parentRunId: 'run_parent',
      taskId: 'task_1',
      progress: { summary: 'Halfway there', percent: 50 },
      timestamp: Date.now(),
    })
    await flush()

    expect(structuredMemoryMocks.recordDispatchMemory).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      taskId: 'task_1',
      status: 'progress',
      text: 'Task task_1 progress 50%: Halfway there',
      source: 'event_bus',
      progress: { summary: 'Halfway there', percent: 50 },
      recipient: 'subagent',
    })

    invokeCapturedListener(capturedListener, {
      type: 'dispatch.end',
      conversationId: 'conv_1',
      taskId: 'task_1',
      parentRunId: 'run_parent',
      status: 'skipped',
      error: 'blocked upstream',
      timestamp: Date.now(),
    })
    await flush()

    expect(structuredMemoryMocks.recordDispatchMemory).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      taskId: 'task_1',
      status: 'aborted',
      text: 'Task task_1 ended with status skipped. blocked upstream',
      source: 'event_bus',
      error: 'blocked upstream',
      recipient: 'subagent',
    })
  })

  it('records sub-agent transitions into window-facing memory', async () => {
    let capturedListener: ((event: StreamEvent) => void) | null = null
    const eventBus = {
      subscribe: vi.fn((fn: (event: StreamEvent) => void) => {
        capturedListener = fn
        return () => {
          capturedListener = null
        }
      }),
    }

    installYiMemoryBridge(eventBus)

    invokeCapturedListener(capturedListener, {
      type: 'sub_agent.created',
      conversationId: 'conv_2',
      timestamp: Date.now(),
      subAgent: subAgentHandle({}),
    })
    await flush()

    expect(structuredMemoryMocks.recordConversationTransition).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      source: 'event_bus',
      reason: 'sub-agent created: Planner',
      trigger: 'sub_1',
      recipient: 'window',
    })

    invokeCapturedListener(capturedListener, {
      type: 'sub_agent.updated',
      conversationId: 'conv_2',
      timestamp: Date.now(),
      subAgent: subAgentHandle({ status: 'completed' }),
    })
    await flush()

    expect(structuredMemoryMocks.recordConversationTransition).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      source: 'event_bus',
      reason: 'sub-agent updated: Planner (completed)',
      trigger: 'sub_1',
      recipient: 'window',
    })

    invokeCapturedListener(capturedListener, {
      type: 'sub_agent.removed',
      conversationId: 'conv_2',
      timestamp: Date.now(),
      subAgentId: 'sub_1',
    })
    await flush()

    expect(structuredMemoryMocks.recordConversationTransition).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      source: 'event_bus',
      reason: 'sub-agent removed: sub_1',
      trigger: 'sub_1',
      recipient: 'window',
    })
  })
})
