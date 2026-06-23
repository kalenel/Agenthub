import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exportMemoryPackArchive, fetchMemoryPack, importMemoryPackArchive, recordMemory, searchMemories } from './memory-api'

describe('memory-api', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('posts get_pack with the current conversation context', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: 'get_pack',
          result: {
            mode: 'chat',
            conversationId: 'conv_1',
            projectKey: 'proj_1',
            recipient: 'ui',
            pack: {
              mode: 'chat',
              records: [],
              counts: { session: 0, project: 0, core: 0 },
              queryHits: 0,
              recipient: 'ui',
            },
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await fetchMemoryPack({
      mode: 'chat',
      conversationId: 'conv_1',
      query: 'status update',
      recipient: 'ui',
      limit: 12,
      maxTokens: 300,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/yi-memory')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: 'get_pack',
      mode: 'chat',
      conversationId: 'conv_1',
      query: 'status update',
      recipient: 'ui',
      limit: 12,
      maxTokens: 300,
    })
    expect(result.projectKey).toBe('proj_1')
  })

  it('posts structured memory writes', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: 'record_memory',
          result: {
            id: 'mem_1',
            scope: 'project',
            kind: 'fact',
            text: 'Remember this item.',
            payload: { origin: 'memory-drawer' },
            source: 'ui',
            sourceRef: null,
            importance: 3,
            confidence: 100,
            status: 'active',
            projectKey: 'proj_1',
            conversationId: 'conv_1',
            createdAt: 1,
            updatedAt: 1,
            lastAccessedAt: null,
            tags: ['memory-drawer'],
            supersedesId: null,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await recordMemory({
      conversationId: 'conv_1',
      scope: 'project',
      kind: 'fact',
      text: 'Remember this item.',
      source: 'ui',
      payload: { origin: 'memory-drawer' },
      tags: ['memory-drawer'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: 'record_memory',
      conversationId: 'conv_1',
      scope: 'project',
      kind: 'fact',
      text: 'Remember this item.',
      source: 'ui',
      payload: { origin: 'memory-drawer' },
      tags: ['memory-drawer'],
    })
    expect(result.id).toBe('mem_1')
    expect(result.projectKey).toBe('proj_1')
  })

  it('posts semantic search queries', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          action: 'semantic_search',
          result: {
            query: 'checkpoint',
            count: 1,
            results: [
              {
                type: 'project:progress',
                time: '2026-06-21T00:00:00.000Z',
                content: 'Checkpoint saved',
                relevance: 0.92,
              },
            ],
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await searchMemories('checkpoint', 5, 0.5, 'project')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      action: 'semantic_search',
      query: 'checkpoint',
      limit: 5,
      threshold: 0.5,
      scope: 'project',
    })
    expect(result.query).toBe('checkpoint')
    expect(result.results[0]?.relevance).toBe(0.92)
  })

  it('posts export requests with the archive endpoint and parses filename headers', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(['zip-bytes'], { type: 'application/zip' }), {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': "attachment; filename*=UTF-8''memory-pack-chat.zip",
        },
      }),
    )

    const result = await exportMemoryPackArchive({
      mode: 'chat',
      conversationId: 'conv_9',
      projectKey: 'proj_9',
      recipient: 'ui',
      limit: 9,
      maxTokens: 1234,
      includeAttachments: true,
      start: '2026-06-22T10:00',
      end: '2026-06-22T12:00',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/yi-memory/export?mode=chat&projectKey=proj_9&conversationId=conv_9&recipient=ui&limit=9&maxTokens=1234&includeAttachments=true&start=2026-06-22T10%3A00&end=2026-06-22T12%3A00')
    expect(init).toBeUndefined()
    expect(result.fileName).toBe('memory-pack-chat.zip')
    expect(await result.blob.text()).toBe('zip-bytes')
  })

  it('posts import archives through multipart form data', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          manifest: { format: 'agenthub-memory-pack', version: 1, counts: { core: 0, project: 0, session: 0, attachments: 0 } },
          targetConversationId: 'conv_target',
          targetProjectKey: 'proj_target',
          importedRecords: 1,
          reusedRecords: 0,
          remappedRecords: 0,
          importedAttachments: 0,
          reusedAttachments: 0,
          remappedAttachments: 0,
          warnings: [],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )

    const archive = new Blob(['zip-bytes'], { type: 'application/zip' })
    const result = await importMemoryPackArchive({ conversationId: 'conv_target', archive })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/yi-memory/import')
    expect(init).toMatchObject({ method: 'POST' })
    const body = (init as RequestInit).body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('conversationId')).toBe('conv_target')
    const archiveFile = body.get('archive') as File
    expect(archiveFile.name).toBe('memory-pack.zip')
    expect(result.targetProjectKey).toBe('proj_target')
    expect(result.importedRecords).toBe(1)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})

