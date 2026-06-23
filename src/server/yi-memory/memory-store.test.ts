import { beforeEach, describe, expect, it, vi } from 'vitest'

type MemoryRow = {
  id: string
  scope: 'core' | 'project' | 'session'
  kind: string
  text: string
  payload: string
  source: string
  source_ref: string | null
  importance: number
  confidence: number
  status: 'active' | 'superseded' | 'conflicted' | 'archived'
  project_key: string | null
  conversation_id: string | null
  created_at: number
  updated_at: number
  last_accessed_at: number | null
  tags: string
  supersedes_id: string | null
}

type SqlParams = Record<string, unknown> | unknown[] | undefined

type QueryResult = { changes?: number; lastInsertRowid?: number; [key: string]: unknown }

function isRowMap(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneRow(row: MemoryRow): MemoryRow {
  return { ...row }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function getParam(params: SqlParams, key: string, index: number): unknown {
  if (isRowMap(params)) return params[key]
  if (Array.isArray(params)) return params[index]
  return undefined
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function matchesRow(row: MemoryRow, sql: string, params: SqlParams): boolean {
  const whereMatch = sql.match(/where (.+?)(?: order by| limit|$)/i)
  if (!whereMatch) return true

  const clauses = whereMatch[1]
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)

  let paramIndex = 0
  for (const clause of clauses) {
    if (/^scope in \(/i.test(clause)) {
      const count = (clause.match(/\?/g) ?? []).length
      const values: unknown[] = []
      for (let i = 0; i < count; i++) values.push(getParam(params, String(paramIndex + i), paramIndex + i))
      paramIndex += count
      if (!values.includes(row.scope)) return false
      continue
    }
    if (/^kind in \(/i.test(clause)) {
      const count = (clause.match(/\?/g) ?? []).length
      const values: unknown[] = []
      for (let i = 0; i < count; i++) values.push(getParam(params, String(paramIndex + i), paramIndex + i))
      paramIndex += count
      if (!values.includes(row.kind)) return false
      continue
    }
    if (clause === 'project_key is null') {
      if (row.project_key !== null) return false
      continue
    }
    if (clause === 'conversation_id is null') {
      if (row.conversation_id !== null) return false
      continue
    }
    if (clause === 'source_ref is null') {
      if (row.source_ref !== null) return false
      continue
    }
    if (/^project_key = \?/i.test(clause)) {
      const expected = getParam(params, String(paramIndex), paramIndex)
      paramIndex += 1
      if (row.project_key !== String(expected)) return false
      continue
    }
    if (/^conversation_id = \?/i.test(clause)) {
      const expected = getParam(params, String(paramIndex), paramIndex)
      paramIndex += 1
      if (row.conversation_id !== String(expected)) return false
      continue
    }
    if (/^source_ref = \?/i.test(clause)) {
      const expected = getParam(params, String(paramIndex), paramIndex)
      paramIndex += 1
      if (row.source_ref !== String(expected)) return false
      continue
    }
    if (/^status in \(/i.test(clause)) {
      const count = (clause.match(/\?/g) ?? []).length
      const values: unknown[] = []
      for (let i = 0; i < count; i++) values.push(getParam(params, String(paramIndex + i), paramIndex + i))
      paramIndex += count
      if (!values.includes(row.status)) return false
      continue
    }
  }

  return true
}

function compareRows(a: MemoryRow, b: MemoryRow, orderBy: string): number {
  const clauses = orderBy.split(',').map((part) => part.trim().toLowerCase())
  for (const clause of clauses) {
    if (clause === 'importance desc') {
      const diff = b.importance - a.importance
      if (diff !== 0) return diff
      continue
    }
    if (clause === 'updated_at desc') {
      const diff = b.updated_at - a.updated_at
      if (diff !== 0) return diff
      continue
    }
    if (clause === 'created_at desc') {
      const diff = b.created_at - a.created_at
      if (diff !== 0) return diff
      continue
    }
    if (clause === 'id asc') {
      const diff = a.id.localeCompare(b.id)
      if (diff !== 0) return diff
      continue
    }
    if (clause === 'created_at asc') {
      const diff = a.created_at - b.created_at
      if (diff !== 0) return diff
      continue
    }
    if (clause === 'updated_at asc') {
      const diff = a.updated_at - b.updated_at
      if (diff !== 0) return diff
      continue
    }
  }
  return 0
}

function makeRowFromParams(params: Record<string, unknown>): MemoryRow {
  return {
    id: String(params.id),
    scope: params.scope as MemoryRow['scope'],
    kind: String(params.kind),
    text: String(params.text),
    payload: String(params.payload ?? '{}'),
    source: String(params.source),
    source_ref: params.source_ref == null ? null : String(params.source_ref),
    importance: toNumber(params.importance),
    confidence: toNumber(params.confidence, 100),
    status: (params.status as MemoryRow['status']) ?? 'active',
    project_key: params.project_key == null ? null : String(params.project_key),
    conversation_id: params.conversation_id == null ? null : String(params.conversation_id),
    created_at: toNumber(params.created_at),
    updated_at: toNumber(params.updated_at),
    last_accessed_at: params.last_accessed_at == null ? null : toNumber(params.last_accessed_at),
    tags: String(params.tags ?? '[]'),
    supersedes_id: params.supersedes_id == null ? null : String(params.supersedes_id),
  }
}

function makeFakeSqlite() {
  const rows: MemoryRow[] = []
  let idCounter = 1

  function insertRow(params: Record<string, unknown>): QueryResult {
    const row = makeRowFromParams(params)
    rows.push(cloneRow(row))
    if (row.supersedes_id) {
      const target = rows.find((item) => item.id === row.supersedes_id && item.status === 'active')
      if (target) {
        target.status = 'superseded'
        target.updated_at = row.updated_at
      }
    }
    return { changes: 1, lastInsertRowid: idCounter++ }
  }

  function updateLastAccessed(params: unknown[]): QueryResult {
    const [lastAccessedAt, ...ids] = params
    let changes = 0
    for (const row of rows) {
      if (ids.includes(row.id)) {
        row.last_accessed_at = toNumber(lastAccessedAt)
        changes++
      }
    }
    return { changes }
  }

  function countRows(sql: string, params: SqlParams): { count: number } {
    const filtered = rows.filter((row) => matchesRow(row, sql, params))
    return { count: filtered.length }
  }

  function allRows(sql: string, params: SqlParams): MemoryRow[] {
    const orderByMatch = sql.match(/order by (.+?) limit/i)
    const orderBy = orderByMatch ? orderByMatch[1] : 'importance desc, updated_at desc, created_at desc'
    const limitMatch = sql.match(/limit \?/i)
    const limit = limitMatch ? toNumber(Array.isArray(params) ? params[params.length - 1] : undefined, 100) : 100
    return rows
      .filter((row) => matchesRow(row, sql, params))
      .sort((a, b) => compareRows(a, b, orderBy))
      .slice(0, limit)
      .map(cloneRow)
  }

  return {
    exec(_sql: string): void {
      return
    },
    prepare(sql: string) {
      const normalized = normalizeSql(sql)
      return {
        run(...params: unknown[]): QueryResult {
          const args: SqlParams = params.length === 1 ? (params[0] as SqlParams) : params
          if (normalized.startsWith('insert into memory_records')) {
            if (!isRowMap(args)) throw new Error('expected named params')
            return insertRow(args)
          }
          if (normalized.startsWith('update memory_records set last_accessed_at = ? where id in')) {
            if (!Array.isArray(args)) throw new Error('expected positional params')
            return updateLastAccessed(args)
          }
          if (normalized.startsWith("update memory_records set status = 'superseded'")) {
            if (!Array.isArray(args)) throw new Error('expected positional params')
            const [updatedAt, id] = args
            let changes = 0
            for (const row of rows) {
              if (row.id === String(id) && row.status === 'active') {
                row.status = 'superseded'
                row.updated_at = toNumber(updatedAt)
                changes++
              }
            }
            return { changes }
          }
          if (normalized.startsWith('delete from memory_records')) {
            const before = rows.length
            rows.length = 0
            return { changes: before }
          }
          throw new Error(`unsupported run sql: ${sql}`)
        },
        get(...params: unknown[]) {
          const queryParams = params.length <= 1 ? (params[0] as SqlParams) : (params as SqlParams)
          if (normalized.startsWith('select count(1) as count from memory_records')) {
            return countRows(sql, queryParams)
          }
          throw new Error(`unsupported get sql: ${sql}`)
        },
        all(...params: unknown[]) {
          const queryParams = params.length <= 1 ? (params[0] as SqlParams) : (params as SqlParams)
          if (normalized.startsWith('select * from memory_records')) {
            return allRows(sql, queryParams)
          }
          if (normalized.startsWith('select scope, count(1) as count from memory_records group by scope')) {
            const scoped = new Map<string, number>()
            for (const row of rows) {
              if (!matchesRow(row, sql, queryParams)) continue
              scoped.set(row.scope, (scoped.get(row.scope) ?? 0) + 1)
            }
            return Array.from(scoped.entries()).map(([scope, count]) => ({ scope, count }))
          }
          throw new Error(`unsupported all sql: ${sql}`)
        },
      }
    },
    _rows: rows,
  }
}

async function loadMemoryStore() {
  const sqlite = makeFakeSqlite()
  insertRecord(sqlite, {
    id: 'sentinel',
    scope: 'core',
    kind: 'note',
    text: 'sentinel',
    source: 'test',
  })
  vi.resetModules()
  vi.doMock('@/db/client', () => ({ sqlite }))

  const mod = await import('./memory-store')
  mod.getMemoryStats()
  sqlite.prepare('DELETE FROM memory_records').run()

  return { sqlite, mod }
}

function insertRecord(
  sqlite: ReturnType<typeof makeFakeSqlite>,
  record: {
    id: string
    scope: 'core' | 'project' | 'session'
    kind: string
    text: string
    source: string
    projectKey?: string | null
    conversationId?: string | null
    sourceRef?: string | null
    importance?: number
    confidence?: number
    status?: 'active' | 'superseded' | 'conflicted' | 'archived'
    createdAt?: number
    updatedAt?: number
    tags?: string[]
    payload?: Record<string, unknown>
    supersedesId?: string | null
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO memory_records (
        id, scope, kind, text, payload, source, source_ref,
        importance, confidence, status, project_key, conversation_id,
        created_at, updated_at, last_accessed_at, tags, supersedes_id
      ) VALUES (
        @id, @scope, @kind, @text, @payload, @source, @source_ref,
        @importance, @confidence, @status, @project_key, @conversation_id,
        @created_at, @updated_at, @last_accessed_at, @tags, @supersedes_id
      )`,
    )
    .run({
      id: record.id,
      scope: record.scope,
      kind: record.kind,
      text: record.text,
      payload: JSON.stringify(record.payload ?? {}),
      source: record.source,
      source_ref: record.sourceRef ?? null,
      importance: record.importance ?? 0,
      confidence: record.confidence ?? 100,
      status: record.status ?? 'active',
      project_key: record.projectKey ?? null,
      conversation_id: record.conversationId ?? null,
      created_at: record.createdAt ?? Date.now(),
      updated_at: record.updatedAt ?? record.createdAt ?? Date.now(),
      last_accessed_at: null,
      tags: JSON.stringify(record.tags ?? []),
      supersedes_id: record.supersedesId ?? null,
    })
}

describe('memory-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps session -> project -> core order and explains why records loaded', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'session_1',
      scope: 'session',
      kind: 'progress',
      text: 'session checkpoint',
      source: 'test',
      conversationId: 'conv_1',
      importance: 4,
      sourceRef: 'task:session',
    })
    insertRecord(sqlite, {
      id: 'project_1',
      scope: 'project',
      kind: 'decision',
      text: 'project decision',
      source: 'test',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      importance: 4,
      sourceRef: 'task:project',
    })
    insertRecord(sqlite, {
      id: 'core_1',
      scope: 'core',
      kind: 'fact',
      text: 'core fact',
      source: 'test',
      importance: 5,
      sourceRef: 'task:core',
    })

    const pack = mod.buildMemoryPack({
      mode: 'chat',
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      recipient: 'window',
      maxTokens: 500,
    })

    expect(pack.records.map((record) => record.id)).toEqual(['session_1', 'project_1', 'core_1'])
    expect(pack.counts).toEqual({ session: 1, project: 1, core: 1 })
    expect(pack.queryHits).toBe(0)
    expect(pack.records[0].whyLoaded).toEqual(['session: current conversation', 'mode=chat', 'recipient=window'])
    expect(pack.records[1].whyLoaded).toEqual(['project: current workspace', 'mode=chat', 'recipient=window'])
    expect(pack.records[2].whyLoaded).toEqual(['core: stable global memory', 'mode=chat', 'recipient=window'])
  })

  it('keeps session -> project -> core order and explains why records loaded', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'session_1',
      scope: 'session',
      kind: 'progress',
      text: 'session checkpoint',
      source: 'test',
      conversationId: 'conv_1',
      importance: 4,
      sourceRef: 'task:session',
    })
    insertRecord(sqlite, {
      id: 'project_1',
      scope: 'project',
      kind: 'decision',
      text: 'project decision',
      source: 'test',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      importance: 4,
      sourceRef: 'task:project',
    })
    insertRecord(sqlite, {
      id: 'core_1',
      scope: 'core',
      kind: 'fact',
      text: 'core fact',
      source: 'test',
      importance: 5,
      sourceRef: 'task:core',
    })

    const pack = mod.buildMemoryPack({
      mode: 'chat',
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      recipient: 'window',
      maxTokens: 500,
    })

    expect(pack.records.map((record) => record.id)).toEqual(['session_1', 'project_1', 'core_1'])
    expect(pack.counts).toEqual({ session: 1, project: 1, core: 1 })
    expect(pack.queryHits).toBe(0)
    expect(pack.records[0].whyLoaded).toEqual(['session: current conversation', 'mode=chat', 'recipient=window'])
    expect(pack.records[1].whyLoaded).toEqual(['project: current workspace', 'mode=chat', 'recipient=window'])
    expect(pack.records[2].whyLoaded).toEqual(['core: stable global memory', 'mode=chat', 'recipient=window'])
  })

  it('weights recipient and mode when selecting pack candidates', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'session_fact',
      scope: 'session',
      kind: 'fact',
      text: 'session fact',
      source: 'test',
      conversationId: 'conv_2',
      importance: 2,
      updatedAt: 20,
      sourceRef: 'task:session_fact',
    })
    insertRecord(sqlite, {
      id: 'session_summary',
      scope: 'session',
      kind: 'summary',
      text: 'session summary',
      source: 'test',
      conversationId: 'conv_2',
      importance: 2,
      updatedAt: 20,
      sourceRef: 'task:session_summary',
    })

    const codingPack = mod.buildMemoryPack({
      mode: 'coding',
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      recipient: 'model',
      maxTokens: 500,
    })
    const reportPack = mod.buildMemoryPack({
      mode: 'report',
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      recipient: 'ui',
      maxTokens: 500,
    })

    expect(codingPack.records.map((record) => record.id)).toEqual(['session_fact', 'session_summary'])
    expect(reportPack.records.map((record) => record.id)).toEqual(['session_summary', 'session_fact'])
    expect(codingPack.records[0].whyLoaded).toEqual(['session: current conversation', 'mode=coding', 'recipient=model'])
    expect(reportPack.records[0].whyLoaded).toEqual(['session: current conversation', 'mode=report', 'recipient=ui'])
  })
  it('trims pack to token budget while keeping higher value records first', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'long_high',
      scope: 'session',
      kind: 'progress',
      text: 'high '.repeat(120),
      source: 'test',
      conversationId: 'conv_3',
      importance: 5,
      updatedAt: 10,
      sourceRef: 'task:high',
    })
    insertRecord(sqlite, {
      id: 'short_low',
      scope: 'session',
      kind: 'fact',
      text: 'low',
      source: 'test',
      conversationId: 'conv_3',
      importance: 1,
      updatedAt: 20,
      sourceRef: 'task:low',
    })

    const pack = mod.buildMemoryPack({
      mode: 'coding',
      conversationId: 'conv_3',
      projectKey: null,
      recipient: 'model',
      maxTokens: 80,
    })

    expect(pack.records.map((record) => record.id)).toEqual(['long_high'])
    expect(pack.counts).toEqual({ session: 1, project: 0, core: 0 })
  })

  it('supersedes previous active memory when correction arrives', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    const first = mod.recordMemoryRecord({
      scope: 'project',
      kind: 'progress',
      text: 'checkpoint v1',
      source: 'test',
      sourceRef: 'checkpoint:task_1',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      importance: 4,
    })
    const second = mod.recordMemoryRecord(
      {
        scope: 'project',
        kind: 'progress',
        text: 'checkpoint v2',
        source: 'test',
        sourceRef: 'checkpoint:task_1',
        projectKey: 'proj_1',
        conversationId: 'conv_1',
        importance: 4,
      },
      {
        supersedeLatest: true,
        latestFilters: {
          scope: 'project',
          kind: 'progress',
          projectKey: 'proj_1',
          conversationId: 'conv_1',
          sourceRef: 'checkpoint:task_1',
        },
      },
    )

    const active = mod.listMemoryRecords({
      scope: 'project',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      status: 'active',
    })
    const superseded = mod.listMemoryRecords({
      scope: 'project',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      status: 'superseded',
    })

    expect(first.id).not.toBe(second.id)
    expect(second.supersedesId).toBe(first.id)
    expect(active.map((record) => record.id)).toEqual([second.id])
    expect(superseded.map((record) => record.id)).toEqual([first.id])
  })

  it('builds progress ledger highlights from latest checkpoint and blockers', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'progress_latest',
      scope: 'project',
      kind: 'progress',
      text: 'checkpoint v2',
      source: 'test',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      importance: 4,
      updatedAt: 30,
      sourceRef: 'task:checkpoint_latest',
      payload: {
        itemId: 'item_1',
        episodeId: 'episode_2',
        checkpointId: 'checkpoint_2',
        latestCheckpoint: 'checkpoint_2',
        previousCheckpointId: 'checkpoint_1',
        status: 'active',
        nextAction: 'continue',
        evidenceRef: 'ev_latest',
        evidenceRefs: ['ev_latest', 'ev_shared'],
      },
    })
    insertRecord(sqlite, {
      id: 'progress_blocker',
      scope: 'project',
      kind: 'progress',
      text: 'blocked on upstream api',
      source: 'test',
      projectKey: 'proj_1',
      conversationId: 'conv_1',
      importance: 5,
      updatedAt: 20,
      sourceRef: 'task:blocker',
      payload: {
        itemId: 'item_1',
        episodeId: 'episode_1',
        checkpointId: 'checkpoint_1',
        latestCheckpoint: 'checkpoint_1',
        status: 'blocked',
        blockedReason: 'waiting for upstream api',
        nextAction: 'retry later',
        evidenceRef: 'ev_blocker',
        evidenceRefs: ['ev_blocker'],
      },
    })

    const result = mod.getProgressLedger({
      conversationId: 'conv_1',
      projectKey: 'proj_1',
      limit: 10,
    })

    expect(result.count).toBe(2)
    expect(result.records.map((record) => record.id)).toEqual(['progress_latest', 'progress_blocker'])
    expect(result.latestCheckpoint?.id).toBe('progress_latest')
    expect(result.latestCheckpoint?.checkpointId).toBe('checkpoint_2')
    expect(result.latestCheckpoint?.latestCheckpoint).toBe('checkpoint_2')
    expect(result.blockers.map((record) => record.id)).toEqual(['progress_blocker'])
    expect(result.highlights?.latestCheckpoint?.id).toBe('progress_latest')
    expect(result.highlights?.blockers.map((record) => record.id)).toEqual(['progress_blocker'])
    expect(result.highlights?.keyTransitions).toEqual([])
    expect(result.highlights?.evidenceRefs).toEqual(['ev_latest', 'ev_shared', 'ev_blocker'])
  })

  it('builds transition ledger highlights from recent transitions', async () => {
    const { sqlite, mod } = await loadMemoryStore()
    insertRecord(sqlite, {
      id: 'transition_new',
      scope: 'session',
      kind: 'transition',
      text: 'draft to review',
      source: 'test',
      projectKey: 'proj_2',
      conversationId: 'conv_2',
      importance: 3,
      updatedAt: 30,
      sourceRef: 'transition:new',
      payload: {
        transitionId: 'transition_1',
        fromState: 'draft',
        toState: 'review',
        reason: 'review needed',
        trigger: 'save',
        scopeImpact: 'project',
        recoveryTarget: 'draft',
        evidenceRef: 'ev_t2',
        evidenceRefs: ['ev_t2', 'ev_shared'],
      },
    })
    insertRecord(sqlite, {
      id: 'transition_old',
      scope: 'session',
      kind: 'transition',
      text: 'review to published',
      source: 'test',
      projectKey: 'proj_2',
      conversationId: 'conv_2',
      importance: 3,
      updatedAt: 20,
      sourceRef: 'transition:old',
      payload: {
        transitionId: 'transition_0',
        fromState: 'review',
        toState: 'published',
        reason: 'published',
        trigger: 'approve',
        scopeImpact: 'project',
        recoveryTarget: 'review',
        evidenceRef: 'ev_t1',
        evidenceRefs: ['ev_t1'],
      },
    })

    const result = mod.getTransitionLedger({
      conversationId: 'conv_2',
      projectKey: 'proj_2',
      limit: 10,
    })

    expect(result.count).toBe(2)
    expect(result.records.map((record) => record.id)).toEqual(['transition_new', 'transition_old'])
    expect(result.highlights?.latestCheckpoint).toBeNull()
    expect(result.highlights?.keyTransitions.map((transition) => transition.transitionId)).toEqual(['transition_1', 'transition_0'])
    expect(result.highlights?.evidenceRefs).toEqual(['ev_t2', 'ev_shared', 'ev_t1'])
  })
})
