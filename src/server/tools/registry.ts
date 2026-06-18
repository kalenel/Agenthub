import { askUserTool } from "./ask-user"
import { bashTool } from "./bash"
import { deployArtifactTool } from "./deploy-artifact"
import { deployWorkspaceTool } from "./deploy-workspace"
import { fsListTool } from "./fs-list"
import { fsReadTool } from "./fs-read"
import { fsWriteTool } from "./fs-write"
import { planTasksTool } from "./plan-tasks"
import { readArtifactTool } from "./read-artifact"
import { readAttachmentTool } from "./read-attachment"
import { reportTaskResultTool } from "./report-task-result"
import type { ToolContext, ToolDef, ToolResult } from "./types"
import { writeArtifactTool } from "./write-artifact"
import { skillLoadTool } from "./skill-load"
import { yiMemoryTools } from "./yi-memory-tools"
import { spawnAgentTool } from "./spawn-agent"
import { closeAgentTool, waitAgentTool, listAgentsTool } from "./multi-agent-collab"
import { commandRunTool } from "./command-run"

class ToolRegistry {
  private mcpLoaded = false
  private tools = new Map<string, ToolDef>()

  async ensureMcpTools(): Promise<void> {
    if (this.mcpLoaded) return
    this.mcpLoaded = true
    console.log("[MCP] ensureMcpTools: starting bridge...")
    try {
      const { startMcpBridge } = await import("@/server/mcp-bridge")
      const tools = await startMcpBridge()
      for (const t of tools) {
        if (!this.tools.has(t.name)) {
          this.tools.set(t.name, t)
        }
      }
    } catch (err) {
      console.warn("[MCP] Bridge init failed:", err)
    }
  }

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) {
      throw new Error("Tool already registered: " + tool.name)
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
      if (!t) throw new Error("Unknown tool: " + name)
      resolved.push(t)
    }
    return resolved
  }

  async execute(toolName: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { ok: false, error: "Unknown tool: " + toolName }
    }
    // Run pre-tool hooks (lazy import to avoid Turbopack static analysis issues)
    try {
      const { runPreToolHooks } = await import("@/server/hooks-system")
      const pre = await runPreToolHooks({
        agentId: ctx.agentId || "",
        conversationId: ctx.conversationId || "",
        toolName,
        toolArgs: args,
        workspacePath: ctx.workspacePath || "",
      })
      if (!pre.allowed) return { ok: false, error: pre.reason || "Blocked by hook" }
      if (pre.modifiedArgs) args = pre.modifiedArgs
    } catch { /* hooks never block */ }
    try {
      const result = await tool.handler(args, ctx)
      // Run post-tool hooks
      try {
        const { runPostToolHooks } = await import("@/server/hooks-system")
        const post = await runPostToolHooks({
          agentId: ctx.agentId || "",
          conversationId: ctx.conversationId || "",
          toolName,
          toolArgs: args,
          toolResult: result,
          workspacePath: ctx.workspacePath || "",
        })
        if (post.modifiedResult) return post.modifiedResult
        if (post.appendNote && result.ok) {
          result.value = (result.value || "") + "\n" + post.appendNote
        }
      } catch { /* hooks never block */ }
      return result
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
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
  for (const t of yiMemoryTools) reg.register(t)
  return reg
}

export const toolRegistry = buildRegistry()
export type { ToolContext, ToolDef, ToolResult } from "./types"
