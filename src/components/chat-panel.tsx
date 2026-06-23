'use client'

import { AlertTriangle, ChevronDown, FilePenLine, FolderOpen, FolderTree, Layers, Menu, MessagesSquare, Shield, UserPlus, Zap, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AddAgentDialog } from '@/components/add-agent-dialog'
import { AgentInfoPopover } from '@/components/agent-info-popover'
import { AskUserQuestionDialog } from '@/components/ask-user-question-dialog'
import { ArtifactLibrary } from '@/components/artifact-library'
import { ConversationOutline } from '@/components/conversation-outline'
import { FileLibraryDialog } from '@/components/file-library-dialog'
import { FileTab } from '@/components/file-tab'
import { ModelSwitcher } from '@/components/model-switcher'
import { PendingBashCommandsPanel } from '@/components/pending-bash-commands-panel'
import { PendingWriteDiffTab } from '@/components/pending-write-diff-tab'
import { PendingWritesPanel } from '@/components/pending-writes-panel'
import { diffTabPendingId, isDiffTabId } from '@/components/pending-writes-panel'
import { PinnedMessagesBar } from '@/components/pinned-messages-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageInput } from '@/components/message-input'
import { MessageList } from '@/components/message-list'
import { UsageBadge } from '@/components/usage-badge'
import type { AgentRow } from '@/db/schema'
import {
  approvePendingBashCommand,
  approvePendingDispatchPlan,
  approvePendingWrite,
  fetchPendingBashCommands,
  fetchPendingDispatchPlans,
  fetchPendingWrites,
  removeAgentsFromConversation,
  setFsWriteApprovalMode,
  updateAgent,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  useActiveConversation,
  useActiveTab,
  useAppStore,
  useOpenFiles,
  usePendingWrites,
} from '@/stores/app-store'

export function ChatPanel() {
  const conv = useActiveConversation()
  const agents = useAppStore((s) => s.agents)
  const streamConnected = useAppStore((s) => s.streamConnected)
  const fileExplorerOpen = useAppStore((s) => s.fileExplorerOpen)
  const previewArtifactId = useAppStore((s) => s.previewArtifactId)
  const setFileExplorerOpen = useAppStore((s) => s.setFileExplorerOpen)
  const closeFile = useAppStore((s) => s.closeFile)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen)
  const setPendingDispatchPlansForConversation = useAppStore((s) => s.setPendingDispatchPlansForConversation)
  const upsertConversation = useAppStore((s) => s.upsertConversation)

  const [addOpen, setAddOpen] = useState(false)
  const [agentMgmtOpen, setAgentMgmtOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [permissionBusy, setPermissionBusy] = useState(false)

  const handleRemoveAgent = async (agentId: string) => {
    if (!conv) return
    try {
      const updated = await removeAgentsFromConversation(conv.id, [agentId])
      upsertConversation(updated)
    } catch (err) {
      console.warn('[对话Panel] remove agent failed', err)
    }
  }

  const handleModelChange = async (agentId: string, modelId: string) => {
    try {
      const updated = await updateAgent(agentId, { modelId })
      useAppStore.getState().upsertAgent(updated)
    } catch (err) {
      console.warn('[对话Panel] update model failed', err)
    }
  }

  const setPermissionMode = async (nextMode: 'auto' | 'review') => {
    if (!conv || permissionBusy || approvalMode === nextMode) return
    setPermissionBusy(true)
    try {
      const updated = await setFsWriteApprovalMode(conv.id, nextMode)
      upsertConversation(updated)
      if (nextMode === 'auto') {
        await Promise.allSettled([
          sweepPendingWrites(conv.id),
          sweepPendingBashCommands(conv.id),
          sweepPendingDispatchPlans(conv.id),
        ])
      }
    } catch (err) {
      console.warn('[对话Panel] set permission mode failed', err)
    } finally {
      setPermissionBusy(false)
    }
  }

  const sweepPendingWrites = async (conversationId: string) => {
    const pending = await fetchPendingWrites(conversationId)
    await Promise.allSettled(pending.map((item) => approvePendingWrite(conversationId, item.id)))
  }

  const sweepPendingBashCommands = async (conversationId: string) => {
    const pending = await fetchPendingBashCommands(conversationId)
    await Promise.allSettled(pending.map((item) => approvePendingBashCommand(conversationId, item.id)))
  }

  const sweepPendingDispatchPlans = async (conversationId: string) => {
    const pending = await fetchPendingDispatchPlans(conversationId)
    await Promise.allSettled(pending.map((item) => approvePendingDispatchPlan(conversationId, item.id)))
  }

  const openFiles = useOpenFiles(conv?.id ?? '')
  const activeTab = useActiveTab(conv?.id ?? '')
  const pendingWrites = usePendingWrites(conv?.id ?? null)
  const pendingById = useMemo(() => new Map(pendingWrites.map((p) => [p.id, p])), [pendingWrites])

  useEffect(() => {
    if (!conv) return
    for (const tabId of openFiles) {
      if (isDiffTabId(tabId) && !pendingById.has(diffTabPendingId(tabId))) {
        closeFile(conv.id, tabId)
      }
    }
  }, [conv, openFiles, pendingById, closeFile])

  useEffect(() => {
    if (!conv) return
    let cancelled = false
    fetchPendingDispatchPlans(conv.id)
      .then((list) => {
        if (!cancelled) setPendingDispatchPlansForConversation(conv.id, list)
      })
      .catch((err) => {
        console.warn('[对话Panel] fetch pending dispatch plans failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [conv, setPendingDispatchPlansForConversation])

  if (!conv) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center bg-background">
        <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <MessagesSquare className="size-7 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">Start a multi-agent conversation</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Pick a conversation on the left, or create a new one to begin.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const participantAgents = conv.agentIds.map((id) => agents[id]).filter(Boolean)
  const approvalMode = conv.fsWriteApprovalMode ?? 'review'

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 overflow-hidden border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setMobileSidebarOpen(true)}
            title="打开侧边栏"
            className="md:hidden"
          >
            <Menu className="size-4" />
          </Button>
          <ParticipantStack agents={participantAgents} onRemove={conv.mode === 'group' ? handleRemoveAgent : undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium">{conv.title}</span>
              {conv.workspaceMode === 'local' && conv.workspaceBoundPath && (
                <span
                  title={`Workspace: ${conv.workspaceBoundPath}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <AlertTriangle className="size-2.5" />
                  Local
                </span>
              )}
            </div>
            <Popover open={agentMgmtOpen} onOpenChange={setAgentMgmtOpen}>
              <PopoverTrigger className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground" aria-label="查看会话成员">
                <span>
                  {conv.mode === 'single' ? '单聊' : '群聊'} / {participantAgents.length} agents
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2">
                <div className="mb-2 text-xs font-medium text-muted-foreground">群聊成员</div>
                {participantAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between rounded px-1 py-1.5 hover:bg-accent">
                    <div className="flex min-w-0 items-center gap-2">
                      <AgentInfoPopover agent={agent} size="xs" />
                      <span className="truncate text-sm">{agent.name}</span>
                    </div>
                    {participantAgents.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleRemoveAgent(agent.id)
                          setAgentMgmtOpen(false)
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="移除"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex min-w-0 max-w-[70%] shrink-0 items-center gap-1 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {participantAgents.length > 1 && (
            <Popover open={modelsOpen} onOpenChange={setModelsOpen}>
              <PopoverTrigger
                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2 text-sm transition hover:bg-muted hover:text-foreground"
                aria-label="切换成员模型"
              >
                <Layers className="size-3.5" />
                <span>模型</span>
                <ChevronDown className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">成员模型</div>
                  <span className="text-[10px] text-muted-foreground">逐个切换每个 Agent 的模型</span>
                </div>
                <ScrollArea className="max-h-80 pr-1">
                  <div className="flex flex-col gap-2">
                    {participantAgents.map((agent) => (
                      <div key={agent.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{agent.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {agent.modelProvider ?? 'provider'} / {agent.modelId ?? 'unselected'}
                          </div>
                        </div>
                        <ModelSwitcher
                          provider={agent.modelProvider ?? ''}
                          currentModel={agent.modelId ?? ''}
                          apiKey={agent.apiKey ?? undefined}
                          apiBaseUrl={agent.apiBaseUrl ?? undefined}
                          onModelChange={(modelId) => void handleModelChange(agent.id, modelId)}
                          className="shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          <div className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 shadow-sm" aria-label="当前会话写权限切换">
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground">当前会话写权限</span>
              <span className="text-[11px] font-medium text-foreground">{approvalMode === 'auto' ? '全开' : '审查'}</span>
            </div>
            <button
              type="button"
              onClick={() => void setPermissionMode('review')}
              disabled={permissionBusy}
              className={cn(
                'inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                approvalMode === 'review'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="当前会话恢复到人工审批"
            >
              <Shield className="size-3.5" />
              审查
            </button>
            <button
              type="button"
              onClick={() => void setPermissionMode('auto')}
              disabled={permissionBusy}
              className={cn(
                'inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                approvalMode === 'auto'
                  ? 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="当前会话写权限全开"
            >
              <Zap className="size-3.5" />
              全开
            </button>
          </div>

          <Button
            size="icon-sm"
            variant={fileExplorerOpen ? 'default' : 'ghost'}
            onClick={() => setFileExplorerOpen(!fileExplorerOpen)}
            title={fileExplorerOpen ? '关闭文件树' : '打开文件树'}
          >
            <FolderTree className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant={artifactsOpen || previewArtifactId ? 'default' : 'ghost'}
            onClick={() => setArtifactsOpen(true)}
            title="会话产物库"
          >
            <Layers className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setFilesOpen(true)}
            title="会话文件库"
          >
            <FolderOpen className="size-4" />
          </Button>
          <ConversationOutline conversationId={conv.id} />
          <Button size="icon-sm" variant="ghost" onClick={() => setAddOpen(true)} title="添加 Agent">
            <UserPlus className="size-4" />
          </Button>
          <UsageBadge conversationId={conv.id} />
          <Badge variant={streamConnected ? 'default' : 'outline'} className="gap-1 px-1.5 text-[11px]">
            <span className={cn('size-1.5 rounded-full', streamConnected ? 'bg-green-500' : 'bg-zinc-400')} />
            {streamConnected ? '已连接' : '断开'}
          </Badge>
        </div>
      </header>

      {openFiles.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-card/50 px-2 py-1 text-xs">
          <TabButton label="对话" active={activeTab === 'chat'} onClick={() => setActiveTab(conv.id, 'chat')} />
          {openFiles.map((tabId) => {
            if (isDiffTabId(tabId)) {
              const pw = pendingById.get(diffTabPendingId(tabId))
              const name = pw ? pw.path.split('/').pop() ?? pw.path : '已处理'
              return (
                <TabButton
                  key={tabId}
                  label={`diff: ${name}`}
                  tooltip={pw?.path}
                  icon={<FilePenLine className="size-3 text-[#3370FF]" />}
                  active={activeTab === tabId}
                  onClick={() => setActiveTab(conv.id, tabId)}
                  onClose={() => closeFile(conv.id, tabId)}
                  highlight
                />
              )
            }
            return (
              <TabButton
                key={tabId}
                label={tabId.split('/').pop() ?? tabId}
                tooltip={tabId}
                active={activeTab === tabId}
                onClick={() => setActiveTab(conv.id, tabId)}
                onClose={() => closeFile(conv.id, tabId)}
              />
            )
          })}
        </div>
      )}

      {activeTab === 'chat' || !openFiles.includes(activeTab) ? (
        <>
          <PinnedMessagesBar conversationId={conv.id} />
          <MessageList conversationId={conv.id} />
          <PendingBashCommandsPanel conversationId={conv.id} />
          <PendingWritesPanel conversationId={conv.id} />
          <MessageInput conversationId={conv.id} />
        </>
      ) : isDiffTabId(activeTab) ? (
        <PendingWriteDiffTab conversationId={conv.id} pendingId={diffTabPendingId(activeTab)} />
      ) : (
        <FileTab conversationId={conv.id} relPath={activeTab} />
      )}

      <AddAgentDialog open={addOpen} onOpenChange={setAddOpen} conversationId={conv.id} existingAgentIds={conv.agentIds} />
      <FileLibraryDialog open={filesOpen} onOpenChange={setFilesOpen} conversationId={conv.id} />

      <Dialog open={artifactsOpen} onOpenChange={setArtifactsOpen}>
        <DialogContent className="grid max-h-[min(680px,calc(100vh-2rem))] max-w-md grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Layers className="size-4 text-muted-foreground" />
              会话产物
            </DialogTitle>
            <DialogDescription className="truncate text-xs" title={conv.title}>
              {conv.title}
            </DialogDescription>
          </DialogHeader>
          <ArtifactLibrary conversationId={conv.id} showConversationTitle={false} />
        </DialogContent>
      </Dialog>

      <AskUserQuestionDialog conversationId={conv.id} />
    </main>
  )
}

function ParticipantStack({ agents, onRemove }: { agents: AgentRow[]; onRemove?: (id: string) => void }) {
  const visibleAgents = agents.slice(0, 3)
  const hiddenAgents = agents.slice(3)
  const title = agents.map((agent) => agent.name).join(' / ')

  return (
    <div className="flex shrink-0 -space-x-2 overflow-hidden pr-1" title={title}>
      {visibleAgents.map((agent) => (
        <div key={agent.id} className="group/agent relative shrink-0">
          <AgentInfoPopover agent={agent} size="sm" avatarClassName="border-2 border-background" />
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(agent.id)
              }}
              className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground opacity-0 transition-opacity group-hover/agent:opacity-100"
              title={`Remove ${agent.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {hiddenAgents.length > 0 && (
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold text-muted-foreground"
          title={hiddenAgents.map((agent) => agent.name).join(' / ')}
        >
          +{hiddenAgents.length}
        </div>
      )}
    </div>
  )
}

function TabButton({
  label,
  tooltip,
  icon,
  active,
  highlight,
  onClick,
  onClose,
}: {
  label: string
  tooltip?: string
  icon?: React.ReactNode
  active: boolean
  highlight?: boolean
  onClick: () => void
  onClose?: () => void
}) {
  return (
    <div
      title={tooltip}
      className={cn(
        'group flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 transition',
        active
          ? highlight
            ? 'border-[#3370FF]/40 bg-[#3370FF]/5 text-foreground shadow-sm'
            : 'border-primary/30 bg-background shadow-sm'
          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {icon}
      <button type="button" onClick={onClick} className="max-w-[180px] truncate">
        {label}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="rounded p-0.5 opacity-50 transition hover:bg-accent hover:opacity-100"
          title="关闭"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
