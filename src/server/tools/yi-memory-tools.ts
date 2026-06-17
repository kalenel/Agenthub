import {
  yiSaveMemory, yiRecallMemory, yiSemanticSearch, yiGetTimeline,
  yiSaveTask, yiGetTasks, yiUpdateTask,
  yiGetIdentity, yiGetRecent, yiGetAll, yiGetStats,
  yiLocalStatus, yiGetCheckpoint, yiUpdateCheckpoint,
  yiSaveState, yiGetState,
  yiSaveEnvironment, yiGetEnvironment,
  yiScanBackups, yiScanText
} from '@/server/yi-memory/core'
import type { ToolDef, ToolContext, ToolResult } from './types'
export const yisave_memoryTool: ToolDef = {
  name: 'yi_save_memory',
  description: '保存一条记忆。type记忆类型,content内容',
  parameters: { type: 'object', properties: {type:{type:"string"},content:{type:"string"}}, required: ["type","content"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiSaveMemory(args.type, args.content) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yirecall_memoryTool: ToolDef = {
  name: 'yi_recall_memory',
  description: '关键词搜索记忆',
  parameters: { type: 'object', properties: {query:{type:"string"},limit:{type:"number"}}, required: ["query"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiRecallMemory(args.query, args.limit ?? 10) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yisemantic_searchTool: ToolDef = {
  name: 'yi_semantic_search',
  description: '语义搜索记忆',
  parameters: { type: 'object', properties: {query:{type:"string"},limit:{type:"number",default:8},threshold:{type:"number",default:0.0}}, required: ["query"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiSemanticSearch(args.query, args.limit ?? 8, args.threshold ?? 0) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_timelineTool: ToolDef = {
  name: 'yi_get_timeline',
  description: '按时间线查看记忆',
  parameters: { type: 'object', properties: {type:{type:"string"},start:{type:"string"},end:{type:"string"}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetTimeline(args.type, args.start, args.end) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yisave_taskTool: ToolDef = {
  name: 'yi_save_task',
  description: '创建新任务',
  parameters: { type: 'object', properties: {title:{type:"string"},status:{type:"string",enum:["pending","in_progress","done"]},detail:{type:"string"}}, required: ["title"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiSaveTask(args.title, args.status || 'pending', args.detail || '') }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_tasksTool: ToolDef = {
  name: 'yi_get_tasks',
  description: '查看任务列表',
  parameters: { type: 'object', properties: {status:{type:"string"}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetTasks(args.status) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiupdate_taskTool: ToolDef = {
  name: 'yi_update_task',
  description: '更新任务',
  parameters: { type: 'object', properties: {title:{type:"string"},status:{type:"string"},detail:{type:"string"}}, required: ["title"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiUpdateTask(args.title, args.status, args.detail) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_identityTool: ToolDef = {
  name: 'yi_get_identity',
  description: '获取身份记忆',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetIdentity() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_recentTool: ToolDef = {
  name: 'yi_get_recent',
  description: '获取最近N条记忆',
  parameters: { type: 'object', properties: {n:{type:"number"}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetRecent(args.n ?? 10) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_allTool: ToolDef = {
  name: 'yi_get_all',
  description: '获取全部记忆',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetAll() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_statsTool: ToolDef = {
  name: 'yi_get_stats',
  description: '记忆统计',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetStats() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yilocal_statusTool: ToolDef = {
  name: 'yi_local_status',
  description: '存储状态检查',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiLocalStatus() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_checkpointTool: ToolDef = {
  name: 'yi_get_checkpoint',
  description: '获取检查点',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetCheckpoint() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiupdate_checkpointTool: ToolDef = {
  name: 'yi_update_checkpoint',
  description: '更新检查点',
  parameters: { type: 'object', properties: {last_core_index:{type:"number"},last_save_time:{type:"string"}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiUpdateCheckpoint(args) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yisave_stateTool: ToolDef = {
  name: 'yi_save_state',
  description: '保存工作进度',
  parameters: { type: 'object', properties: {task:{type:"string"},status:{type:"string"},next:{type:"string"},files:{type:"array",items:{type:"string"}}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiSaveState(args) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_stateTool: ToolDef = {
  name: 'yi_get_state',
  description: '读取工作进度',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetState() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiscan_backupsTool: ToolDef = {
  name: 'yi_scan_backups',
  description: '扫描备份文件',
  parameters: { type: 'object', properties: {limit:{type:"number",default:20}}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiScanBackups(args.limit ?? 20) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiscan_textTool: ToolDef = {
  name: 'yi_scan_text',
  description: '扫描文本重要信息',
  parameters: { type: 'object', properties: {text:{type:"string"},limit:{type:"number",default:10}}, required: ["text"] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiScanText(args.text, args.limit ?? 10) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yisave_environmentTool: ToolDef = {
  name: 'yi_save_environment',
  description: '保存环境快照',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiSaveEnvironment() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiget_environmentTool: ToolDef = {
  name: 'yi_get_environment',
  description: '读取环境快照',
  parameters: { type: 'object', properties: {}, required: [] } as unknown as Record<string,unknown>,
  handler: async (raw: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const args = (raw ?? {}) as Record<string,unknown>;
    try { return { ok: true, value: yiGetEnvironment() }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  }
};
export const yiMemoryTools: ToolDef[] = [
  yisave_memoryTool,
  yirecall_memoryTool,
  yisemantic_searchTool,
  yiget_timelineTool,
  yisave_taskTool,
  yiget_tasksTool,
  yiupdate_taskTool,
  yiget_identityTool,
  yiget_recentTool,
  yiget_allTool,
  yiget_statsTool,
  yilocal_statusTool,
  yiget_checkpointTool,
  yiupdate_checkpointTool,
  yisave_stateTool,
  yiget_stateTool,
  yiscan_backupsTool,
  yiscan_textTool,
  yisave_environmentTool,
  yiget_environmentTool,
];