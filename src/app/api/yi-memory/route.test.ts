import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  yiGetAll: vi.fn(),
  yiGetCheckpoint: vi.fn(),
  yiGetEnvironment: vi.fn(),
  yiGetIdentity: vi.fn(),
  yiGetMemoryPack: vi.fn(),
  yiGetProgressLedger: vi.fn(),
  yiGetRecent: vi.fn(),
  yiGetState: vi.fn(),
  yiGetStats: vi.fn(),
  yiGetTasks: vi.fn(),
  yiGetTimeline: vi.fn(),
  yiGetTransitionLedger: vi.fn(),
  yiLocalStatus: vi.fn(),
  yiRecallMemory: vi.fn(),
  yiRecordDispatch: vi.fn(),
  yiRecordMemory: vi.fn(),
  yiRecordProgressMemory: vi.fn(),
  yiRecordTransition: vi.fn(),
  yiRecordTransitionLedger: vi.fn(),
  yiSaveEnvironment: vi.fn(),
  yiSaveMemory: vi.fn(),
  yiSaveState: vi.fn(),
  yiSaveTask: vi.fn(),
  yiScanBackups: vi.fn(),
  yiScanText: vi.fn(),
  yiSemanticSearch: vi.fn(),
  yiUpdateCheckpoint: vi.fn(),
  yiUpdateTask: vi.fn(),
}))

vi.mock('@/server/yi-memory/service', () => serviceMocks)

import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new Request('http://localhost/api/yi-memory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/yi-memory', () => {
  it('routes get_pack to yiGetMemoryPack with normalized args', async () => {
    serviceMocks.yiGetMemoryPack.mockResolvedValue({
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
    })

    const res = await POST(
      makeRequest({
        action: 'get_pack',
        mode: 'chat',
        conversationId: 'conv_1',
        projectKey: 'proj_1',
        recipient: 'ui',
        limit: 12,
        maxTokens: 320,
        query: 'status update',
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiGetMemoryPack).toHaveBeenCalledTimes(1)
    expect(serviceMocks.yiGetMemoryPack).toHaveBeenCalledWith({
      mode: 'chat',
      query: 'status update',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      limit: 12,
      maxTokens: 320,
      recipient: 'ui',
    })

    const body = await res.json()
    expect(body).toEqual({
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
    })
  })

  it('routes get_progress to yiGetProgressLedger with normalized args', async () => {
    const progressResult = {
      count: 1,
      latestCheckpoint: null,
      blockers: [],
      records: [],
    }
    serviceMocks.yiGetProgressLedger.mockResolvedValue(progressResult)

    const res = await POST(
      makeRequest({
        action: 'get_progress',
        conversationId: 'conv_1',
        projectKey: 'proj_1',
        itemId: 'item_1',
        episodeId: 'episode_1',
        checkpointId: 'checkpoint_1',
        limit: 12,
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiGetProgressLedger).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      itemId: 'item_1',
      episodeId: 'episode_1',
      checkpointId: 'checkpoint_1',
      limit: 12,
    })
    expect(await res.json()).toEqual({
      ok: true,
      action: 'get_progress',
      result: progressResult,
    })
  })

  it('routes record_progress to yiRecordProgressMemory with normalized args', async () => {
    serviceMocks.yiRecordProgressMemory.mockResolvedValue({
      id: 'mem_progress',
      scope: 'project',
      kind: 'progress',
      text: 'blocked on api',
      payload: {},
      source: 'ui',
      sourceRef: null,
      importance: 4,
      confidence: 88,
      status: 'blocked',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      createdAt: 1,
      updatedAt: 1,
      lastAccessedAt: null,
      tags: [],
      supersedesId: null,
    })

    const res = await POST(
      makeRequest({
        action: 'record_progress',
        conversationId: 'conv_1',
        projectKey: 'proj_1',
        scope: 'project',
        itemId: 'item_1',
        episodeId: 'episode_1',
        checkpointId: 'checkpoint_1',
        previousCheckpointId: 'checkpoint_0',
        latestCheckpoint: 'checkpoint_1',
        status: 'blocked',
        blockedReason: 'waiting for api',
        nextAction: 'retry later',
        evidenceRef: 'ev_1',
        evidenceRefs: ['ev_1', 'ev_2'],
        text: 'blocked on api',
        source: 'ui',
        sourceRef: 'task:1',
        importance: 4,
        confidence: 88,
        recipient: 'ui',
        tags: ['progress'],
        payload: { kind: 'progress' },
        supersedeLatest: true,
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiRecordProgressMemory).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      scope: 'project',
      itemId: 'item_1',
      episodeId: 'episode_1',
      checkpointId: 'checkpoint_1',
      previousCheckpointId: 'checkpoint_0',
      latestCheckpoint: 'checkpoint_1',
      status: 'blocked',
      blockedReason: 'waiting for api',
      nextAction: 'retry later',
      evidenceRef: 'ev_1',
      evidenceRefs: ['ev_1', 'ev_2'],
      text: 'blocked on api',
      source: 'ui',
      sourceRef: 'task:1',
      importance: 4,
      confidence: 88,
      recipient: 'ui',
      tags: ['progress'],
      payload: { kind: 'progress' },
      supersedeLatest: true,
    })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('record_progress')
    expect(body.result.id).toBe('mem_progress')
  })

  it('routes get_transition_ledger to yiGetTransitionLedger with normalized args', async () => {
    const transitionResult = {
      count: 1,
      records: [],
    }
    serviceMocks.yiGetTransitionLedger.mockResolvedValue(transitionResult)

    const res = await POST(
      makeRequest({
        action: 'get_transition_ledger',
        conversationId: 'conv_2',
        projectKey: 'proj_2',
        transitionId: 'transition_1',
        fromState: 'draft',
        toState: 'published',
        limit: 8,
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiGetTransitionLedger).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      transitionId: 'transition_1',
      fromState: 'draft',
      toState: 'published',
      limit: 8,
    })
    expect(await res.json()).toEqual({
      ok: true,
      action: 'get_transition_ledger',
      result: transitionResult,
    })
  })

  it('routes record_transition_ledger to yiRecordTransitionLedger with normalized args', async () => {
    serviceMocks.yiRecordTransitionLedger.mockResolvedValue({
      id: 'mem_transition',
      scope: 'session',
      kind: 'transition',
      text: 'promoted to published',
      payload: {},
      source: 'ui',
      sourceRef: null,
      importance: 6,
      confidence: 90,
      status: 'active',
      projectKey: 'proj_2',
      conversationId: 'conv_2',
      createdAt: 1,
      updatedAt: 1,
      lastAccessedAt: null,
      tags: [],
      supersedesId: null,
    })

    const res = await POST(
      makeRequest({
        action: 'record_transition_ledger',
        conversationId: 'conv_2',
        projectKey: 'proj_2',
        scope: 'session',
        transitionId: 'transition_1',
        fromState: 'draft',
        toState: 'published',
        reason: 'promoted',
        trigger: 'manual',
        scopeImpact: 'project',
        recoveryTarget: 'publish flow',
        evidenceRef: 'ev_9',
        evidenceRefs: ['ev_9'],
        text: 'promoted to published',
        source: 'ui',
        sourceRef: 'task:2',
        importance: 6,
        confidence: 90,
        recipient: 'window',
        tags: ['transition'],
        payload: { from: 'draft' },
        supersedeLatest: true,
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiRecordTransitionLedger).toHaveBeenCalledWith({
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      scope: 'session',
      transitionId: 'transition_1',
      fromState: 'draft',
      toState: 'published',
      reason: 'promoted',
      trigger: 'manual',
      scopeImpact: 'project',
      recoveryTarget: 'publish flow',
      evidenceRef: 'ev_9',
      evidenceRefs: ['ev_9'],
      text: 'promoted to published',
      source: 'ui',
      sourceRef: 'task:2',
      importance: 6,
      confidence: 90,
      recipient: 'window',
      tags: ['transition'],
      payload: { from: 'draft' },
      supersedeLatest: true,
    })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('record_transition_ledger')
    expect(body.result.id).toBe('mem_transition')
  })

  it('routes recall_memory to yiRecallMemory with optional scope', async () => {
    serviceMocks.yiRecallMemory.mockResolvedValue({ query: 'needle', count: 1, results: [] })

    const res = await POST(
      makeRequest({
        action: 'recall_memory',
        query: 'needle',
        limit: 4,
        scope: 'project',
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiRecallMemory).toHaveBeenCalledWith('needle', 4, 'project')
  })

  it('routes semantic_search to yiSemanticSearch with optional scope', async () => {
    serviceMocks.yiSemanticSearch.mockResolvedValue({ query: 'needle', count: 1, results: [] })

    const res = await POST(
      makeRequest({
        action: 'semantic_search',
        query: 'needle',
        limit: 6,
        threshold: 0.5,
        scope: 'session',
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiSemanticSearch).toHaveBeenCalledWith('needle', 6, 0.5, 'session')
  })

  it('routes record_memory to yiRecordMemory with raw body input', async () => {
    serviceMocks.yiRecordMemory.mockResolvedValue({
      id: 'mem_1',
      scope: 'project',
      kind: 'fact',
      text: 'remember this',
      payload: {},
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
      tags: [],
      supersedesId: null,
    })

    const res = await POST(
      makeRequest({
        action: 'record_memory',
        conversationId: 'conv_1',
        projectKey: 'proj_1',
        kind: 'fact',
        text: 'remember this',
        source: 'ui',
      }),
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.yiRecordMemory).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      kind: 'fact',
      text: 'remember this',
      source: 'ui',
    })

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.action).toBe('record_memory')
    expect(body.result.id).toBe('mem_1')
  })
})
