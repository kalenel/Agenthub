import { describe, expect, it } from 'vitest'

import type { AgentRow, WorkspaceRow } from '@/db/schema'

import { buildAdapterInput } from './agent-runner'
import { buildYiMemoryBlock } from './yi-memory-injector'

function makeAgent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'ag_mock',
    name: 'Mock Agent',
    adapterName: 'mock',
    systemPrompt: 'Base system prompt',
    apiKey: 'agent-key',
    apiBaseUrl: 'https://example.invalid',
    modelId: 'mock-model',
    modelProvider: null,
    supportsVision: false,
    capabilities: [],
    toolNames: [],
    description: null,
    isOrchestrator: false,
    isBuiltIn: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as AgentRow
}

function makeWorkspace(overrides: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    id: 'ws_mock',
    conversationId: 'conv_1',
    rootPath: 'C:\\sandbox\\root',
    boundPath: 'C:\\workspace\\project',
    mode: 'local',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as WorkspaceRow
}

describe('buildAdapterInput', () => {
  it('injects Yi identity guidance into the system prompt and keeps workspace context intact', async () => {
    const input = await buildAdapterInput(
      {
        agentId: 'ag_mock',
        conversationId: 'conv_1',
        triggerMessageId: 'msg_1',
      },
      makeAgent(),
      'run_1',
      'Solve the task',
      makeWorkspace(),
      [],
      undefined,
      [],
    )

    expect(input.prompt).toBe('Solve the task')
    expect(input.workspacePath).toBe('C:\\workspace\\project')
    expect(input.toolNames).toEqual([])
    expect(input.modelId).toBe('mock-model')
    expect(input.systemPrompt.startsWith(buildYiMemoryBlock())).toBe(true)
    expect(input.systemPrompt).toContain('<workspace_info>')
    expect(input.systemPrompt).toContain('<cwd>C:\\workspace\\project</cwd>')
    expect(input.systemPrompt).toContain('<mode>local</mode>')
    expect(input.systemPrompt).toContain('Base system prompt')
  })

  it('prefers args.modelId over agent.modelId', async () => {
    const input = await buildAdapterInput(
      {
        agentId: 'ag_mock',
        conversationId: 'conv_1',
        triggerMessageId: 'msg_1',
        modelId: 'run-model',
      },
      makeAgent({ modelId: 'agent-model' }),
      'run_2',
      'Solve the task',
      makeWorkspace(),
      [],
      undefined,
      [],
    )

    expect(input.modelId).toBe('run-model')
  })
})
