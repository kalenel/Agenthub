import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface RulesBlock {
  path: string
  content: string
  scope: string
}

const MAX_RULES_SIZE = 16000

export function loadRules(workspacePath: string): RulesBlock[] {
  const blocks: RulesBlock[] = []
  let current = workspacePath

  while (current && current !== dirname(current)) {
    const agentsFile = join(current, 'AGENTS.md')
    if (existsSync(agentsFile)) {
      try {
        const content = readFileSync(agentsFile, 'utf8')
        blocks.push({
          path: agentsFile,
          content,
          scope: current === workspacePath ? 'project' : 'parent',
        })
      } catch { /* skip */ }
    }
    current = dirname(current)
  }

  return blocks
}

export function buildRulesInjection(workspacePath: string): string {
  const blocks = loadRules(workspacePath)
  if (blocks.length === 0) return ''

  let total = 0
  const parts: string[] = []

  for (const block of blocks) {
    const truncated = block.content.length > MAX_RULES_SIZE
      ? block.content.substring(0, MAX_RULES_SIZE) + '\n... (truncated)'
      : block.content
    if (total + truncated.length > MAX_RULES_SIZE * 2) break
    parts.push('--- AGENTS.md (' + block.scope + '): ' + block.path + ' ---\n' + truncated)
    total += truncated.length
  }

  return '\n\n## Project Rules (AGENTS.md)\n' + parts.join('\n\n')
}