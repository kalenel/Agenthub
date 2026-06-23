import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.hoisted(() => vi.fn())
const readdirSyncMock = vi.hoisted(() => vi.fn())
const requireMock = vi.hoisted(() => vi.fn())
const homedirMock = vi.hoisted(() => vi.fn(() => 'C:\\Users\\xiong'))

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
}))

vi.mock('node:module', () => ({
  createRequire: () => requireMock,
}))

vi.mock('node:os', () => ({
  homedir: homedirMock,
}))

import { clearHookCache, loadHooks, runPostToolHooks, runPreToolHooks } from './hooks-system'

describe('hooks-system', () => {
  beforeEach(() => {
    clearHookCache()
    existsSyncMock.mockReset()
    readdirSyncMock.mockReset()
    requireMock.mockReset()
    homedirMock.mockReturnValue('C:\\Users\\xiong')
  })

  it('loads only js and mjs hook files once then caches them', async () => {
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue(['alpha.js', 'beta.mjs', 'ignored.txt'])
    requireMock.mockImplementation((file: string) => {
      if (file.endsWith('alpha.js')) {
        return { preTool: () => ({ allowed: true }) }
      }
      if (file.endsWith('beta.mjs')) {
        return { postTool: () => ({ appendNote: 'beta' }) }
      }
      return {}
    })

    const hooks = await loadHooks()
    expect(hooks).toHaveLength(2)
    expect(requireMock).toHaveBeenCalledTimes(2)

    const cached = await loadHooks()
    expect(cached).toHaveLength(2)
    expect(requireMock).toHaveBeenCalledTimes(2)
  })

  it('applies preTool modifications and stop-on-deny behavior', async () => {
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue(['alpha.js'])
    requireMock.mockReturnValue({
      preTool: () => ({ allowed: true, modifiedArgs: { value: 2 } }),
    })

    const result = await runPreToolHooks({
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      toolArgs: { value: 1 },
      toolName: 'demo',
    })

    expect(result).toEqual({ allowed: true })
  })

  it('merges postTool notes without leading newline', async () => {
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue(['alpha.js', 'beta.js'])
    requireMock.mockImplementation((file: string) => {
      if (file.endsWith('alpha.js')) return { postTool: () => ({ appendNote: 'first' }) }
      if (file.endsWith('beta.js')) return { postTool: () => ({ appendNote: 'second' }) }
      return {}
    })

    const result = await runPostToolHooks({
      agentId: 'ag_1',
      conversationId: 'conv_1',
      workspacePath: 'C:\\workspace',
      toolResult: { ok: true, value: 'done' },
      toolName: 'demo',
    })

    expect(result).toEqual({ appendNote: 'first\nsecond' })
  })
})
