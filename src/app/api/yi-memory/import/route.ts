import { NextRequest, NextResponse } from 'next/server'

import { restoreMemoryPackArchive } from '@/server/yi-memory/archive'

function getConversationId(form: FormData, req: NextRequest): string | null {
  const direct = form.get('conversationId') ?? form.get('targetConversationId')
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const fromQuery = req.nextUrl.searchParams.get('conversationId') ?? req.nextUrl.searchParams.get('targetConversationId')
  return fromQuery?.trim() || null
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const conversationId = getConversationId(form, req)
  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
  }

  const archive = form.get('archive') ?? form.get('file')
  if (!(archive instanceof File)) {
    return NextResponse.json({ error: 'Missing archive file' }, { status: 400 })
  }

  try {
    const result = await restoreMemoryPackArchive(await archive.arrayBuffer(), conversationId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
