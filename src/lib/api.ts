import type {
  AgentRow,
  AppSettingsRow,
  ArtifactRow,
  AttachmentRow,
  ConversationWithMeta,
  ContextSummaryRow,
  MessageRow,
} from '@/db/schema'
import type { SubAgentHandle } from '@/shared/types'
import type { AgentConfigDraft, AgentDraftRequest } from '@/shared/agent-builder-config'
import type {
  AskUserAnswer,
  DeployCandidateRecord,
  DeployStatusRecord,
  PendingBashCommand,
  PendingDispatchPlan,
  PendingQuestion,
  PendingWrite,
} from '@/shared/types'

export interface ArtifactListItem {
  id: string
  conversationId: string
  conversationTitle: string | null
  type: string
  title: string
  version: number
  parentArtifactId: string | null
  createdByAgentId: string
  createdAt: number
}

async function json<T>(req: Promise<Response>): Promise<T> {
  const res = await req
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// 锟斤拷锟斤拷锟斤拷 Agents 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchAgents(): Promise<AgentRow[]> {
  const { agents } = await json<{ agents: AgentRow[] }>(fetch('/api/agents'))
  return agents
}

export interface CreateAgentBody {
  name: string
  avatar: string
  description: string
  capabilities: string[]
  systemPrompt: string
  /** 默锟斤拷 'custom'锟斤拷SDK adapter 使锟矫革拷锟斤拷锟斤拷锟矫癸拷锟竭硷拷 */
  adapterName?: 'custom' | 'claude-code' | 'codex'
  /** custom: required锟斤拷SDK adapter: 锟斤拷锟斤拷 */
  modelProvider?: 'anthropic' | 'openai' | 'deepseek' | 'volcano-ark' | 'openai-compatible'
  /** custom: required锟斤拷SDK adapter: 锟斤拷选锟斤拷默锟斤拷 SDK 默锟斤拷模锟斤拷 */
  modelId?: string
  toolNames: string[]
  supportsVision?: boolean
  apiKey?: string
  /** 锟皆讹拷锟斤拷 API base URL锟斤拷Claude/Codex 锟斤拷 endpoint 协锟斤拷锟斤拷锟斤拷锟揭拷锟酵拷锟斤拷锟斤拷锟侥拷锟?*/
  apiBaseUrl?: string
  skillNames?: string[]
}

export async function createAgent(body: CreateAgentBody): Promise<AgentRow> {
  const { agent } = await json<{ agent: AgentRow }>(
    fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return agent
}

export async function createAgentDraft(body: AgentDraftRequest): Promise<AgentConfigDraft> {
  const { draft } = await json<{ draft: AgentConfigDraft }>(
    fetch('/api/agents/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return draft
}

export type UpdateAgentBody = Partial<
  Omit<CreateAgentBody, 'avatar' | 'apiKey' | 'apiBaseUrl' | 'modelId'>
> & {
  // SDK adapter 锟斤拷锟斤拷 null 锟斤拷眨锟斤拷锟绞撅拷锟?SDK 默锟斤拷模锟酵ｏ拷custom 锟皆憋拷锟斤拷锟叫非匡拷 modelId
  modelId?: string | null
  // 锟斤拷式 null 锟斤拷示锟斤拷锟斤拷远锟斤拷锟?key锟斤拷undefined 锟斤拷示锟斤拷锟斤拷
  apiKey?: string | null
  // 同锟斤拷
  apiBaseUrl?: string | null
  skillNames?: string[]
}


export interface SkillDef {
  name: string
  description: string
  source: string
  body: string
}

export async function fetchSkills(): Promise<SkillDef[]> {
  try {
    const skillsUrl =
      typeof window !== 'undefined'
        ? new URL('/api/skills', window.location.origin).toString()
        : '/api/skills'
    const data = await json<{ skills: SkillDef[] }>(fetch(skillsUrl))
    return data.skills ?? []
  } catch (error) {
    console.error('[api] fetchSkills failed', error)
    return []
  }
}
export async function updateAgent(agentId: string, patch: UpdateAgentBody): Promise<AgentRow> {
  const { agent } = await json<{ agent: AgentRow }>(
    fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return agent
}

export async function deleteAgent(agentId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/agents/${agentId}`, { method: 'DELETE' }))
}

// 锟斤拷锟斤拷锟斤拷 Conversations 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchConversations(): Promise<ConversationWithMeta[]> {
  const { conversations } = await json<{ conversations: ConversationWithMeta[] }>(
    fetch('/api/conversations'),
  )
  return conversations
}

export interface CreateConversationBody {
  title?: string
  mode: 'single' | 'group'
  agentIds: string[]
  boundPath?: string
}

export async function createConversation(body: CreateConversationBody): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return conversation
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' }),
  )
}

export async function addAgentsToConversation(
  conversationId: string,
  addAgentIds: string[],
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addAgentIds }),
    }),
  )
  return conversation
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  )
  return conversation
}


export interface ConversationTransitionLogInput {
  fromConversationId?: string | null
  source: string
  reason: string
  trigger?: string | null
  recipient?: 'model' | 'subagent' | 'window' | 'ui' | 'search'
}

export async function recordConversationTransitionApi(
  conversationId: string,
  input: ConversationTransitionLogInput,
): Promise<void> {
  await json<{ ok: true }>(
    fetch('/api/yi-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_transition',
        conversationId,
        ...input,
      }),
    }),
  )
}
export async function togglePinConversation(conversationId: string): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ togglePin: true }),
    }),
  )
  return conversation
}

export async function toggleArchiveConversation(
  conversationId: string,
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggleArchive: true }),
    }),
  )
  return conversation
}

export async function setFsWriteApprovalMode(
  conversationId: string,
  mode: 'auto' | 'review',
): Promise<ConversationWithMeta> {
  const { conversation } = await json<{ conversation: ConversationWithMeta }>(
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fsWriteApprovalMode: mode }),
    }),
  )
  return conversation
}

// 锟斤拷锟斤拷锟斤拷 Pending writes (fs_write review mode) 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchPendingWrites(conversationId: string): Promise<PendingWrite[]> {
  const { pendingWrites } = await json<{ pendingWrites: PendingWrite[] }>(
    fetch(`/api/conversations/${conversationId}/pending-writes`),
  )
  return pendingWrites
}

export async function approvePendingWrite(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-writes/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function rejectPendingWrite(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-writes/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Pending bash commands 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchPendingBashCommands(
  conversationId: string,
): Promise<PendingBashCommand[]> {
  const { pendingCommands } = await json<{ pendingCommands: PendingBashCommand[] }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands`),
  )
  return pendingCommands
}

export async function approvePendingBashCommand(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function rejectPendingBashCommand(
  conversationId: string,
  pendingId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-bash-commands/${pendingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Pending questions (ask_user) 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchPendingQuestions(conversationId: string): Promise<PendingQuestion[]> {
  const { pendingQuestions } = await json<{ pendingQuestions: PendingQuestion[] }>(
    fetch(`/api/conversations/${conversationId}/pending-questions`),
  )
  return pendingQuestions
}

export async function submitQuestionAnswers(
  conversationId: string,
  questionId: string,
  answers: Record<string, AskUserAnswer>,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-questions/${questionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Messages 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
// 锟斤拷锟斤拷锟斤拷 Pending dispatch plans (Orchestrator plan review) 锟斤拷锟斤拷锟斤拷
export async function fetchPendingDispatchPlans(
  conversationId: string,
): Promise<PendingDispatchPlan[]> {
  const { pendingDispatchPlans } = await json<{ pendingDispatchPlans: PendingDispatchPlan[] }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans`),
  )
  return pendingDispatchPlans
}

export async function approvePendingDispatchPlan(
  conversationId: string,
  planId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    }),
  )
}

export async function reviseDispatchPlan(
  conversationId: string,
  planId: string,
  feedback: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revise', feedback }),
    }),
  )
}

export async function rejectPendingDispatchPlan(
  conversationId: string,
  planId: string,
): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/conversations/${conversationId}/pending-dispatch-plans/${planId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    }),
  )
}

export async function fetchMessages(conversationId: string): Promise<MessageRow[]> {
  const { messages } = await json<{ messages: MessageRow[] }>(
    fetch(`/api/conversations/${conversationId}/messages`),
  )
  return messages
}

// 锟斤拷锟斤拷锟斤拷 Search 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface SearchApiResult {
  hits: Array<{
    messageId: string
    conversationId: string
    conversationTitle: string
    role: 'user' | 'agent' | 'system'
    agentId: string | null
    agentName: string | null
    agentAvatar: string | null
    createdAt: number
    snippetHtml: string
  }>
  total: number
  tookMs: number
}

export async function searchMessagesApi(
  query: string,
  opts: { fallback?: 'like'; conversationId?: string; role?: 'user' | 'agent' } = {},
): Promise<SearchApiResult> {
  const params = new URLSearchParams({ q: query })
  if (opts.fallback) params.set('fallback', opts.fallback)
  if (opts.conversationId) params.set('conversationId', opts.conversationId)
  if (opts.role) params.set('role', opts.role)
  const { data } = await json<{ ok: true; data: SearchApiResult }>(
    fetch(`/api/search?${params}`),
  )
  return data
}

export interface ClearConversationHistoryResult {
  conversation: ConversationWithMeta
  deletedMessageCount: number
  deletedRunCount: number
  deletedSummaryCount: number
}

export async function clearConversationHistory(
  conversationId: string,
): Promise<ClearConversationHistoryResult> {
  return json<ClearConversationHistoryResult>(
    fetch(`/api/conversations/${conversationId}/messages`, { method: 'DELETE' }),
  )
}

export interface FetchModelsResult {
  models: string[]
  provider: string
  baseUrl: string
}

export async function fetchModels(params: {
  provider: string
  baseUrl?: string
  apiKey: string
}): Promise<string[]> {
  const searchParams = new URLSearchParams({ provider: params.provider, apiKey: params.apiKey })
  if (params.baseUrl) searchParams.set('baseUrl', params.baseUrl)
  const res = await fetch(`/api/models?${searchParams}`)
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.models ?? []
}

export interface SendMessageBody {
  content: string
  mentionedAgentIds?: string[]
  parentMessageId?: string
  attachmentIds?: string[]
  modelId?: string
}

export interface SendMessageResult {
  messageId: string
  runIds: string[]
  messages?: MessageRow[]
  deploy?: DeployConversationResult
}

export async function sendMessage(
  conversationId: string,
  body: SendMessageBody,
): Promise<SendMessageResult> {
  return json<SendMessageResult>(
    fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export type DeployConversationResult =
  | {
      kind: 'no_candidates'
      candidates: []
      message: MessageRow
    }
  | {
      kind: 'candidate_selection'
      candidates: DeployCandidateRecord[]
      message: MessageRow
    }
  | {
      kind: 'deployed'
      deployment: DeployStatusRecord
      message: MessageRow
    }

export async function fetchDeployCandidates(
  conversationId: string,
): Promise<DeployCandidateRecord[]> {
  const { candidates } = await json<{ candidates: DeployCandidateRecord[] }>(
    fetch(`/api/conversations/${conversationId}/deploy`),
  )
  return candidates
}

export async function deployConversationArtifact(
  conversationId: string,
  artifactId?: string,
): Promise<DeployConversationResult> {
  return json<DeployConversationResult>(
    fetch(`/api/conversations/${conversationId}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artifactId ? { artifactId } : {}),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Runs 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface CompactConversationResult {
  summary: ContextSummaryRow
  message: MessageRow
}

export async function compactConversation(
  conversationId: string,
): Promise<CompactConversationResult> {
  return json<CompactConversationResult>(
    fetch(`/api/conversations/${conversationId}/compact`, { method: 'POST' }),
  )
}

export async function abortRun(runId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/runs/${runId}/abort`, { method: 'POST' }))
}

// 锟斤拷锟斤拷锟斤拷 Messages: withdraw / edit 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface WithdrawResult {
  deletedMessageIds: string[]
  deletedArtifactIds: string[]
}

export async function withdrawMessage(
  messageId: string,
  conversationId: string,
): Promise<WithdrawResult> {
  return json<WithdrawResult>(
    fetch(`/api/messages/${messageId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export interface EditAndResendResult extends WithdrawResult {
  newMessage: MessageRow
  runIds: string[]
}

export interface RegenerateResult extends WithdrawResult {
  triggerMessageId: string
  runIds: string[]
}

export async function regenerateLastResponse(conversationId: string): Promise<RegenerateResult> {
  return json<RegenerateResult>(
    fetch(`/api/conversations/${conversationId}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export async function editAndResendMessage(
  messageId: string,
  conversationId: string,
  content: string,
): Promise<EditAndResendResult> {
  return json<EditAndResendResult>(
    fetch(`/api/messages/${messageId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, content }),
    }),
  )
}

export interface ToggleBookmarkResult {
  bookmarkedMessageIds: string[]
  bookmarked: boolean
}

export async function toggleMessageBookmark(
  messageId: string,
  conversationId: string,
): Promise<ToggleBookmarkResult> {
  return json<ToggleBookmarkResult>(
    fetch(`/api/messages/${messageId}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

export interface TogglePinResult {
  pinnedMessageIds: string[]
  pinned: boolean
}

export async function toggleMessagePin(
  messageId: string,
  conversationId: string,
): Promise<TogglePinResult> {
  return json<TogglePinResult>(
    fetch(`/api/messages/${messageId}/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Filesystem (DirPicker) 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface ListDirResult {
  path: string
  parent: string | null
  entries: Array<{ name: string; isDirectory: boolean; path?: string }>
}

export type ServerPlatform = 'posix' | 'windows'

export async function getServerPlatform(): Promise<ServerPlatform> {
  const res = await json<{ platform: ServerPlatform }>(fetch('/api/platform'))
  return res.platform
}

export async function listDirectory(targetPath?: string): Promise<ListDirResult> {
  const qs = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ''
  return json<ListDirResult>(fetch(`/api/fs/listdir${qs}`))
}

// 锟斤拷锟斤拷锟斤拷 Filesystem (conversation-scoped, 锟侥硷拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷) 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface WorkspaceListResult {
  relPath: string
  absolutePath: string
  parent: string | null
  entries: Array<{ name: string; isDirectory: boolean; size?: number }>
}

export async function workspaceListDir(
  conversationId: string,
  relPath = '',
): Promise<WorkspaceListResult> {
  const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : ''
  return json<WorkspaceListResult>(fetch(`/api/conversations/${conversationId}/fs/listdir${qs}`))
}

export interface WorkspaceReadResult {
  path: string
  absolutePath: string
  cwd: string
  size: number
  content: string
  truncated: boolean
}

export async function workspaceReadFile(
  conversationId: string,
  relPath: string,
): Promise<WorkspaceReadResult> {
  return json<WorkspaceReadResult>(
    fetch(`/api/conversations/${conversationId}/fs/read?path=${encodeURIComponent(relPath)}`),
  )
}

export interface WorkspaceWriteResult {
  path: string
  absolutePath: string
  cwd: string
  bytes: number
}

export async function workspaceWriteFile(
  conversationId: string,
  relPath: string,
  content: string,
): Promise<WorkspaceWriteResult> {
  return json<WorkspaceWriteResult>(
    fetch(`/api/conversations/${conversationId}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath, content }),
    }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Artifacts 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchArtifacts(): Promise<ArtifactListItem[]> {
  const { artifacts } = await json<{ artifacts: ArtifactListItem[] }>(fetch('/api/artifacts'))
  return artifacts
}

export async function fetchArtifact(artifactId: string): Promise<ArtifactRow> {
  const { artifact } = await json<{ artifact: ArtifactRow }>(
    fetch(`/api/artifacts/${artifactId}`),
  )
  return artifact
}

export async function fetchArtifactVersions(artifactId: string): Promise<ArtifactRow[]> {
  const { versions } = await json<{ versions: ArtifactRow[] }>(
    fetch(`/api/artifacts/${artifactId}/versions`),
  )
  return versions
}

/** 锟斤拷 artifactId 为锟斤拷锟斤拷锟结交锟洁辑锟斤拷锟斤拷锟斤拷锟轿拷掳姹撅拷锟絭ersion+1锟斤拷锟斤拷锟斤拷锟斤拷锟铰诧拷锟斤拷锟叫★拷 */
export async function createArtifactVersion(
  artifactId: string,
  body: { content: unknown; title?: string },
): Promise<ArtifactRow> {
  const { artifact } = await json<{ artifact: ArtifactRow }>(
    fetch(`/api/artifacts/${artifactId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return artifact
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  await json<{ ok: true }>(
    fetch(`/api/artifacts/${artifactId}`, { method: 'DELETE' }),
  )
}

// 锟斤拷锟斤拷锟斤拷 Attachments 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchAttachments(conversationId: string): Promise<AttachmentRow[]> {
  const { attachments } = await json<{ attachments: AttachmentRow[] }>(
    fetch(`/api/conversations/${conversationId}/attachments`),
  )
  return attachments
}

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<AttachmentRow> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/conversations/${conversationId}/attachments`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`)
  }
  const { attachment } = (await res.json()) as { attachment: AttachmentRow }
  return attachment
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await json<{ ok: true }>(fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' }))
}

export function attachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`
}

// 锟斤拷锟斤拷锟斤拷 Usage / Analytics 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface UsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  runs: number
}

export interface UsageSummary {
  today: UsageBucket
  week: UsageBucket
  allTime: UsageBucket
  topConversations: Array<{
    id: string
    title: string
    totalTokens: number
    runs: number
    updatedAt: number
  }>
  byAgent: Array<{ agentId: string; name: string; totalTokens: number; runs: number }>
  byModel: Array<{ model: string; totalTokens: number; runs: number }>
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return json<UsageSummary>(fetch('/api/usage/summary'))
}

// 锟斤拷锟斤拷锟斤拷 Mobile companion connection hints 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export interface ConnectionHint {
  kind: 'tailscale' | 'lan' | 'local'
  label: string
  host: string
  url: string
  interfaceName?: string
}

export async function fetchConnectionHints(): Promise<ConnectionHint[]> {
  const { hints } = await json<{ hints: ConnectionHint[] }>(fetch('/api/connection-hints'))
  return hints
}

// 锟斤拷锟斤拷锟斤拷 App Settings (全锟斤拷 API key) 锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷
export async function fetchAppSettings(): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(fetch('/api/settings'))
  return settings
}

export interface AppSettingsPatchBody {
  anthropicApiKey?: string | null
  anthropicBaseUrl?: string | null
  openaiApiKey?: string | null
  deepseekApiKey?: string | null
  arkApiKey?: string | null
  companionMode?: 'off' | 'lan' | 'tailnet'
  mobileDeviceToken?: string | null
  deploymentPublishEnabled?: boolean
  deploymentPublishDir?: string | null
  deploymentPublicBaseUrl?: string | null
}

export async function updateAppSettings(patch: AppSettingsPatchBody): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return settings
}

export async function regenerateMobileDeviceToken(): Promise<AppSettingsRow> {
  const { settings } = await json<{ settings: AppSettingsRow }>(
    fetch('/api/settings/mobile-token', { method: 'POST' }),
  )
  return settings
}

export async function removeAgentsFromConversation(conversationId: string, removeAgentIds: string[]): Promise<any> {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeAgentIds }),
  })
  const { conversation } = await res.json()
  return conversation
}

export async function fetchSubAgents(conversationId: string): Promise<SubAgentHandle[]> {
  const { subAgents } = await json<{ subAgents: SubAgentHandle[] }>(fetch(`/api/conversations/${conversationId}/sub-agents`))
  return subAgents
}
