import { z } from 'zod'

import { addAgentsToConversation, removeAgentsFromConversation } from '@/server/conversation-service'
import { closeSubAgent, getSubAgent, listSubAgents, resumeSubAgent, sendSubAgentInput, waitForSubAgent } from '@/server/sub-agent-manager'
import type { ToolDef } from './types'

const AddArgsSchema = z.object({ target: z.string().min(1) })
const RemoveArgsSchema = z.object({ target: z.string().min(1) })
const ResumeArgsSchema = z.object({ target: z.string().min(1), task: z.string().min(1) })
const SendArgsSchema = z.object({ target: z.string().min(1), input: z.string().min(1) })
const WaitArgsSchema = z.object({ targets: z.array(z.string().min(1)).min(1), timeout_ms: z.number().int().positive().optional() })

export const addAgentTool: ToolDef = {
  name: 'add_agent',
  description: 'Add an existing agent to the current group conversation. Use when the task needs a capability that is missing from the current roster.',
  parameters: {
    type: 'object',
    required: ['target'],
    properties: {
      target: { type: 'string', description: 'Agent ID to add to the current conversation.' },
    },
  },
  async handler(args, ctx) {
    const parsed = AddArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target is required' }

    try {
      const conversation = await addAgentsToConversation({ conversationId: ctx.conversationId, agentIds: [parsed.data.target] })
      return {
        ok: true,
        value: 'Added agent to conversation. Current roster: ' + conversation.agentIds.join(', '),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const removeAgentTool: ToolDef = {
  name: 'remove_agent',
  description: 'Remove an agent from the current group conversation when it is no longer relevant or is blocking progress.',
  parameters: {
    type: 'object',
    required: ['target'],
    properties: {
      target: { type: 'string', description: 'Agent ID to remove from the current conversation.' },
    },
  },
  async handler(args, ctx) {
    const parsed = RemoveArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target is required' }
    if (parsed.data.target === ctx.agentId) return { ok: false, error: 'Cannot remove the current agent from the conversation' }

    try {
      const conversation = await removeAgentsFromConversation({ conversationId: ctx.conversationId, agentIds: [parsed.data.target] })
      return {
        ok: true,
        value: 'Removed agent from conversation. Current roster: ' + conversation.agentIds.join(', '),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const closeAgentTool: ToolDef = {
  name: 'close_agent',
  description: 'Close a sub-agent and any open descendants when they are no longer needed. Returns the agent\'s previous status before shutdown.',
  parameters: {
    type: 'object',
    required: ['target'],
    properties: {
      target: { type: 'string', description: 'Sub-agent ID to close (from spawn_agent result).' },
    },
  },
  async handler(args) {
    const parsed = RemoveArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target is required' }

    const handle = getSubAgent(parsed.data.target)
    if (!handle) return { ok: false, error: 'Sub-agent not found: ' + parsed.data.target }

    const prevStatus = handle.status
    closeSubAgent(parsed.data.target)

    return {
      ok: true,
      value: 'Closed sub-agent **' + handle.name + '** (ID: ' + handle.id + '). Previous status: ' + prevStatus + '.',
    }
  },
}

export const resumeAgentTool: ToolDef = {
  name: 'resume_agent',
  description: 'Give an existing sub-agent a fresh task and resume its runtime. This restarts the agent queue with the new task.',
  parameters: {
    type: 'object',
    required: ['target', 'task'],
    properties: {
      target: { type: 'string', description: 'Sub-agent ID to resume (from spawn_agent result).' },
      task: { type: 'string', description: 'New task or follow-up work for the sub-agent.' },
    },
  },
  async handler(args) {
    const parsed = ResumeArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target and task are required' }

    const handle = resumeSubAgent(parsed.data.target, parsed.data.task)
    if (!handle) return { ok: false, error: 'Sub-agent not found or cannot be resumed: ' + parsed.data.target }

    return {
      ok: true,
      value: 'Resumed sub-agent **' + handle.name + '** (ID: ' + handle.id + ') with a new task.',
    }
  },
}

export const sendAgentInputTool: ToolDef = {
  name: 'send_agent_input',
  description: 'Append additional input to a running sub-agent. Useful for incremental guidance without restarting the agent.',
  parameters: {
    type: 'object',
    required: ['target', 'input'],
    properties: {
      target: { type: 'string', description: 'Sub-agent ID to message (from spawn_agent result).' },
      input: { type: 'string', description: 'Additional guidance or clarification for the sub-agent.' },
    },
  },
  async handler(args) {
    const parsed = SendArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target and input are required' }

    const handle = sendSubAgentInput(parsed.data.target, parsed.data.input)
    if (!handle) return { ok: false, error: 'Sub-agent not found or closed: ' + parsed.data.target }

    return {
      ok: true,
      value: 'Sent input to sub-agent **' + handle.name + '** (ID: ' + handle.id + ').',
    }
  },
}

export const waitAgentTool: ToolDef = {
  name: 'wait_agent',
  description: 'Wait for one or more sub-agents to complete (any final status: completed, error, or closed). Returns the first agent to finish. Use timeout_ms for longer waits. Useful for spawning parallel agents and collecting results.',
  parameters: {
    type: 'object',
    required: ['targets'],
    properties: {
      targets: { type: 'array', items: { type: 'string' }, description: 'Sub-agent IDs to wait on. If multiple, returns whichever finishes first.' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds. Default: 30000.' },
    },
  },
  async handler(args) {
    const parsed = WaitArgsSchema.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'targets array is required' }

    const { targets, timeout_ms } = parsed.data

    for (const id of targets) {
      const handle = getSubAgent(id)
      if (!handle) return { ok: false, error: 'Sub-agent not found: ' + id }
    }

    try {
      const promises = targets.map((id) => waitForSubAgent(id, timeout_ms || 30000))
      const finished = await Promise.race(promises)

      return {
        ok: true,
        value:
          '## Sub-agent ' +
          finished.name +
          ' finished\n\n**Status**: ' +
          finished.status +
          '\n\n' +
          (finished.result || finished.error || 'No output'),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const listAgentsTool: ToolDef = {
  name: 'list_agents',
  description: 'List all sub-agents in the current conversation with their statuses. Useful for checking what agents are running, completed, or closed.',
  parameters: { type: 'object', properties: {} },
  async handler(_args, ctx) {
    const all = listSubAgents(ctx.conversationId)
    if (all.length === 0) return { ok: true, value: 'No sub-agents in this conversation.' }

    const lines = all.map((agent) => '- **' + agent.name + '** (' + agent.id + '): ' + agent.status)
    return { ok: true, value: '## Sub-agents\n\n' + lines.join('\n') }
  },
}
