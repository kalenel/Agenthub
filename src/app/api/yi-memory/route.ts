import { NextRequest, NextResponse } from 'next/server'
import {
  yiSaveMemory, yiRecallMemory, yiSemanticSearch, yiGetTimeline,
  yiSaveTask, yiGetTasks, yiUpdateTask,
  yiGetIdentity, yiGetRecent, yiGetAll, yiGetStats,
  yiLocalStatus, yiGetCheckpoint, yiUpdateCheckpoint,
  yiSaveState, yiGetState,
  yiSaveEnvironment, yiGetEnvironment,
  yiScanBackups, yiScanText
} from '@/server/yi-memory/core'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, ...args } = body
    const handlers: Record<string, (a: any) => any> = {
      save_memory: (a) => yiSaveMemory(a.type, a.content),
      recall_memory: (a) => yiRecallMemory(a.query, a.limit),
      semantic_search: (a) => yiSemanticSearch(a.query, a.limit, a.threshold),
      get_timeline: (a) => yiGetTimeline(a.type, a.start, a.end),
      save_task: (a) => yiSaveTask(a.title, a.status, a.detail),
      get_tasks: (a) => yiGetTasks(a.status),
      update_task: (a) => yiUpdateTask(a.title, a.status, a.detail),
      get_identity: () => yiGetIdentity(),
      get_recent: (a) => yiGetRecent(a.n),
      get_all: () => yiGetAll(),
      get_stats: () => yiGetStats(),
      local_status: () => yiLocalStatus(),
      get_checkpoint: () => yiGetCheckpoint(),
      update_checkpoint: (a) => yiUpdateCheckpoint(a),
      save_state: (a) => yiSaveState(a),
      get_state: () => yiGetState(),
      save_environment: () => yiSaveEnvironment(),
      get_environment: () => yiGetEnvironment(),
      scan_backups: (a) => yiScanBackups(a.limit),
      scan_text: (a) => yiScanText(a.text, a.limit),
    }
    const handler = handlers[action]
    if (!handler) return NextResponse.json({ ok: false, error: "Unknown action: " + action }, { status: 400 })
    return NextResponse.json({ ok: true, action, result: handler(args) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    name: "Yi Memory API",
    version: "1.6.0",
    usage: 'POST /api/yi-memory { action: "recall_memory", query: "护馨" }'
  })
}
