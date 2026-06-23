import { NextResponse } from 'next/server'

import { listSubAgents } from '@/server/sub-agent-manager'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** GET /api/conversations/:id/sub-agents */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  return NextResponse.json({ subAgents: listSubAgents(id) })
}
