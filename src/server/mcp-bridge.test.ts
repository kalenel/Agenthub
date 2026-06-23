import { beforeEach, describe, expect, it, vi } from 'vitest'

const readFileSyncMock = vi.hoisted(() => vi.fn())
const homedirMock = vi.hoisted(() => vi.fn(() => 'C:\\Users\\xiong'))
const clientInstances = vi.hoisted(() => [] as Array<{
  connect: ReturnType<typeof vi.fn>
  listTools: ReturnType<typeof vi.fn>
  callTool: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}>)
const clientConstructMock = vi.hoisted(() => vi.fn())
const stdioTransportMock = vi.hoisted(() => vi.fn())
const httpTransportMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  readFileSync: readFileSyncMock,
}))

vi.mock('node:os', () => ({
  homedir: homedirMock,
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class ClientMock {
    connect = vi.fn().mockResolvedValue(undefined)
    listTools = vi.fn().mockResolvedValue({ tools: [] })
    callTool = vi.fn()
    close = vi.fn().mockResolvedValue(undefined)
    constructor(...args: unknown[]) {
      clientConstructMock(...args)
      clientInstances.push(this)
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class StdioClientTransportMock {
    cfg: unknown
    constructor(cfg: unknown) {
      stdioTransportMock(cfg)
      this.cfg = cfg
    }
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransportMock {
    url: URL
    constructor(url: URL) {
      httpTransportMock(url)
      this.url = url
    }
  },
}))

import { getConnectedMcpTools, parseMcpServers, startMcpBridge, stopMcpBridge } from './mcp-bridge'

describe('mcp-bridge', () => {
  beforeEach(async () => {
    readFileSyncMock.mockReset()
    homedirMock.mockReturnValue('C:\\Users\\xiong')
    clientInstances.length = 0
    clientConstructMock.mockReset()
    stdioTransportMock.mockReset()
    httpTransportMock.mockReset()
    await stopMcpBridge()
  })

  it('parses stdio and http server configs from TOML', () => {
    readFileSyncMock.mockReturnValue(`
[mcp_servers.alpha]
type = "stdio"
command = "pnpm"
args = ["dev", "--port", "3000"]

[mcp_servers.alpha.env]
NODE_ENV = "development"
FOO = "bar"

[mcp_servers.beta]
type = "http"
url = "https://example.invalid/mcp"
`)

    expect(parseMcpServers()).toEqual([
      {
        name: 'alpha',
        type: 'stdio',
        command: 'pnpm',
        args: ['dev', '--port', '3000'],
        env: { NODE_ENV: 'development', FOO: 'bar' },
      },
      {
        name: 'beta',
        type: 'http',
        env: {},
        url: 'https://example.invalid/mcp',
      },
    ])
  })

  it('connects to configured servers and exposes loaded tools', async () => {
    readFileSyncMock.mockReturnValue(`
[mcp_servers.alpha]
type = "stdio"
command = "pnpm"
args = ["dev"]
`)

    const tools = await startMcpBridge()
    expect(tools).toHaveLength(0)
    expect(clientInstances).toHaveLength(1)
    expect(clientConstructMock).toHaveBeenCalledTimes(1)
    expect(stdioTransportMock).toHaveBeenCalledTimes(1)
    expect(clientInstances[0].connect).toHaveBeenCalledTimes(1)
    expect(clientInstances[0].listTools).toHaveBeenCalledTimes(1)
    expect(getConnectedMcpTools()).toEqual([])
  })

  it('stops connected clients', async () => {
    readFileSyncMock.mockReturnValue(`
[mcp_servers.alpha]
type = "stdio"
command = "pnpm"
args = ["dev"]
`)

    await startMcpBridge()
    expect(clientInstances).toHaveLength(1)

    await stopMcpBridge()
    expect(clientInstances[0].close).toHaveBeenCalledTimes(1)
    expect(getConnectedMcpTools()).toEqual([])
  })
})
