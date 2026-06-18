import { z } from 'zod'
import { getCommandByName, loadCommands } from '@/server/commands/command-loader'
import type { ToolDef } from '@/server/tools/types'

export const commandRunTool: ToolDef = {
  name: 'command_run',
  description: 'Run a custom command by name. Commands are user-defined shortcuts for common operations. Call this with the exact command name to execute the instructions defined in the command file.',
  parameters: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'The exact command name to run.' },
    },
  },
  async handler(args) {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(args)
    if (!parsed.success) return { ok: false, error: 'name is required' }

    const cmd = getCommandByName(parsed.data.name)
    if (!cmd) {
      const all = loadCommands()
      const names = all.map(c => c.name).join(', ') || '(none)';
      return { ok: false, error: 'Command "' + parsed.data.name + '" not found. Available: ' + names }
    }

    return {
      ok: true,
      value: '## Command: ' + cmd.name + '\n\n' + cmd.body + '\n\n---\nFollow the instructions above.',
    }
  },
};