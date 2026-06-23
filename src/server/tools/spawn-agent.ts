import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, schema } from '@/db/client'
import { agentRegistry } from '@/server/adapters/registry'
import type { AdapterInput } from '@/server/adapters/types'
import { buildHistoryFor } from '@/server/conversation-context'
import {
  createSubAgent,
  registerSubAgentRuntime,
  removeSubAgent,
} from '@/server/sub-agent-manager'
import { getWorkspaceForConversation } from '@/server/fs-service'
import { getEffectiveCwd } from '@/server/workspace-utils'
import type { ToolDef } from './types'

const ArgsSchema = z.object({
  task: z.string().min(1),
  agent_name: z.string().optional(),
  tools: z.array(z.string()).optional(),
})

export const spawnAgentTool: ToolDef = {
  name: 'spawn_agent',
  description:
    'Spawn a sub-agent to work on a task. Returns a sub-agent ID immediately. The sub-agent runs asynchronously. Use close_agent to stop it, resume_agent to give it a new task, send_agent_input to message it, or wait_agent to wait for completion. Use for parallel work: spawn multiple agents then wait for results.',
  parameters: {
    type: 'object',
    required: ['task'],
    properties: {
      task: { type: 'string', description: 'Detailed task with requirements and expected output format.' },
      agent_name: { type: 'string', description: 'Short name for this sub-agent (for tracking).' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Tools to enable. Default: fs_read, fs_write, bash, skill_load.' },
    },
  },
  async handler(args, ctx) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid args: ' + parsed.error.message }

    const { task, agent_name } = parsed.data
    const toolNames = parsed.data.tools ?? ['fs_read', 'fs_write', 'bash', 'skill_load']
    let spawnedSubAgentId: string | null = null

    try {
      const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, ctx.agentId) })
      if (!agent) return { ok: false, error: 'Agent not found' }

      const workspace = await getWorkspaceForConversation(ctx.conversationId)
      if (!workspace) return { ok: false, error: 'Workspace not found' }

      const handle = createSubAgent({
        name: agent_name || 'sub-agent',
        parentAgentId: ctx.agentId,
        parentConvId: ctx.conversationId,
        parentSubAgentId: ctx.subAgentId,
        parentRunId: ctx.runId,
        task,
        toolNames,
      })
      spawnedSubAgentId = handle.id

      const adapter = agentRegistry.getAdapter(agent)
      const turnHistory = await buildHistoryFor(agent.id, ctx.conversationId, { maxTurns: 5 }).catch(() => [])

      registerSubAgentRuntime(handle.id, {
        running: false,
        controller: null,
        parentSignal: ctx.abortSignal,
        async runTurn(nextPrompt: string, runId: string, signal: AbortSignal) {
          const input: AdapterInput = {
            agentId: agent.id,
            conversationId: ctx.conversationId,
            runId,
            subAgentId: handle.id,
            prompt: nextPrompt,
            workspacePath: getEffectiveCwd(workspace),
            systemPrompt:
              agent.systemPrompt +
              '\n\nYou are a sub-agent (ID: ' +
              handle.id +
              ') spawned for a single task. Complete the task and return the result. Do not ask questions.',
            apiKey: agent.apiKey,
            apiBaseUrl: agent.apiBaseUrl,
            modelId: agent.modelId,
            toolNames,
            customConfig:
              agent.adapterName === 'custom' && agent.modelProvider && agent.modelId
                ? {
                    modelProvider: agent.modelProvider,
                    supportsVision: agent.supportsVision,
                  }
                : undefined,
            history: turnHistory,
          }

          const stream = adapter.stream(input, signal)
          let outputText = ''

          try {
            for await (const event of stream) {
              if (event.type === 'part.delta' && event.delta.type === 'text.append') {
                outputText += event.delta.text
              }
            }
            return outputText || '(No output)'
          } finally {
            if (signal.aborted && handle.status !== 'closed') {
              handle.status = 'closed'
            }
          }
        },
      })

      return {
        ok: true,
        value:
          '## Sub-agent spawned\n\n- **ID**: ' +
          handle.id +
          '\n- **Run**: ' +
          handle.activeRunId +
          '\n- **Name**: ' +
          handle.name +
          '\n- **Status**: running\n- **Task**: ' +
          task.substring(0, 200) +
          '\n\nUse **wait_agent** to wait for the result, **send_agent_input** to append more work, or **close_agent** to cancel.',
      }
    } catch (err) {
      if (spawnedSubAgentId) removeSubAgent(spawnedSubAgentId)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
