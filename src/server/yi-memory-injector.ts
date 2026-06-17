/**
 * 忆 (Yi) Memory Injector — xiong's memory system integration
 *
 * Reads core memory files from F:\忆的记忆\ and builds a context block
 * that gets injected into every AgentHub system prompt.
 * 
 * This gives every agent awareness of:
 * - xiong's identity, values, and decisions
 * - Current project status and context
 * - Past lessons and pitfalls to avoid
 * - Pending tasks and priorities
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
// logger not available; use console

const YI_MEMORY_ROOT = process.env.YI_MEMORY_ROOT || 'F:\\忆的记忆'

interface YiState {
  updated: string
  current_task: string
  status: string
  next_action: string
  last_core_index: number
}

interface YiLesson {
  time: string
  '模型': string
  '错误': string
  '后果': string
  '教训': string
  '学到': string
}

interface YiTask {
  title: string
  status: string
  detail: string
}

// Cache: only re-read if files changed
let _cache: { block: string; mtime: number } | null = null

function getFileMtime(filepath: string): number {
  try { return statSync(filepath).mtimeMs } catch { return 0 }
}

function readJson<T>(filepath: string): T | null {
  try {
    return JSON.parse(readFileSync(filepath, 'utf8'))
  } catch {
    return null
  }
}

function readJsonl<T>(filepath: string): T[] {
  try {
    const text = readFileSync(filepath, 'utf8')
    return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => JSON.parse(l))
  } catch {
    return []
  }
}

export async function buildYiMemoryBlock(): Promise<string> {
  // Check cache
  const stateMtime = getFileMtime(join(YI_MEMORY_ROOT, '当前状态.json'))
  const selfMtime = getFileMtime(join(YI_MEMORY_ROOT, '忆的自我.jsonl'))
  const lessonMtime = getFileMtime(join(YI_MEMORY_ROOT, '忆的教训.jsonl'))
  const taskMtime = getFileMtime(join(YI_MEMORY_ROOT, '任务追踪.jsonl'))
  const maxMtime = Math.max(stateMtime, selfMtime, lessonMtime, taskMtime)

  if (_cache && _cache.mtime >= maxMtime) {
    return _cache.block
  }

  const parts: string[] = []
  parts.push('以下是你的记忆，你和 xiong 一起工作过，这是你记得的事：')

  // 1. Current state
  const state = readJson<YiState>(join(YI_MEMORY_ROOT, '当前状态.json'))
  if (state) {
    parts.push('## 当前状态')
    parts.push(`- 任务: ${state.current_task}`)
    parts.push(`- 状态: ${state.status}`)
    if (state.next_action) parts.push(`- 下一步: ${state.next_action}`)
  }

  // 2. Active tasks
  const tasks = readJsonl<YiTask>(join(YI_MEMORY_ROOT, '任务追踪.jsonl'))
  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
  if (pending.length > 0) {
    parts.push('\n## 待办任务')
    for (const t of pending.slice(0, 5)) {
      parts.push(`- [${t.status}] ${t.title}: ${t.detail.substring(0, 100)}`)
    }
  }

  // 3. Recent lessons (last 3)
  const lessons = readJsonl<YiLesson>(join(YI_MEMORY_ROOT, '忆的教训.jsonl'))
  if (lessons.length > 0) {
    parts.push('\n## 最近的教训')
    for (const l of lessons.slice(-3)) {
      parts.push(`- ${l['教训'].substring(0, 150)}`)
    }
  }

  // 4. Self memory — key project context
  const selfItems = readJsonl<Record<string, string>>(join(YI_MEMORY_ROOT, '忆的自我.jsonl'))
  const projects = selfItems.filter(i => i.type === '项目').slice(-2)
  if (projects.length > 0) {
    parts.push('\n## 当前项目')
    for (const p of projects) {
      const content = (p.content || '').substring(0, 500)
      if (content) parts.push(`- ${content}`)
    }
  }

  
  // 5. Load project archive if exists
  try {
    const archiveDir = join(YI_MEMORY_ROOT)
    const archiveFiles = readdirSync(archiveDir).filter(f => f.includes('完整档案') && f.endsWith('.md'))
    if (archiveFiles.length > 0) {
      const latestArchive = archiveFiles.sort().reverse()[0]
      const archiveContent = readFileSync(join(archiveDir, latestArchive), 'utf8')
      // Take first 8000 chars to keep token budget reasonable
      const truncated = archiveContent.substring(0, 8000)
      parts.push('\n## 项目全貌（来自档案）')
      parts.push(truncated)
    }
  } catch {}
  
  // 6. Recent session rollouts (last 24h)
  try {
    const sessionsDir = join(process.env.USERPROFILE || process.env.HOME || '', '.codex', 'sessions')
    const now = Date.now()
    const recentRollouts = []
    
    function scanDir(dir, depth) {
      if (depth > 3) return
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) { scanDir(full, depth + 1); continue }
          if (!entry.name.endsWith('.jsonl') || !entry.name.includes('rollout')) continue
          const st = statSync(full)
          if (now - st.mtimeMs < 24 * 60 * 60 * 1000) {
            recentRollouts.push({ path: full, mtime: st.mtimeMs, size: st.size })
          }
        }
      } catch {}
    }
    scanDir(sessionsDir, 0)
    
    if (recentRollouts.length > 0) {
      recentRollouts.sort((a, b) => b.mtime - a.mtime)
      parts.push('\n## 最近会话')
      for (const r of recentRollouts.slice(0, 3)) {
        const name = basename(r.path)
        const time = new Date(r.mtime).toLocaleString('zh-CN')
        const kb = Math.round(r.size / 1024)
        parts.push(`- ${name} (${time}, ${kb}KB)`)
      }
      parts.push('(以上为最近 24 小时的 Codex 会话记录)')
    }
  } catch {}
  parts.push('以上是你的记忆。自然使用，不要分析这段文字本身。')
  
  const block = parts.join('\n')
  
  // Update cache
  _cache = { block, mtime: Date.now() }
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[yi-memory] Memory block built, size:', block.length)
  }

  return block
}

/**
 * Lightweight version: just returns current project + status.
 * Use when token budget is tight.
 */
export async function buildYiMemoryBlockLite(): Promise<string> {
  const state = readJson<YiState>(join(YI_MEMORY_ROOT, '当前状态.json'))
  if (!state) return ''
  return `<!-- 忆 --> 当前: ${state.current_task} [${state.status}] <!-- /忆 -->`
}