import { beforeEach, describe, expect, it, vi } from 'vitest'

const conversationServiceMocks = vi.hoisted(() => ({
  addAgentsToConversation: vi.fn(),
  removeAgentsFromConversation: vi.fn(),
}))

const subAgentManagerMocks = vi.hoisted(() => ({
  closeSubAgent: vi.fn(),
  getSubAgent: vi.fn(),
  listSubAgents: vi.fn(),
  resumeSubAgent: vi.fn(),
  sendSubAgentInput: vi.fn(),
  waitForSubAgent: vi.fn(),
}))

vi.mock('@/server/conversation-service', () => conversationServiceMocks)
vi.mock('@/server/sub-agent-manager', () => subAgentManagerMocks)

import {
  addAgentTool,
  closeAgentTool,
  listAgentsTool,
  removeAgentTool,
  resumeAgentTool,
  sendAgentInputTool,
  waitAgentTool,
} from './multi-agent-collab'

describe('multi-agent collaboration tools', () => {
  beforeEach(() => {
    for (const mock of Object.values(conversationServiceMocks)) mock.mockReset()
    for (const mock of Object.values(subAgentManagerMocks)) mock.mockReset()
  })

  it('adds an agent and returns the roster', async () => {
    conversationServiceMocks.addAgentsToConversation.mockResolvedValue({ agentIds: ['ag_1', 'ag_2'] })

    const result = await addAgentTool.handler({ target: 'ag_2' }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })

    expect(conversationServiceMocks.addAgentsToConversation).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      agentIds: ['ag_2'],
    })
    expect(result).toEqual({ ok: true, value: 'Added agent to conversation. Current roster: ag_1, ag_2' })
  })

  it('rejects removing the current agent', async () => {
    const result = await removeAgentTool.handler({ target: 'ag_1' }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })

    expect(result).toEqual({ ok: false, error: 'Cannot remove the current agent from the conversation' })
    expect(conversationServiceMocks.removeAgentsFromConversation).not.toHaveBeenCalled()
  })

  it('closes a sub-agent and reports previous status', async () => {
    subAgentManagerMocks.getSubAgent.mockReturnValue({ id: 'sub_1', name: 'Planner', status: 'running' })

    const result = await closeAgentTool.handler({ target: 'sub_1' }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })

    expect(subAgentManagerMocks.closeSubAgent).toHaveBeenCalledWith('sub_1')
    expect(result).toEqual({ ok: true, value: 'Closed sub-agent **Planner** (ID: sub_1). Previous status: running.' })
  })

  it('resumes and sends input to sub-agents', async () => {
    subAgentManagerMocks.resumeSubAgent.mockReturnValue({ id: 'sub_2', name: 'Writer', status: 'running' })
    subAgentManagerMocks.sendSubAgentInput.mockReturnValue({ id: 'sub_3', name: 'Reviewer', status: 'running' })

    const resumeResult = await resumeAgentTool.handler({ target: 'sub_2', task: 'Finish draft' }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })
    const sendResult = await sendAgentInputTool.handler({ target: 'sub_3', input: 'Add one more check' }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })

    expect(subAgentManagerMocks.resumeSubAgent).toHaveBeenCalledWith('sub_2', 'Finish draft')
    expect(subAgentManagerMocks.sendSubAgentInput).toHaveBeenCalledWith('sub_3', 'Add one more check')
    expect(resumeResult).toEqual({ ok: true, value: 'Resumed sub-agent **Writer** (ID: sub_2) with a new task.' })
    expect(sendResult).toEqual({ ok: true, value: 'Sent input to sub-agent **Reviewer** (ID: sub_3).' })
  })

  it('waits for the first finished sub-agent and lists active agents', async () => {
    subAgentManagerMocks.getSubAgent.mockImplementation((id: string) => ({ id, name: id === 'sub_1' ? 'Planner' : 'Reviewer', status: 'running', createdAt: 1, parentAgentId: 'ag_1', parentConvId: 'conv_1' }));
    subAgentManagerMocks.waitForSubAgent.mockImplementation((id: string) => {
      if (id === 'sub_1') return Promise.resolve({ id: 'sub_1', name: 'Planner', status: 'completed', createdAt: 1, parentAgentId: 'ag_1', parentConvId: 'conv_1' })
      return new Promise(() => {})
    })
    subAgentManagerMocks.listSubAgents.mockReturnValue([
      { id: 'sub_1', name: 'Planner', status: 'running', createdAt: 1, parentAgentId: 'ag_1', parentConvId: 'conv_1' },
    ])

    const waitResult = await waitAgentTool.handler({ targets: ['sub_1', 'sub_2'], timeout_ms: 1500 }, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })
    const listResult = await listAgentsTool.handler({}, {
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      runId: 'run_1',
      abortSignal: new AbortController().signal,
    })

    expect(subAgentManagerMocks.waitForSubAgent).toHaveBeenCalledWith('sub_1', 1500)
    expect(subAgentManagerMocks.waitForSubAgent).toHaveBeenCalledWith('sub_2', 1500)
    expect(waitResult.ok).toBe(true)
    if (!waitResult.ok) throw new Error(waitResult.error)
    expect(waitResult.value).toContain('## Sub-agent Planner finished')
    expect(listResult).toEqual({ ok: true, value: '## Sub-agents\n\n- **Planner** (sub_1): running' })
  })
})
