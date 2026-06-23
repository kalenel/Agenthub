import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))
const workspaceMocks = vi.hoisted(() => ({
  getWorkspaceForConversation: vi.fn(),
}))
const agentRegistryMocks = vi.hoisted(() => ({
  getAdapter: vi.fn(),
}))
const historyMocks = vi.hoisted(() => ({
  buildHistoryFor: vi.fn(),
}))
const subAgentManagerMocks = vi.hoisted(() => ({
  createSubAgent: vi.fn(),
  registerSubAgentRuntime: vi.fn(),
  removeSubAgent: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: { query: { agents: { findFirst: dbMocks.findFirst } } },
  schema: { agents: { id: 'agents.id' } },
}))
vi.mock('@/server/fs-service', () => workspaceMocks)
vi.mock('@/server/adapters/registry', () => ({ agentRegistry: agentRegistryMocks }))
vi.mock('@/server/conversation-context', () => historyMocks)
vi.mock('@/server/sub-agent-manager', () => subAgentManagerMocks)
vi.mock('@/server/workspace-utils', () => ({
  getEffectiveCwd: (workspace: { boundPath?: string; rootPath?: string }) => workspace.boundPath ?? workspace.rootPath ?? 'C:\\workspace',
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
}))

import { spawnAgentTool } from './spawn-agent'

describe('spawn_agent tool', () => {
  beforeEach(() => {
    dbMocks.findFirst.mockReset()
    workspaceMocks.getWorkspaceForConversation.mockReset()
    agentRegistryMocks.getAdapter.mockReset()
    historyMocks.buildHistoryFor.mockReset()
    subAgentManagerMocks.createSubAgent.mockReset()
    subAgentManagerMocks.registerSubAgentRuntime.mockReset()
    subAgentManagerMocks.removeSubAgent.mockReset()
  })

  it('spawns a sub-agent with default tool names and registers runtime', async () => {
    dbMocks.findFirst.mockResolvedValue({
      id: 'ag_1',
      adapterName: 'custom',
      systemPrompt: 'Base prompt',
      apiKey: 'key',
      apiBaseUrl: 'https://example.invalid',
      modelId: 'mock-model',
      modelProvider: 'openai',
      supportsVision: false,
    })
    workspaceMocks.getWorkspaceForConversation.mockResolvedValue({ boundPath: 'C:\\workspace\\project', rootPath: 'C:\\workspace', mode: 'local' })
    agentRegistryMocks.getAdapter.mockReturnValue({
      stream: vi.fn(async function* () {
        yield { type: 'part.delta', delta: { type: 'text.append', text: 'done' } }
      }),
    })
    historyMocks.buildHistoryFor.mockResolvedValue([{ role: 'user', content: 'hello' }])
    subAgentManagerMocks.createSubAgent.mockReturnValue({ id: 'sub_1', activeRunId: 'run_sub_1', name: 'sub-agent' })

    const result = await spawnAgentTool.handler(
      { task: 'Write docs', agent_name: 'Planner' },
      {
        agentId: 'ag_1',
        conversationId: 'conv_1',
        workspacePath: 'C:\\workspace',
        runId: 'run_1',
        abortSignal: new AbortController().signal,
      },
    )

    expect(subAgentManagerMocks.createSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Planner',
        parentAgentId: 'ag_1',
        parentConvId: 'conv_1',
        parentRunId: 'run_1',
        task: 'Write docs',
        toolNames: ['fs_read', 'fs_write', 'bash', 'skill_load'],
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({ ok: true, value: expect.stringContaining('## Sub-agent spawned') }),
    )
  })

  it('removes spawned sub-agent when runtime setup fails', async () => {
    dbMocks.findFirst.mockResolvedValue({
      id: 'ag_1',
      adapterName: 'custom',
      systemPrompt: 'Base prompt',
      apiKey: 'key',
      apiBaseUrl: 'https://example.invalid',
      modelId: 'mock-model',
      modelProvider: 'openai',
      supportsVision: false,
    })
    workspaceMocks.getWorkspaceForConversation.mockResolvedValue({ boundPath: 'C:\\workspace\\project', rootPath: 'C:\\workspace', mode: 'local' })
    agentRegistryMocks.getAdapter.mockImplementation(() => {
      throw new Error('adapter boom')
    })
    historyMocks.buildHistoryFor.mockResolvedValue([])
    subAgentManagerMocks.createSubAgent.mockReturnValue({ id: 'sub_9', activeRunId: 'run_sub_9', name: 'sub-agent' })

    const result = await spawnAgentTool.handler(
      { task: 'Write docs' },
      {
        agentId: 'ag_1',
        conversationId: 'conv_1',
        workspacePath: 'C:\\workspace',
        runId: 'run_1',
        abortSignal: new AbortController().signal,
      },
    )

    expect(subAgentManagerMocks.removeSubAgent).toHaveBeenCalledWith('sub_9')
    expect(result.ok).toBe(false)
  })
})
