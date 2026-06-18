import { z } from 'zod'
import type { ToolDef } from './types'
import {
  closeSubAgent,
  resumeSubAgent,
  getSubAgent,
  listSubAgents,
  waitForSubAgent,
} from '@/server/sub-agent-manager'

// -- close_agent --
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
    const parsed = z.object({ target: z.string().min(1) }).safeParse(args)
    if (!parsed.success) return { ok: false, error: 'target is required' }

    const handle = getSubAgent(parsed.data.target)
    if (!handle) return { ok: false, error: 'Sub-agent not found: ' + parsed.data.target }

    const prevStatus = handle.status;
    closeSubAgent(parsed.data.target);

    return {
      ok: true,
      value: 'Closed sub-agent **' + handle.name + '** (ID: ' + handle.id + '). Previous status: ' + prevStatus + '.',
    }
  },
};

// resume_agent removed - needs async message bus
// resume_agent removed - needs async message bus

// send_agent_input removed - needs async message bus
// send_agent_input removed - needs async message bus

// -- wait_agent --
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
    const parsed = z.object({ targets: z.array(z.string()).min(1), timeout_ms: z.number().optional() }).safeParse(args)
    if (!parsed.success) return { ok: false, error: 'targets array is required' }

    const { targets, timeout_ms } = parsed.data;

    // Verify all exist
    for (const id of targets) {
      const h = getSubAgent(id);
      if (!h) return { ok: false, error: 'Sub-agent not found: ' + id }
    }

    try {
      // Race: wait for first to finish
      const promises = targets.map(id => waitForSubAgent(id, timeout_ms || 30000));
      const finished = await Promise.race(promises);

      return {
        ok: true,
        value: '## Sub-agent ' + finished.name + ' finished\n\n**Status**: ' + finished.status + '\n\n' + (finished.result || finished.error || 'No output'),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
};

// -- list_agents --
export const listAgentsTool: ToolDef = {
  name: 'list_agents',
  description: 'List all sub-agents in the current conversation with their statuses. Useful for checking what agents are running, completed, or closed.',
  parameters: { type: 'object', properties: {} },
  async handler(args, ctx) {
    const all = listSubAgents(ctx.conversationId);
    if (all.length === 0) return { ok: true, value: 'No sub-agents in this conversation.' }

    const lines = all.map(a => '- **' + a.name + '** (' + a.id + '): ' + a.status);
    return { ok: true, value: '## Sub-agents\n\n' + lines.join('\n') }
  },
};