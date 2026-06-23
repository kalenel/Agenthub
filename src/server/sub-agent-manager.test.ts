import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SubAgentHandle } from '@/shared/types'

const eventBusMocks = vi.hoisted(() => ({
  publish: vi.fn(),
}))

vi.mock('./event-bus', () => ({
  eventBus: eventBusMocks,
}))

import { closeSubAgent, completeSubAgent, createSubAgent, listChildSubAgentIds, removeSubAgent } from './sub-agent-manager'

describe('sub-agent-manager event publishing', () => {
  beforeEach(() => {
    eventBusMocks.publish.mockReset()
  })

  it('publishes created, updated, and removed events across a sub-agent lifecycle', () => {
    const handle = createSubAgent({
      name: 'Planner',
      parentAgentId: 'ag_parent',
      parentConvId: 'conv_sub_1',
      task: 'Draft plan',
      toolNames: ['fs_read'],
      parentRunId: 'run_parent',
    })

    expect(eventBusMocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sub_agent.created',
        conversationId: 'conv_sub_1',
        subAgent: expect.objectContaining({
          id: handle.id,
          name: 'Planner',
          status: 'running',
          parentAgentId: 'ag_parent',
          parentConvId: 'conv_sub_1',
          parentRunId: 'run_parent',
          lastTask: 'Draft plan',
        }) as SubAgentHandle,
      }),
    )

    completeSubAgent(handle.id, 'done')

    expect(eventBusMocks.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'sub_agent.updated',
        conversationId: 'conv_sub_1',
        subAgent: expect.objectContaining({
          id: handle.id,
          status: 'completed',
          result: 'done',
          error: undefined,
        }) as SubAgentHandle,
      }),
    )

    removeSubAgent(handle.id)

    expect(eventBusMocks.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'sub_agent.removed',
        conversationId: 'conv_sub_1',
        subAgentId: handle.id,
      }),
    )
  })

  it('tracks child sub-agents and closes them recursively', () => {
    const parent = createSubAgent({
      name: 'Parent',
      parentAgentId: 'ag_parent',
      parentConvId: 'conv_sub_2',
      task: 'Parent task',
      toolNames: [],
    })

    const child = createSubAgent({
      name: 'Child',
      parentAgentId: 'ag_parent',
      parentConvId: 'conv_sub_2',
      task: 'Child task',
      toolNames: [],
      parentSubAgentId: parent.id,
    })

    expect(listChildSubAgentIds(parent.id)).toEqual([child.id])
    expect(closeSubAgent(parent.id)).toBe(true)
    expect(child.status).toBe('closed')
    expect(parent.status).toBe('closed')
  })
})
