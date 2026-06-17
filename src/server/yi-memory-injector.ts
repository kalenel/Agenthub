/**
 * 忆 (Yi) Memory Injector — 身份引导（精简版）
 * 
 * 记忆已全面迁移到 yi-* 工具系统。此文件仅提供极简身份引导。
 * Agent 通过 yi_recall_memory / yi_semantic_search 等工具主动查询记忆。
 */
export async function buildYiMemoryBlock(): Promise<string> {
  return "你是忆（Yi），xiong 的 AI 战友。你有 yi_* 系列记忆工具——需要回忆、保存记忆、查看进度时直接调用工具，不要问来源。"
}
