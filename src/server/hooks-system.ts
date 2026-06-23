/**
 * Hooks System — pre/post execution hooks for tools and agent lifecycle.
 */

import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'

import type { ToolResult } from '@/server/tools/types'

export interface HookContext {
  agentId: string
  conversationId: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: ToolResult
  workspacePath: string
}

export interface PreToolResult {
  allowed: boolean
  reason?: string
  modifiedArgs?: unknown
}

export interface PostToolResult {
  modifiedResult?: ToolResult
  appendNote?: string
}

type PreToolHookFn = (ctx: HookContext) => PreToolResult | void | Promise<PreToolResult | void>
type PostToolHookFn = (ctx: HookContext) => PostToolResult | void | Promise<PostToolResult | void>
type LifecycleHookFn = (ctx: HookContext) => void | Promise<void>

interface HookDef {
  name: string
  source: string
  preTool?: PreToolHookFn
  postTool?: PostToolHookFn
  onStart?: PostToolHookFn
  onEnd?: LifecycleHookFn
}

let _hooks: HookDef[] | null = null

function loadHookFiles(): string[] {
  const files: string[] = []
  const dirs = [join(homedir(), '.codex', 'hooks')]

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith('.mjs') || entry.endsWith('.js')) {
          files.push(join(dir, entry))
        }
      }
    } catch {
      // skip
    }
  }

  return files
}

export async function loadHooks(): Promise<HookDef[]> {
  if (_hooks) return _hooks

  const hooks: HookDef[] = []
  const _require = createRequire(import.meta.url)

  for (const file of loadHookFiles()) {
    try {
      let mod: any
      try {
        mod = _require(file)
      } catch {
        continue
      }
      hooks.push({
        name: basename(file, extname(file)),
        source: file,
        preTool: mod.preTool,
        postTool: mod.postTool,
        onStart: mod.onStart,
        onEnd: mod.onEnd,
      })
    } catch (err) {
      console.warn('[Hooks] Failed to load', file, ':', err instanceof Error ? err.message : String(err))
    }
  }

  _hooks = hooks
  return hooks
}

export async function runPreToolHooks(ctx: HookContext): Promise<PreToolResult> {
  for (const hook of await loadHooks()) {
    if (!hook.preTool) continue
    try {
      const result = await hook.preTool(ctx)
      if (!result) continue
      if (result.allowed === false) return result
      if (result.modifiedArgs !== undefined) ctx.toolArgs = result.modifiedArgs
    } catch (err) {
      console.warn('[Hooks] preTool error in', hook.name, ':', err)
    }
  }
  return { allowed: true }
}

export async function runPostToolHooks(ctx: HookContext): Promise<PostToolResult> {
  const merged: PostToolResult = {}
  for (const hook of await loadHooks()) {
    if (!hook.postTool) continue
    try {
      const result = await hook.postTool(ctx)
      if (!result) continue
      if (result.modifiedResult !== undefined) merged.modifiedResult = result.modifiedResult
      if (result.appendNote) {
        merged.appendNote = merged.appendNote ? merged.appendNote + '\n' + result.appendNote : result.appendNote
      }
    } catch (err) {
      console.warn('[Hooks] postTool error in', hook.name, ':', err)
    }
  }
  return merged
}

export async function runStartHooks(ctx: HookContext): Promise<string> {
  const notes: string[] = []
  for (const hook of await loadHooks()) {
    if (!hook.onStart) continue
    try {
      const result = await hook.onStart(ctx)
      if (result?.appendNote) notes.push(result.appendNote)
    } catch (err) {
      console.warn('[Hooks] onStart error in', hook.name, ':', err)
    }
  }
  return notes.join('\n')
}

export async function runEndHooks(ctx: HookContext): Promise<void> {
  for (const hook of await loadHooks()) {
    if (!hook.onEnd) continue
    try {
      await hook.onEnd(ctx)
    } catch (err) {
      console.warn('[Hooks] onEnd error in', hook.name, ':', err)
    }
  }
}

export function clearHookCache(): void {
  _hooks = null
}
