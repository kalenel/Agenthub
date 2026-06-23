import { beforeEach, describe, expect, it } from 'vitest'

import {
  adapterSessionKey,
  claudeCodeSessions,
  clearClaudeCodeSession,
  clearCodexSession,
  codexSessions,
  createAdapterSessionStore,
} from './session-store'

describe('adapter session store', () => {
  beforeEach(() => {
    claudeCodeSessions.clear()
    codexSessions.clear()
  })

  it('reuses per-namespace stores and keeps namespaces isolated', () => {
    const otherClaudeStore = createAdapterSessionStore('claude-code')
    const otherCodexStore = createAdapterSessionStore('codex')

    expect(otherClaudeStore).toBe(claudeCodeSessions)
    expect(otherCodexStore).toBe(codexSessions)
    expect(otherClaudeStore).not.toBe(otherCodexStore)

    otherClaudeStore.set('conv_1:ag_1', 'thread-1')
    otherCodexStore.set('conv_1:ag_1', 'thread-2')

    expect(claudeCodeSessions.get('conv_1:ag_1')).toBe('thread-1')
    expect(codexSessions.get('conv_1:ag_1')).toBe('thread-2')
  })

  it('builds session keys and clears only matching conversation sessions', () => {
    claudeCodeSessions.set('conv_1', 'root-thread')
    claudeCodeSessions.set('conv_1:ag_1', 'child-thread')
    claudeCodeSessions.set('conv_2:ag_1', 'other-thread')
    codexSessions.set('conv_1:ag_1', 'codex-thread')

    expect(adapterSessionKey('conv_1', 'ag_1')).toBe('conv_1:ag_1')

    clearClaudeCodeSession('conv_1')

    expect(claudeCodeSessions.has('conv_1')).toBe(false)
    expect(claudeCodeSessions.has('conv_1:ag_1')).toBe(false)
    expect(claudeCodeSessions.has('conv_2:ag_1')).toBe(true)
    expect(codexSessions.has('conv_1:ag_1')).toBe(true)

    clearCodexSession('conv_1')
    expect(codexSessions.has('conv_1:ag_1')).toBe(false)
  })
})
