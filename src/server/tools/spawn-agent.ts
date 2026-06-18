import { z } from 'zod'

import { db, schema } from '@/db/client'
import { agentRegistry } from '@/server/adapters/registry'
import { toolRegistry } from '@/server/tools/registry'
import { buildHistoryFor } from '@/server/conversation-context'
import { getWorkspaceForConversation } from '@/server/fs-service'
import { getEffectiveCwd } from '@/server/workspace-utils'
import { createSubAgent, completeSubAgent, failSubAgent } from '@/server/sub-agent-manager'
import type { ToolDef } from './types'

const ArgsSchema = z.object({
  task: z.string().min(1),
  agent_name: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

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

    try {
      const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, ctx.agentId) })
      if (!agent) return { ok: false, error: 'Agent not found' }

      const workspace = await getWorkspaceForConversation(ctx.conversationId)
      if (!workspace) return { ok: false, error: 'Workspace not found' }

      // Create sub-agent handle
      const handle = createSubAgent({
        name: agent_name || 'sub-agent',
        parentAgentId: ctx.agentId,
        parentConvId: ctx.conversationId,
        task,
        toolNames,
      });

      const adapter = agentRegistry.getAdapter(agent)
      const history = await buildHistoryFor(agent.id, ctx.conversationId, { maxTurns: 5 }).catch(() => [])

      const input = {
        agentId: agent.id,
        conversationId: ctx.conversationId,
        runId: '',
        prompt: task,
        workspacePath: getEffectiveCwd(workspace),
        systemPrompt: agent.systemPrompt + '\n\nYou are a sub-agent (ID: ' + handle.id + ') spawned for a single task. Complete the task and return the result. Do not ask questions.',
        apiKey: agent.apiKey,
        apiBaseUrl: agent.apiBaseUrl,
        modelId: agent.modelId,
        toolNames,
        customConfig: agent.adapterName === 'custom' && agent.modelProvider && agent.modelId ? {
          modelProvider: agent.modelProvider,
          supportsVision: agent.supportsVision,
        } : undefined,
        history,
      }

      // Run asynchronously ? don't await, fire and forget with callback
      const stream = adapter.stream(input, ctx.abortSignal)
      const parts: Array<{ type: string; text?: string }> = []

      // Fire async collector
      (async () => {
        try {
          for await (const event of stream) {
            if (event.type === 'text' && 'text' in event) {
              const last = parts[parts.length - 1]
              if (last && last.type === 'text') {
                last.text = (last.text ?? '') + event.text
              } else {
                parts.push({ type: 'text', text: event.text })
              }
            }
          }
          const text = parts.filter(p => p.type === 'text').map(p => p.text).join('')
          completeSubAgent(handle.id, text || '(No output)')
          console.log('[SubAgent] ' + handle.id + ' completed')
        } catch (err) {
          failSubAgent(handle.id, err instanceof Error ? err.message : String(err))
          console.warn('[SubAgent] ' + handle.id + ' failed:', err instanceof Error ? err.message : err)
        }
      })();

      return {
        ok: true,
        value: '## Sub-agent spawned\n\n- **ID**: ' + handle.id + '\n- **Name**: ' + handle.name + '\n- **Status**: running\n- **Task**: ' + task.substring(0, 200) + '\n\nUse **wait_agent** to wait for the result, or **close_agent** to cancel.',
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}