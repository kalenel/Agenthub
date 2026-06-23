import { Buffer } from 'node:buffer'

import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const archiveMocks = vi.hoisted(() => ({
  buildMemoryPackArchive: vi.fn(),
}))

vi.mock('@/server/yi-memory/archive', () => archiveMocks)

import { GET } from './route'

describe('GET /api/yi-memory/export', () => {
  it('builds a zip archive with normalized query params', async () => {
    archiveMocks.buildMemoryPackArchive.mockResolvedValue({
      buffer: Buffer.from('zip-bytes'),
      fileName: 'memory-pack-report.zip',
      manifest: {},
    })

    const req = new NextRequest(
      'http://localhost/api/yi-memory/export?mode=report&query=status%20update&projectKey=proj_1&conversationId=conv_1&recipient=ui&limit=12&maxTokens=360&includeAttachments=yes&start=2026-06-22T10%3A00&end=2026-06-22T12%3A00',
    )
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(archiveMocks.buildMemoryPackArchive).toHaveBeenCalledWith({
      mode: 'report',
      query: 'status update',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      limit: 12,
      maxTokens: 360,
      recipient: 'ui',
      includeAttachments: true,
      start: '2026-06-22T10:00',
      end: '2026-06-22T12:00',
    })
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''memory-pack-report.zip")
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('zip-bytes')
  })
})

