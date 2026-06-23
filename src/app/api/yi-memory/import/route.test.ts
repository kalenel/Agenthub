import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const archiveMocks = vi.hoisted(() => ({
  restoreMemoryPackArchive: vi.fn(),
}))

vi.mock('@/server/yi-memory/archive', () => archiveMocks)

import { POST } from './route'

describe('POST /api/yi-memory/import', () => {
  it('restores an uploaded memory pack archive', async () => {
    const manifest = {
      format: 'agenthub-memory-pack',
      version: 1,
      exportedAt: '2026-06-22T00:00:00.000Z',
      source: {
        mode: 'chat',
        recipient: 'ui',
        conversationId: 'conv_export',
        projectKey: 'proj_export',
        queryHits: 1,
      },
      counts: {
        core: 1,
        project: 1,
        session: 1,
        attachments: 0,
      },
      files: {
        manifest: 'manifest.json',
        core: 'core-memory.jsonl',
        project: 'project-memory.jsonl',
        session: 'session-memory.jsonl',
        attachmentsDir: 'attachments',
      },
      attachments: [] as never[],
      warnings: [] as string[],
    }

    archiveMocks.restoreMemoryPackArchive.mockResolvedValue({
      manifest,
      targetConversationId: 'conv_target',
      targetProjectKey: 'proj_target',
      importedRecords: 3,
      reusedRecords: 1,
      remappedRecords: 1,
      importedAttachments: 0,
      reusedAttachments: 0,
      remappedAttachments: 0,
      warnings: [],
    })

    const form = new FormData()
    form.append('conversationId', 'conv_target')
    form.append('archive', new Blob(['zip-bytes'], { type: 'application/zip' }), 'memory-pack.zip')

    const req = new NextRequest(new Request('http://localhost/api/yi-memory/import', { method: 'POST', body: form }))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(archiveMocks.restoreMemoryPackArchive).toHaveBeenCalledTimes(1)
    const [archive, conversationId] = archiveMocks.restoreMemoryPackArchive.mock.calls[0]
    expect(conversationId).toBe('conv_target')
    expect(archive).toBeInstanceOf(ArrayBuffer)
    expect(await res.json()).toEqual({
      manifest,
      targetConversationId: 'conv_target',
      targetProjectKey: 'proj_target',
      importedRecords: 3,
      reusedRecords: 1,
      remappedRecords: 1,
      importedAttachments: 0,
      reusedAttachments: 0,
      remappedAttachments: 0,
      warnings: [],
    })
  })
})
