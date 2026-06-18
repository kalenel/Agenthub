import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ToolDef } from '@/server/tools/types'

interface McpServerConfig {
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

/** Parse Codex config.toml for MCP server definitions */
export function parseMcpServers(): McpServerConfig[] {
  const configPath = join(homedir(), '.codex', 'config.toml')
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    console.warn('[MCP] Cannot read config.toml at', configPath)
    return []
  }

  const servers: McpServerConfig[] = []
  const lines = raw.split(/\r?\n/)

  let current: McpServerConfig | null = null
  let inEnv = false

  for (const line of lines) {
    // Match [mcp_servers.<name>]
    const section = line.match(/^\[mcp_servers\.(\w[\w-]*)\]$/)
    if (section) {
      if (current) servers.push(current)
      current = { name: section[1], type: 'stdio', env: {} }
      inEnv = false
      continue
    }

    // Match [mcp_servers.<name>.env]
    const envSection = line.match(/^\[mcp_servers\.(\w[\w-]*)\.env\]$/)
    if (envSection && current && envSection[1] === current.name) {
      inEnv = true
      continue
    }

    // End of current section
    if (line.startsWith('[') && current) {
      servers.push(current)
      current = null
      inEnv = false
      continue
    }

    if (!current) continue

    // type = "http"
    const typeMatch = line.match(/^type\s*=\s*"(\w+)"/)
    if (typeMatch && !inEnv) {
      current.type = typeMatch[1] as 'stdio' | 'http'
      continue
    }

    // url = "..."
    const urlMatch = line.match(/^url\s*=\s*"(.+)"/)
    if (urlMatch && !inEnv) {
      current.url = urlMatch[1]
      continue
    }

    // command = '...' or command = "..."
    const cmdMatch = line.match(/^command\s*=\s*['"](.+?)['"]$/)
    if (cmdMatch && !inEnv) {
      current.command = cmdMatch[1]
      continue
    }

    // args = ["...", "..."]
    const argsMatch = line.match(/^args\s*=\s*\[(.*)\]$/)
    if (argsMatch && !inEnv) {
      const argsStr = argsMatch[1]
      const argParts = argsStr.match(/["']([^"']*?)["']/g)
      if (argParts) {
        current.args = argParts.map(a => a.slice(1, -1))
      }
      continue
    }

    // env vars: KEY = "VALUE" or KEY = 'VALUE'
    if (inEnv) {
      const envMatch = line.match(/^(\w+)\s*=\s*['"](.+?)['"]$/)
      if (envMatch) {
        current.env = current.env || {}
        current.env[envMatch[1]] = envMatch[2]
      }
    }
  }

  if (current) servers.push(current)
  return servers
}

interface McpConnection {
  client: Client
  tools: ToolDef[]
}

const connections = new Map<string, McpConnection>()

export async function startMcpBridge(): Promise<ToolDef[]> {
  const allTools: ToolDef[] = []
  const configs = parseMcpServers()

  console.log('[MCP] Found', configs.length, 'server configs in config.toml:', configs.map(c => c.name + ' (' + c.type + ')').join(', '))

  for (const cfg of configs) {
    try {
      let transport

      if (cfg.type === 'http' && cfg.url) {
        transport = new StreamableHTTPClientTransport(new URL(cfg.url))
      } else if (cfg.command) {
        transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
          env: cfg.env,
        })
      } else {
        console.warn('[MCP]', cfg.name, ': no command or url, skipping')
        continue
      }

      const client = new Client(
        { name: 'agenthub', version: '1.0.0' },
        { capabilities: {} }
      )

      await client.connect(transport)

      const result = await client.listTools()
      const tools: ToolDef[] = result.tools.map(t => ({
        name: 'mcp__' + cfg.name + '__' + t.name,
        description: '[MCP:' + cfg.name + '] ' + (t.description || t.name),
        parameters: t.inputSchema ?? { type: 'object', properties: {} },
        async handler(args, ctx) {
          try {
            const res = await client.callTool({
              name: t.name,
              arguments: args as Record<string, unknown>,
            })
            const text = res.content
              .filter(c => c.type === 'text')
              .map(c => (c as { text: string }).text)
              .join('\n')
            return { ok: true, value: text || JSON.stringify(res.content) }
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) }
          }
        },
      }))

      connections.set(cfg.name, { client, tools })
      allTools.push(...tools)
      console.log('[MCP]', cfg.name + ':', tools.length, 'tools loaded')
    } catch (err) {
      console.warn('[MCP]', cfg.name, 'failed:', err instanceof Error ? err.message : err)
    }
  }

  return allTools
}

/** Close all MCP connections */


/** Get names of all tools from already-connected MCP servers */
export function getConnectedMcpTools(): string[] {
  const names: string[] = []
  for (const [serverName, conn] of connections) {
    for (const tool of conn.tools) {
      names.push(tool.name)
    }
  }
  return names
}

export async function stopMcpBridge(): Promise<void> {
  for (const [name, conn] of connections) {
    try {
      await conn.client.close()
      console.log('[MCP]', name + ': disconnected')
    } catch (err) {
      console.warn('[MCP]', name, 'close error:', err)
    }
  }
  connections.clear()
}