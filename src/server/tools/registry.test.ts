import { describe, expect, it } from 'vitest'

import { toolRegistry } from './registry'

describe('toolRegistry', () => {
  it('registers yi-memory tools', () => {
    expect(toolRegistry.get('yi_save_memory')).toBeTruthy()
    expect(toolRegistry.get('yi_get_state')).toBeTruthy()
    expect(toolRegistry.get('yi_get_pack')).toBeTruthy()
  })
})
