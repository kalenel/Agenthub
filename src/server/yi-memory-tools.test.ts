import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  yiGetAll: vi.fn(),
  yiGetCheckpoint: vi.fn(),
  yiGetEnvironment: vi.fn(),
  yiGetIdentity: vi.fn(),
  yiGetMemoryPack: vi.fn(),
  yiGetRecent: vi.fn(),
  yiGetState: vi.fn(),
  yiGetStats: vi.fn(),
  yiGetTasks: vi.fn(),
  yiGetTimeline: vi.fn(),
  yiLocalStatus: vi.fn(),
  yiRecallMemory: vi.fn(),
  yiSaveEnvironment: vi.fn(),
  yiSaveMemory: vi.fn(),
  yiSaveState: vi.fn(),
  yiSaveTask: vi.fn(),
  yiScanBackups: vi.fn(),
  yiScanText: vi.fn(),
  yiSemanticSearch: vi.fn(),
  yiUpdateCheckpoint: vi.fn(),
  yiUpdateTask: vi.fn(),
}))

vi.mock('@/server/yi-memory/service', () => serviceMocks)

import {
  yiget_packTool as yiGetPackTool,
  yisave_memoryTool as yiSaveMemoryTool,
  yisave_stateTool as yiSaveStateTool,
  yisemantic_searchTool as yiSemanticSearchTool,
  yiupdate_checkpointTool as yiUpdateCheckpointTool,
} from './tools/yi-memory-tools'

describe('yi-memory tool wrappers', () => {
  beforeEach(() => {
    for (const mock of Object.values(serviceMocks)) {
      mock.mockReset()
    }
  })

  it('normalizes save memory args before forwarding', async () => {
    serviceMocks.yiSaveMemory.mockResolvedValue({ id: 'mem_1' })

    const result = await yiSaveMemoryTool.handler(
      { type: 123, content: 'Remember this' },
      {} as never,
    )

    expect(serviceMocks.yiSaveMemory).toHaveBeenCalledWith('', 'Remember this')
    expect(result).toEqual({ ok: true, value: { id: 'mem_1' } })
  })

  it('normalizes semantic search args before forwarding', async () => {
    serviceMocks.yiSemanticSearch.mockResolvedValue({ results: [] })

    const result = await yiSemanticSearchTool.handler(
      { query: 'plan', limit: '8', threshold: null, scope: 'session' },
      {} as never,
    )

    expect(serviceMocks.yiSemanticSearch).toHaveBeenCalledWith('plan', 8, 0, 'session')
    expect(result).toEqual({ ok: true, value: { results: [] } })
  })

  it('normalizes memory pack args before forwarding', async () => {
    serviceMocks.yiGetMemoryPack.mockResolvedValue({ pack: { records: [] } })

    const result = await yiGetPackTool.handler(
      {
        mode: 'coding',
        query: 'needle',
        projectKey: 42,
        conversationId: 'conv_1',
        limit: 'not-a-number',
        maxTokens: 2048,
        recipient: 'model',
      },
      {} as never,
    )

    expect(serviceMocks.yiGetMemoryPack).toHaveBeenCalledWith({
      mode: 'coding',
      query: 'needle',
      projectKey: undefined,
      conversationId: 'conv_1',
      limit: Number.NaN,
      maxTokens: 2048,
      recipient: 'model',
    })
    expect(result).toEqual({ ok: true, value: { pack: { records: [] } } })
  })

  it('passes checkpoint updates through when fields exist', async () => {
    serviceMocks.yiUpdateCheckpoint.mockResolvedValue({ ok: true })

    const result = await yiUpdateCheckpointTool.handler(
      { last_core_index: 17, last_save_time: '2026-06-22T04:00:00.000Z' },
      {} as never,
    )

    expect(serviceMocks.yiUpdateCheckpoint).toHaveBeenCalledWith({
      last_core_index: 17,
      last_save_time: '2026-06-22T04:00:00.000Z',
    })
    expect(result).toEqual({ ok: true, value: { ok: true } })
  })

  it('ignores invalid checkpoint input values', async () => {
    serviceMocks.yiUpdateCheckpoint.mockResolvedValue({ ok: true })

    await yiUpdateCheckpointTool.handler(
      { last_core_index: 'oops', last_save_time: 123 },
      {} as never,
    )

    expect(serviceMocks.yiUpdateCheckpoint).toHaveBeenCalledWith({
      last_core_index: undefined,
      last_save_time: undefined,
    })
  })
})
