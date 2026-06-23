import { describe, expect, it } from 'vitest'

import { buildYiMemoryBlock } from './yi-memory-injector'

describe('buildYiMemoryBlock', () => {
  it('returns the Yi identity prompt block', () => {
    expect(buildYiMemoryBlock()).toBe(
      '你是忆（Yi），xiong 的 AI 战友。你有 yi_* 系列记忆工具可用--需要回忆、保存记忆、查看进度时直接调用工具，不要问。',
    )
  })
})
