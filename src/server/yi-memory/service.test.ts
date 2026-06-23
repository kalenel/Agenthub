import { beforeEach, describe, expect, it, vi } from 'vitest'

const memoryStoreMocks = vi.hoisted(() => ({
  buildMemoryPack: vi.fn(),
  findLatestMemoryRecord: vi.fn(),
  getMemoryStats: vi.fn(),
  inferMemoryKindFromType: vi.fn(),
  inferMemoryScopeFromType: vi.fn(),
  listMemoryRecords: vi.fn(),
  recordMemoryRecord: vi.fn(),
  searchMemoryRecords: vi.fn(),
}))

const structuredMemoryMocks = vi.hoisted(() => ({
  recordConversationTransition: vi.fn(),
  recordDispatchMemory: vi.fn(),
  recordStructuredMemory: vi.fn(),
  resolveConversationMemoryContext: vi.fn(),
}))

const coreMocks = vi.hoisted(() => ({
  yiGetTasks: vi.fn(),
  yiGetState: vi.fn(),
  yiSaveTask: vi.fn(),
  yiUpdateTask: vi.fn(),
  yiLocalStatus: vi.fn(),
  yiGetCheckpoint: vi.fn(),
  yiUpdateCheckpoint: vi.fn(),
  yiSaveState: vi.fn(),
  yiSaveEnvironment: vi.fn(),
  yiGetEnvironment: vi.fn(),
  yiScanBackups: vi.fn(),
  yiScanText: vi.fn(),
}))

vi.mock('./memory-store', () => memoryStoreMocks)
vi.mock('./structured-memory', () => structuredMemoryMocks)
vi.mock('./core', () => coreMocks)

import { yiGetMemoryPack, yiRecordMemory } from './service'

describe('yi-memory service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves projectKey from conversation when missing', async () => {
    structuredMemoryMocks.resolveConversationMemoryContext.mockResolvedValue({
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      workspaceId: 'proj_1',
    })
    memoryStoreMocks.buildMemoryPack.mockReturnValue({
      mode: 'chat',
      records: [],
      counts: { session: 0, project: 0, core: 0 },
      queryHits: 0,
      recipient: 'ui',
    })

    const result = await yiGetMemoryPack({
      conversationId: 'conv_1',
      mode: 'chat',
      query: 'status',
    })

    expect(structuredMemoryMocks.resolveConversationMemoryContext).toHaveBeenCalledWith('conv_1')
    expect(memoryStoreMocks.buildMemoryPack).toHaveBeenCalledWith({
      mode: 'chat',
      query: 'status',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      limit: undefined,
      maxTokens: undefined,
      recipient: 'ui',
    })
    expect(result).toEqual({
      mode: 'chat',
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      recipient: 'ui',
      pack: {
        mode: 'chat',
        records: [],
        counts: { session: 0, project: 0, core: 0 },
        queryHits: 0,
        recipient: 'ui',
      },
    })
  })

  it('writes structured memory with resolved projectKey', async () => {
    structuredMemoryMocks.resolveConversationMemoryContext.mockResolvedValue({
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      workspaceId: 'proj_2',
    })
    structuredMemoryMocks.recordStructuredMemory.mockResolvedValue({
      id: 'mem_1',
      scope: 'project',
      kind: 'fact',
      text: 'remember this',
      payload: {},
      source: 'ui',
      sourceRef: null,
      importance: 3,
      confidence: 100,
      status: 'active',
      projectKey: 'proj_2',
      conversationId: 'conv_2',
      createdAt: 1,
      updatedAt: 1,
      lastAccessedAt: null,
      tags: [],
      supersedesId: null,
    })

    const result = await yiRecordMemory({
      conversationId: 'conv_2',
      kind: 'fact',
      text: 'remember this',
      source: 'ui',
    } as any)

    expect(structuredMemoryMocks.resolveConversationMemoryContext).toHaveBeenCalledWith('conv_2')
    expect(structuredMemoryMocks.recordStructuredMemory).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      kind: 'fact',
      text: 'remember this',
      source: 'ui',
      projectKey: 'proj_2',
    })
    expect(result.projectKey).toBe('proj_2')
  })

  it('uses explicit projectKey and recipient without conversation lookup', async () => {
    memoryStoreMocks.buildMemoryPack.mockReturnValue({
      mode: 'subagent',
      records: [],
      counts: { session: 0, project: 0, core: 0 },
      queryHits: 0,
      recipient: 'subagent',
    })

    const result = await yiGetMemoryPack({
      conversationId: 'conv_3',
      projectKey: 'proj_3',
      mode: 'coding',
      recipient: 'subagent',
      limit: 4,
      maxTokens: 600,
    })

    expect(structuredMemoryMocks.resolveConversationMemoryContext).not.toHaveBeenCalled()
    expect(memoryStoreMocks.buildMemoryPack).toHaveBeenCalledWith({
      mode: 'coding',
      query: undefined,
      projectKey: 'proj_3',
      conversationId: 'conv_3',
      limit: 4,
      maxTokens: 600,
      recipient: 'subagent',
    })
    expect(result.recipient).toBe('subagent')
    expect(result.mode).toBe('coding')
    expect(result.projectKey).toBe('proj_3')
  })
})
