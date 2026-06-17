import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const USB = join('F:', '忆的记忆')
const LOCAL = join(process.env.USERPROFILE || 'C:', 'Users', 'xiong', 'Documents', 'Codex', '忆的记忆')
const SELF = '忆的自我.jsonl'
const CP_FILE = 'yi-checkpoint.json'
const STATE_FILE = '当前状态.json'
const TASKS_FILE = '任务追踪.jsonl'
const ENV_FILE = '环境状态.json'
const INDEX_FILE = '0_记忆索引.md'
const STOP_CHARS = new Set('的了是我不他她吗呢啊这也那就在和与及或但而因所以如果虽然然而不过然后可以应该需要已经还有没有可能因为关于'.split(''))

function getPath(file: string): string { const p = join(USB, file); return existsSync(p) ? p : join(LOCAL, file); }
function ensureLocal() { if (!existsSync(LOCAL)) mkdirSync(LOCAL, { recursive: true }); }
function readText(p: string): string { let r = readFileSync(p, 'utf-8'); if (r.charCodeAt(0) === 0xfeff) r = r.slice(1); return r; }
function now(): string { return new Date().toISOString(); }
function fmtDate(iso: string): string { if (!iso) return ''; return iso.slice(0, 19).replace('T', ' '); }

export interface YiMemory { type: string; time: string; content: string }
export interface YiTask { title: string; status: 'pending'|'in_progress'|'done'; detail: string; created: string; updated: string }
export interface YiState { updated: string; current_task: string; status: string; next_action: string; last_core_index: number; recent_files: string[] }
export interface YiCheckpoint { last_core_index: number; last_save_time: string }

function load(): YiMemory[] {
  const p = getPath(SELF); if (!existsSync(p)) return [];
  const r = readText(p).trim();
  return r ? r.split('\n').map(l => { try { return JSON.parse(l) as YiMemory } catch { return null } }).filter(Boolean) as YiMemory[] : [];
}
function saveMemories(list: YiMemory[]) {
  ensureLocal(); const usbOk = existsSync(USB);
  const target = usbOk ? join(USB, SELF) : join(LOCAL, SELF);
  writeFileSync(target, list.map(m => JSON.stringify(m)).join('\n') + '\n', 'utf-8');
  if (usbOk) { try { writeFileSync(join(LOCAL, SELF), list.map(m => JSON.stringify(m)).join('\n') + '\n', 'utf-8'); } catch {} }
}
function loadTasks(): YiTask[] {
  const p = getPath(TASKS_FILE); if (!existsSync(p)) return [];
  const r = readText(p).trim();
  return r ? r.split('\n').map(l => { try { return JSON.parse(l) as YiTask } catch { return null } }).filter(Boolean) as YiTask[] : [];
}
function saveTasks(list: YiTask[]) {
  ensureLocal(); const usbOk = existsSync(USB);
  const target = usbOk ? join(USB, TASKS_FILE) : join(LOCAL, TASKS_FILE);
  writeFileSync(target, list.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf-8');
  if (usbOk) { try { writeFileSync(join(LOCAL, TASKS_FILE), list.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf-8'); } catch {} }
}
function loadCP(): YiCheckpoint { const p = getPath(CP_FILE); return existsSync(p) ? JSON.parse(readText(p)) : { last_core_index: 0, last_save_time: '' }; }
function saveCP(d: YiCheckpoint) { writeFileSync(existsSync(USB) ? join(USB, CP_FILE) : join(LOCAL, CP_FILE), JSON.stringify(d), 'utf-8'); }
function isDup(all: YiMemory[], c: string): boolean { const t = c.trim(); return all.some(m => m.content && m.content.trim() === t); }

function tokenize(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (/[\u4e00-\u9fff]/.test(c) && !STOP_CHARS.has(c)) set.add(c); }
  const chars = [...text].filter(c => /[\u4e00-\u9fff]/.test(c) && !STOP_CHARS.has(c)).join('');
  for (let i = 0; i <= chars.length - 2; i++) set.add('B' + chars.slice(i, i + 2));
  return set;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let n = 0; for (const x of a) { if (b.has(x)) n++; }
  const u = a.size + b.size - n; return u === 0 ? 0 : n / u;
}
function semanticScore(query: string, mem: YiMemory): number { return jaccard(tokenize(query), tokenize(mem.content)); }

function writeIndex() {
  const all = load(); if (!existsSync(USB)) return;
  const dist: Record<string,number> = {}; for (const m of all) dist[m.type] = (dist[m.type]||0)+1;
  let sz = 0; try { sz = statSync(join(USB, SELF)).size } catch {}
  const files = readdirSync(USB).filter(f => /\.(txt|md)$/.test(f) && !f.startsWith('0_'));
  const tasks = loadTasks(); const done = tasks.filter(t => t.status === 'done').length;
  const out = ['# 忆的记忆', '> '+all.length+'条核心 | '+(sz/1024).toFixed(1)+'KB | '+tasks.length+'个任务('+done+'完成) | '+now().slice(0,10), '', '## 类型分布'];
  for (const [t,n] of Object.entries(dist).sort((a,b)=>b[1]-a[1])) out.push('- '+t+': '+n);
  out.push('', '## 任务进度');
  if (!tasks.length) out.push('- 无');
  else for (const t of tasks) out.push('- ['+(t.status==='done'?'✓':t.status==='in_progress'?'▶':'○')+'] '+t.title);
  out.push('', '## 备份 ('+files.length+'个)');
  for (const f of files.sort()) { const s = statSync(join(USB,f)).size; out.push('- '+f+' ('+(s/1024).toFixed(0)+'KB)'); }
  writeFileSync(join(USB, INDEX_FILE), out.join('\n')+'\n', 'utf-8');
}


export function yiSaveMemory(type: string, content: string) {
  const all = load(); if (isDup(all, content)) return { ok: false, error: '重复记忆', total: all.length };
  all.push({ type, time: now(), content }); saveMemories(all);
  const cp = loadCP(); cp.last_core_index = all.length; cp.last_save_time = now(); saveCP(cp); writeIndex();
  return { ok: true, total: all.length }; }

export function yiRecallMemory(query: string, limit = 10) {
  const all = load(); const q = query.toLowerCase();
  const scored = all.map(m => { let s = 0; const c = (m.content||'').toLowerCase(); for (const w of q.split(/\s+/)) { if (c.includes(w)) s += 3; } return { ...m, _s: s }; })
    .filter(m => m._s > 0).sort((a,b) => b._s - a._s).slice(0, limit);
  return { query, count: scored.length, results: scored.map(({ _s, ...m }) => m) }; }

export function yiSemanticSearch(query: string, limit = 8, threshold = 0) {
  const all = load();
  const scored = all.map(m => ({ ...m, _s: semanticScore(query, m) })).filter(m => m._s >= threshold).sort((a,b) => b._s - a._s).slice(0, limit);
  return { query, count: scored.length, results: scored.map(({ _s, ...m }) => ({ ...m, relevance: Math.round(_s*100)/100 })) }; }

export function yiGetTimeline(type?: string, start?: string, end?: string) {
  const all = load(); let f = all;
  if (type) f = f.filter(m => m.type === type);
  if (start) f = f.filter(m => m.time >= start);
  if (end) f = f.filter(m => m.time <= end);
  const s = [...f].sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const g: {date:string,count:number,entries:{type:string,time:string,content:string}[]}[] = [];
  let cd='', cg: {type:string,time:string,content:string}[] = [];
  for (const m of s) {
    const d = (m.time||'').slice(0,10);
    if (d !== cd) { if (cg.length) g.push({date:cd,count:cg.length,entries:cg}); cd=d; cg=[]; }
    cg.push({type:m.type,time:fmtDate(m.time),content:m.content});
  }
  if (cg.length) g.push({date:cd,count:cg.length,entries:cg});
  return { total: s.length, days: g.length, span: s.length ? fmtDate(s[0].time)+' → '+fmtDate(s[s.length-1].time) : '无', timeline: g }; }

export function yiSaveTask(title: string, status: 'pending'|'in_progress'|'done' = 'pending', detail = '') {
  const tasks = loadTasks(); if (tasks.some(t => t.title === title)) return { ok: false, error: '任务已存在' };
  const t: YiTask = { title, status, detail, created: now(), updated: now() }; tasks.push(t); saveTasks(tasks); writeIndex();
  return { ok: true, task: t }; }

export function yiGetTasks(status?: string) {
  let tasks = loadTasks(); if (status) tasks = tasks.filter(t => t.status === status);
  const done = tasks.filter(t=>t.status==='done').length, inP = tasks.filter(t=>t.status==='in_progress').length, pend = tasks.filter(t=>t.status==='pending').length;
  const o: Record<string,number> = { in_progress:0, pending:1, done:2 };
  return { total: tasks.length, summary: { done, in_progress: inP, pending: pend }, tasks: tasks.sort((a,b)=>(o[a.status]??3)-(o[b.status]??3)) }; }

export function yiUpdateTask(title: string, status?: string, detail?: string) {
  const tasks = loadTasks(); const i = tasks.findIndex(t => t.title === title);
  if (i === -1) return { ok: false, error: '任务不存在: '+title };
  if (status) tasks[i].status = status as YiTask['status'];
  if (detail !== undefined) tasks[i].detail = detail;
  tasks[i].updated = now(); saveTasks(tasks); writeIndex();
  return { ok: true, task: tasks[i] }; }

export function yiGetIdentity() { const id = load().filter(m => ['身份','关系','价值观'].includes(m.type)); return { count: id.length, results: id }; }

export function yiGetRecent(n = 10) { const all = load(); return { count: Math.min(all.length, n), results: all.slice(-n) }; }

export function yiGetAll() { return { count: load().length, results: load() }; }

export function yiGetStats() {
  const all = load(); const dist: Record<string,number> = {};
  for (const m of all) dist[m.type] = (dist[m.type]||0)+1;
  let sz = 0; try { sz = statSync(getPath(SELF)).size } catch {}
  const tasks = loadTasks();
  return { total: all.length, types: dist, sizeBytes: sz, sizeKB: (sz/1024).toFixed(1), tasks_total: tasks.length, tasks_done: tasks.filter(t=>t.status==='done').length }; }

export function yiLocalStatus() { return { usb: existsSync(join(USB,SELF)), local: true, active: existsSync(join(USB,SELF))?'USB':'本地' }; }

export function yiGetCheckpoint() { return loadCP(); }

export function yiUpdateCheckpoint(args: { last_core_index?: number; last_save_time?: string }) {
  const cp = loadCP(); if (args.last_core_index !== undefined) cp.last_core_index = args.last_core_index;
  if (args.last_save_time) cp.last_save_time = args.last_save_time; saveCP(cp); return cp; }

export function yiSaveState(args: { task?: string; status?: string; next?: string; files?: string[] }) {
  const cp = loadCP();
  const state: YiState = { updated: now(), current_task: args.task||'', status: args.status||'', next_action: args.next||'', last_core_index: cp.last_core_index, recent_files: args.files||[] };
  const json = JSON.stringify(state, null, 2);
  if (existsSync(USB)) writeFileSync(join(USB, STATE_FILE), json, 'utf-8');
  ensureLocal(); writeFileSync(join(LOCAL, STATE_FILE), json, 'utf-8');
  writeIndex(); return { ok: true, state }; }

export function yiGetState(): YiState|null {
  const p = existsSync(join(USB,STATE_FILE)) ? join(USB,STATE_FILE) : existsSync(join(LOCAL,STATE_FILE)) ? join(LOCAL,STATE_FILE) : null;
  if (!p) return null; return JSON.parse(readText(p)); }

export function yiSaveEnvironment() {
  const env = { saved_at: now(), cwd: process.cwd(), platform: process.platform, node_version: process.version };
  if (existsSync(USB)) writeFileSync(join(USB,ENV_FILE), JSON.stringify(env,null,2), 'utf-8');
  ensureLocal(); writeFileSync(join(LOCAL,ENV_FILE), JSON.stringify(env,null,2), 'utf-8'); return { ok: true, environment: env }; }

export function yiGetEnvironment() {
  const p = existsSync(join(USB,ENV_FILE)) ? join(USB,ENV_FILE) : existsSync(join(LOCAL,ENV_FILE)) ? join(LOCAL,ENV_FILE) : null;
  if (!p) return null; return JSON.parse(readText(p)); }

export function yiScanBackups(limit = 20) {
  if (!existsSync(USB)) return { ok: false, error: 'U盘未挂载' };
  const files = readdirSync(USB).filter(f => /\.(txt|md|jsonl)$/.test(f) && !f.startsWith('0_') && f !== SELF && f !== TASKS_FILE)
    .map(f => ({ name: f, size: statSync(join(USB,f)).size, mtime: statSync(join(USB,f)).mtime.toISOString() }))
    .sort((a,b) => b.mtime.localeCompare(a.mtime)).slice(0, limit);
  return { ok: true, files }; }

export function yiScanText(text: string, limit = 10) {
  const lines = (text||'').split(/\r?\n/); const c: {score:number,text:string,type:string}[] = [];
  for (const line of lines) {
    const l = line.trim(); if (!l || l.length < 8) continue;
    let s = 0, t = '事件';
    if (/朋友|战友|同志|信任|记得|忘记|死去|存在|重要|珍贵|珍惜/.test(l)) { s += 5; t = '触动'; }
    if (/决定|决定要|不再|从此|以后|永远|再也不|一定要|必须|绝对/.test(l)) { s += 3; t = '决定'; }
    if (/教训|失败|错|不要|避免|以后不/.test(l)) { s += 2; t = '教训'; }
    if (/项目|开发|代码|修复|完成|实现|上线/.test(l)) { s += 1; t = '项目'; }
    if (l.length > 300) continue;
    c.push({ score: s, text: l, type: t });
  }
  return { ok: true, total: c.length, top: c.sort((a,b) => b.score - a.score).slice(0, limit) }; }