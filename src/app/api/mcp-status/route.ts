import { NextResponse } from "next/server"
import { parseMcpServers, getConnectedMcpTools } from "@/server/mcp-bridge"

export async function GET() {
  try {
    const configs = parseMcpServers()
    const totalConfigs = configs.length
    
    // Try to get connected tools if bridge was already started
    let mcpTools: string[] = []
    try {
      mcpTools = getConnectedMcpTools()
    } catch {
      // Bridge not started yet, that's OK
    }
    
    return NextResponse.json({
      total: 0, // Only showing MCP count here
      mcpCount: mcpTools.length,
      mcpConfigs: totalConfigs,
      mcpTools,
      message: "MCP bridge auto-loads from ~/.codex/config.toml"
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
