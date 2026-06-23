import { NextResponse } from 'next/server'

import { buildMemoryPackArchive, type MemoryPackArchiveExportInput } from '@/server/yi-memory/archive'

function parseMemoryMode(value: string | null): MemoryPackArchiveExportInput['mode'] {
  if (
    value === 'coding' ||
    value === 'chat' ||
    value === 'report' ||
    value === 'recovery' ||
    value === 'subagent' ||
    value === 'search'
  ) {
    return value
  }
  return undefined
}

function parseMemoryRecipient(value: string | null): MemoryPackArchiveExportInput['recipient'] {
  return value === 'model' || value === 'subagent' || value === 'window' || value === 'ui' || value === 'search'
    ? value
    : undefined
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === null || value.trim() === '') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

function parseOptionalString(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const archive = await buildMemoryPackArchive({
      mode: parseMemoryMode(url.searchParams.get('mode')),
      query: parseOptionalString(url.searchParams.get('query')),
      projectKey: parseOptionalString(url.searchParams.get('projectKey')) ?? null,
      conversationId: parseOptionalString(url.searchParams.get('conversationId')) ?? null,
      limit: parseOptionalNumber(url.searchParams.get('limit')),
      maxTokens: parseOptionalNumber(url.searchParams.get('maxTokens')),
      recipient: parseMemoryRecipient(url.searchParams.get('recipient')),
      includeAttachments: parseOptionalBoolean(url.searchParams.get('includeAttachments')),
      start: parseOptionalString(url.searchParams.get('start')),
      end: parseOptionalString(url.searchParams.get('end')),
    })

    return new NextResponse(new Uint8Array(archive.buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(archive.fileName)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
