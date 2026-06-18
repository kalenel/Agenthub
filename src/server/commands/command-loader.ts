/**
 * Commands System ? custom shortcut commands for agents.
 * Commands are loaded from:
 *  1. ~/.codex/commands/  (user-level)
 *  2. .codex/commands/    (project-level, in workspace)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { homedir } from 'node:os'

export interface CommandDef {
  name: string
  description: string
  body: string
  source: string
}

let _cache: CommandDef[] | null = null;

function parseCommandFile(filePath: string): CommandDef | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    // Parse frontmatter: ---\nname: xxx\ndescription: xxx\n---\nbody
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!match) return null
    const fm = match[1]
    const body = match[2].trim()
    const nameMatch = fm.match(/^name:\s*(.+)$/m)
    if (!nameMatch) return null
    let description = ''
    const descMatch = fm.match(/^description:\s*(.+)$/m)
    if (descMatch) description = descMatch[1].trim().replace(/^"|"$/g, '')
    return {
      name: nameMatch[1].trim(),
      description,
      body: body.substring(0, 4000),
      source: filePath,
    }
  } catch {
    return null;
  }
}

function scanCommandsDir(dir: string, cmds: CommandDef[]) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry.endsWith('.md') || entry.endsWith('.mjs')) {
      const cmd = parseCommandFile(full);
      if (cmd) cmds.push(cmd);
    }
  }
}

export function loadCommands(workspacePath?: string): CommandDef[] {
  if (_cache) return _cache;
  const cmds: CommandDef[] = []
  // User-level
  scanCommandsDir(join(homedir(), '.codex', 'commands'), cmds);
  // Project-level
  if (workspacePath) scanCommandsDir(join(workspacePath, '.codex', 'commands'), cmds);
  _cache = cmds;
  return cmds;
}

export function getCommandByName(name: string): CommandDef | undefined {
  const cmds = loadCommands();
  return cmds.find(c => c.name === name);
}

export function buildCommandsRegistry(workspacePath?: string): string {
  const cmds = loadCommands(workspacePath);
  if (cmds.length === 0) return '';
  const lines = cmds.map(c => '- **' + c.name + '**: ' + (c.description || c.body.substring(0, 80)));
  return '## Available Commands\n' + lines.join('\n') + '\n\nCall **command_run** with a command name to execute it.';
}

export function clearCommandCache(): void {
  _cache = null;
}