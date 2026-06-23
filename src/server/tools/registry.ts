import { askUserTool } from './ask-user'
import { bashTool } from './bash'
import { commandRunTool } from './command-run'
import { addAgentTool, closeAgentTool, listAgentsTool, removeAgentTool, waitAgentTool } from './multi-agent-collab'
import { deployArtifactTool } from './deploy-artifact'
import { deployWorkspaceTool } from './deploy-workspace'
import { fsListTool } from './fs-list'
import { fsReadTool } from './fs-read'
import { fsWriteTool } from './fs-write'
import { planTasksTool } from './plan-tasks'
import { readArtifactTool } from './read-artifact'
import { readAttachmentTool } from './read-attachment'
import { reportTaskProgressTool } from '../task-progress-report'
import { reportTaskResultTool } from './report-task-result'
import { skillLoadTool } from './skill-load'
import { spawnAgentTool } from './spawn-agent'
import { runPostToolHooks, runPreToolHooks } from '@/server/hooks-system'
import { yiMemoryTools } from './yi-memory-tools'

import type { ToolContext, ToolDef, ToolResult } from './types'
import { writeArtifactTool } from './write-artifact'

class ToolRegistry {
  private mcpLoaded = false
  private mcpLoadPromise: Promise<void> | null = null
  private tools = new Map<string, ToolDef>()

  async ensureMcpTools(): Promise<void> {
    if (this.mcpLoaded) return
    if (!this.mcpLoadPromise) {
      this.mcpLoadPromise = (async () => {
        console.log('[MCP] ensureMcpTools: starting bridge...')
        try {
          const mcpBridge = await import('../mcp-bridge')
          const tools = await mcpBridge.startMcpBridge()
          this.loadMcpTools(tools)
          this.mcpLoaded = true
        } catch (err) {
          console.warn('[MCP] Bridge init failed:', err)
        }
      })().finally(() => {
        this.mcpLoadPromise = null
      })
    }
    await this.mcpLoadPromise
  }

  private loadMcpTools(tools: ToolDef[]): void {
    for (const t of tools) {
      if (!this.tools.has(t.name)) {
        this.tools.set(t.name, t)
      }
    }
  }

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) {
      throw new Error('Tool already registered: ' + tool.name)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  async resolveAsync(names: string[]): Promise<ToolDef[]> {
    await this.ensureMcpTools()
    return this.resolve(names)
  }

  listNames(): string[] {
    return Array.from(this.tools.keys())
  }

  resolve(names: string[]): ToolDef[] {
    const resolved: ToolDef[] = []
    for (const name of names) {
      const t = this.tools.get(name)
      if (!t) throw new Error('Unknown tool: ' + name)
      resolved.push(t)
    }
    return resolved
  }

  async execute(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { ok: false, error: 'Unknown tool: ' + toolName }
    }
    try {
      const pre = await runPreToolHooks({
        agentId: ctx.agentId || '',
        conversationId: ctx.conversationId || '',
        toolName,
        toolArgs: args,
        workspacePath: ctx.workspacePath || '',
      })
      if (!pre.allowed) return { ok: false, error: pre.reason || 'Blocked by hook' }
      if (pre.modifiedArgs) args = pre.modifiedArgs
    } catch {
      /* hooks never block */
    }
    try {
      const result = await tool.handler(args, ctx)
      try {
        const post = await runPostToolHooks({
          agentId: ctx.agentId || '',
          conversationId: ctx.conversationId || '',
          toolName,
          toolArgs: args,
          toolResult: result,
          workspacePath: ctx.workspacePath || '',
        })
        if (post.modifiedResult) return post.modifiedResult
        if (post.appendNote && result.ok) {
          const value = typeof result.value === 'string' ? result.value : JSON.stringify(result.value)
          result.value = value + '\n' + post.appendNote
        }
      } catch {
        /* hooks never block */
      }
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry()
  reg.register(writeArtifactTool)
  reg.register(readArtifactTool)
  reg.register(deployArtifactTool)
  reg.register(deployWorkspaceTool)
  reg.register(readAttachmentTool)
  reg.register(planTasksTool)
  reg.register(reportTaskResultTool)
  reg.register(reportTaskProgressTool)
  reg.register(fsListTool)
  reg.register(fsReadTool)
  reg.register(fsWriteTool)
  reg.register(bashTool)
  reg.register(skillLoadTool)
  reg.register(askUserTool)
  reg.register(commandRunTool)
  reg.register(spawnAgentTool)
  reg.register(closeAgentTool)
  reg.register(waitAgentTool)
  reg.register(listAgentsTool)
  reg.register(addAgentTool)
  reg.register(removeAgentTool)
  for (const t of yiMemoryTools) reg.register(t)
  return reg
}

export const toolRegistry = buildRegistry()
export type { ToolContext, ToolDef, ToolResult } from './types'
