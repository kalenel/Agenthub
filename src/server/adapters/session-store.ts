export function createAdapterSessionStore(namespace: string): Map<string, string> {
  const globalStore = globalThis as unknown as {
    __agenthubAdapterSessions?: Record<string, Map<string, string>>
  }
  globalStore.__agenthubAdapterSessions ??= {}
  globalStore.__agenthubAdapterSessions[namespace] ??= new Map()
  return globalStore.__agenthubAdapterSessions[namespace]
}

export function adapterSessionKey(conversationId: string, agentId: string): string {
  return `${conversationId}:${agentId}`
}

function clearSessionByConversation(store: Map<string, string>, conversationId: string): void {
  const exactKey = conversationId
  const prefix = `${conversationId}:`
  for (const key of Array.from(store.keys())) {
    if (key === exactKey || key.startsWith(prefix)) store.delete(key)
  }
}

export const claudeCodeSessions = createAdapterSessionStore('claude-code')
export const codexSessions = createAdapterSessionStore('codex')

export function clearClaudeCodeSession(conversationId: string): void {
  clearSessionByConversation(claudeCodeSessions, conversationId)
}

export function clearCodexSession(conversationId: string): void {
  clearSessionByConversation(codexSessions, conversationId)
}
