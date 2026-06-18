/**
 * Hooks System ? pre/post execution hooks for tools and agent lifecycle.
 * 
 * Hook types:
 *  - preTool: runs before a tool executes, can block or modify args
 *  - postTool: runs after a tool executes, can modify result
 *  - onStart: runs when agent starts a turn
 *  - onEnd: runs when agent finishes a turn
 *
 * Hooks are loaded from:
 *  1. Project-level: .codex/hooks/ (in workspace)
 *  2. User-level: ~/.codex/hooks/
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'

export interface HookContext {
  agentId: string
  conversationId: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: { ok: boolean; value?: string; error?: string }
  workspacePath: string
}

export interface PreToolResult {
  allowed: boolean
  reason?: string
  modifiedArgs?: unknown
}

export interface PostToolResult {
  modifiedResult?: { ok: boolean; value?: string; error?: string }
  appendNote?: string
}

type HookFn = (ctx: HookContext) => PreToolResult | PostToolResult | void | Promise<PreToolResult | PostToolResult | void>;

interface HookDef {
  name: string
  source: string
  preTool?: HookFn;
  postTool?: HookFn;
  onStart?: HookFn;
  onEnd?: HookFn;
}

let _hooks: HookDef[] | null = null;

function loadHookFiles(): string[] {
  const files: string[] = [];
  const dirs = [
    join(homedir(), '.codex', 'hooks'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.mjs') || entry.endsWith('.js')) {
          files.push(join(dir, entry));
        }
      }
    } catch { /* skip */ }
  }

  return files;
}

export async function loadHooks(): Promise<HookDef[]> {
  if (_hooks) return _hooks;

  const hooks: HookDef[] = [];
  const _require = createRequire(import.meta.url);
  const files = loadHookFiles();

  for (const file of files) {
    try {
      let mod;
      try { mod = _require(file); } catch { continue; }
      const def: HookDef = {
        name: basename(file, extname(file)),
        source: file,
        preTool: mod.preTool,
        postTool: mod.postTool,
        onStart: mod.onStart,
        onEnd: mod.onEnd,
      };
      hooks.push(def);
      console.log('[Hooks] Loaded:', def.name, 'from', file);
    } catch (err) {
      console.warn('[Hooks] Failed to load', file, ':', err instanceof Error ? err.message : String(err));
    }
  }

  _hooks = hooks;
  return hooks;
}

/** Run pre-tool hooks. Returns first blocking result, or allow. */
export async function runPreToolHooks(ctx: HookContext): Promise<PreToolResult> {
  const hooks = await loadHooks();
  for (const hook of hooks) {
    if (!hook.preTool) continue;
    try {
      const result = await hook.preTool(ctx);
      if (result && result.allowed === false) {
        return result;
      }
      if (result && result.modifiedArgs) {
        ctx.toolArgs = result.modifiedArgs;
      }
    } catch (err) {
      console.warn('[Hooks] preTool error in', hook.name, ':', err);
    }
  }
  return { allowed: true };
}

/** Run post-tool hooks. Merges all results. */
export async function runPostToolHooks(ctx: HookContext): Promise<PostToolResult> {
  const hooks = await loadHooks();
  const merged: PostToolResult = {};
  for (const hook of hooks) {
    if (!hook.postTool) continue;
    try {
      const result = await hook.postTool(ctx);
      if (result) {
        if (result.modifiedResult) merged.modifiedResult = result.modifiedResult;
        if (result.appendNote) {
          merged.appendNote = (merged.appendNote || '') + '\n' + result.appendNote;
        }
      }
    } catch (err) {
      console.warn('[Hooks] postTool error in', hook.name, ':', err);
    }
  }
  return merged;
}

/** Run on-start hooks */
export async function runStartHooks(ctx: HookContext): Promise<string> {
  const hooks = await loadHooks();
  const notes: string[] = [];
  for (const hook of hooks) {
    if (!hook.onStart) continue;
    try {
      const result = await hook.onStart(ctx);
      if (result && typeof result === 'object' && 'appendNote' in result) {
        notes.push((result as PostToolResult).appendNote!);
      }
    } catch (err) {
      console.warn('[Hooks] onStart error in', hook.name, ':', err);
    }
  }
  return notes.join('\n');
}

/** Run on-end hooks */
export async function runEndHooks(ctx: HookContext): Promise<void> {
  const hooks = await loadHooks();
  for (const hook of hooks) {
    if (!hook.onEnd) continue;
    try {
      await hook.onEnd(ctx);
    } catch (err) {
      console.warn('[Hooks] onEnd error in', hook.name, ':', err);
    }
  }
}

export function clearHookCache(): void {
  _hooks = null;
}