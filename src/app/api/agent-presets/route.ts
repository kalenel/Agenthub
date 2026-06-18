import { NextResponse } from 'next/server'
import { AGENT_PRESETS } from '@/server/agent-presets/presets-data'

export async function GET() {
  return NextResponse.json({ presets: AGENT_PRESETS })
}