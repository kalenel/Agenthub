'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BookOpenText,
  Clock3,
  DatabaseSearch,
  LibraryBig,
  NotebookText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MemoryArchiveActions } from '@/components/memory-archive-actions'
import { MemoryConversationPinPanel } from '@/components/memory-conversation-pin-panel'
import { MemoryHighlightsPanel } from '@/components/memory-highlights'
import type { ConversationWithMeta } from '@/db/schema'
import {
  fetchMemoryPack,
  fetchRecentMemories,
  recordMemory,
  searchMemories,
  type MemoryEntry,
  type MemoryMode,
  type MemoryPack,
  type MemoryPackArchiveImportResult,
  type MemoryPackResult,
  type MemoryRecord,
  type MemoryRecipient,
  type MemoryScope,
  type MemorySearchHit,
} from '@/lib/memory-api'
import { cn } from '@/lib/utils'
import { useActiveConversation } from '@/stores/app-store'

const MEMORY_MODES: Array<{ value: MemoryMode; label: string }> = [
  { value: 'coding', label: '编码' },
  { value: 'chat', label: '聊天' },
  { value: 'report', label: '汇报' },
  { value: 'recovery', label: '恢复' },
  { value: 'subagent', label: '子代理' },
]

const MEMORY_SCOPE_OPTIONS: Array<{ value: MemoryScope; label: string }> = [
  { value: 'session', label: '会话' },
  { value: 'project', label: '项目' },
  { value: 'core', label: '核心' },
]

const SEARCH_SCOPE_OPTIONS: Array<{ value: 'all' | MemoryScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'session', label: '会话' },
  { value: 'project', label: '项目' },
  { value: 'core', label: '核心' },
]

type MemoryKind = 'fact' | 'decision' | 'progress' | 'transition' | 'summary' | 'note'

const MEMORY_KIND_OPTIONS: Array<{ value: MemoryKind; label: string }> = [
  { value: 'fact', label: '事实' },
  { value: 'decision', label: '决定' },
  { value: 'progress', label: '进度' },
  { value: 'transition', label: '转折' },
  { value: 'summary', label: '摘要' },
  { value: 'note', label: '备注' },
]

type MemoryTab = 'pack' | 'recent' | 'search' | 'remember'

const PACK_PRESETS: Record<MemoryMode, { limit: number; maxTokens: number; recipient: MemoryRecipient }> = {
  coding: { limit: 6, maxTokens: 720, recipient: 'model' },
  chat: { limit: 10, maxTokens: 2400, recipient: 'ui' },
  report: { limit: 10, maxTokens: 2200, recipient: 'ui' },
  recovery: { limit: 14, maxTokens: 2600, recipient: 'window' },
  subagent: { limit: 8, maxTokens: 800, recipient: 'subagent' },
  search: { limit: 0, maxTokens: 0, recipient: 'search' },
}

function defaultModeForConversation(conversation: ConversationWithMeta | null): MemoryMode {
  return conversation?.workspaceMode === 'local' ? 'coding' : 'chat'
}

function defaultScopeForConversation(conversation: ConversationWithMeta | null): MemoryScope {
  return conversation?.workspaceMode === 'local' ? 'project' : 'session'
}

function timeLabel(value: number | string): string {
  const ts = typeof value === 'string' ? Date.parse(value) : value
  if (!Number.isFinite(ts)) return ''
  const delta = Date.now() - ts
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const abs = Math.abs(delta)
  if (abs < minute) return `${Math.max(1, Math.round(abs / 1000))}秒${delta >= 0 ? '前' : '后'}`
  if (abs < hour) return `${Math.max(1, Math.round(abs / minute))}分${delta >= 0 ? '前' : '后'}`
  if (abs < day) return `${Math.max(1, Math.round(abs / hour))}小时${delta >= 0 ? '前' : '后'}`
  return `${Math.max(1, Math.round(abs / day))}天${delta >= 0 ? '前' : '后'}`
}

function labelForScope(scope: MemoryScope): string {
  return MEMORY_SCOPE_OPTIONS.find((item) => item.value === scope)?.label ?? scope
}

function labelForKind(kind: MemoryKind): string {
  return MEMORY_KIND_OPTIONS.find((item) => item.value === kind)?.label ?? kind
}

function labelForRecipient(recipient: MemoryRecipient): string {
  switch (recipient) {
    case 'model':
      return '模型'
    case 'subagent':
      return '子代理'
    case 'window':
      return '窗口'
    case 'ui':
      return '界面'
    case 'search':
      return '检索'
  }
}

function modeSummary(mode: MemoryMode): string {
  switch (mode) {
    case 'coding':
      return '更短、更准，给模型直接喂证据'
    case 'chat':
      return '更完整，适合窗口阅读'
    case 'report':
      return '偏汇报，强调总结与结论'
    case 'recovery':
      return '偏恢复，优先补上下文'
    case 'subagent':
      return '偏子代理，强调任务边界'
    case 'search':
      return '偏检索，直接查命中结果'
  }
}

function recurrenceLabel(conversation: ConversationWithMeta | null): string {
  if (!conversation) return '无当前会话'
  const workspace = conversation.workspaceMode === 'local' ? 'local' : 'sandbox'
  const path = conversation.workspaceBoundPath ? ` · ${conversation.workspaceBoundPath}` : ''
  return `${conversation.title} · ${workspace}${path}`
}

function importanceForKind(kind: MemoryKind): number {
  switch (kind) {
    case 'progress':
    case 'transition':
      return 4
    case 'decision':
    case 'summary':
      return 3
    case 'fact':
      return 2
    default:
      return 1
  }
}

export function MemoryButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="group"
        onClick={() => setOpen(true)}
        aria-label="记忆"
        title="记忆"
      >
        <LibraryBig className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:scale-110 motion-safe:group-active:scale-90" />
      </Button>
      <MemoryDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}

export function MemoryDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const activeConversation = useActiveConversation()
  const conversationId = activeConversation?.id ?? null
  const defaultMode = defaultModeForConversation(activeConversation)
  const defaultScope = defaultScopeForConversation(activeConversation)

  const [tab, setTab] = useState<MemoryTab>('pack')
  const [manualMode, setManualMode] = useState<MemoryMode | null>(null)
  const [pack, setPack] = useState<MemoryPackResult | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [recent, setRecent] = useState<MemoryEntry[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<'all' | MemoryScope>('all')
  const [searchResults, setSearchResults] = useState<MemorySearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftKind, setDraftKind] = useState<MemoryKind>('fact')
  const [draftScope, setDraftScope] = useState<MemoryScope>(defaultScope)
  const [saving, setSaving] = useState(false)

  const packCount = pack?.pack.records.length ?? 0
  const recentCount = recent.length
  const searchCount = searchResults.length

  const packRequestId = useRef(0)
  const recentRequestId = useRef(0)
  const searchRequestId = useRef(0)

  const effectiveMode = manualMode ?? defaultMode
  const currentPackConfig = PACK_PRESETS[effectiveMode]
  const activeModeLabel = MEMORY_MODES.find((item) => item.value === effectiveMode)?.label ?? '聊天'
  const activeRecipientLabel = labelForRecipient(currentPackConfig.recipient)
  const activeScopeLabel = labelForScope(draftScope)
  const activeSearchScopeLabel = SEARCH_SCOPE_OPTIONS.find((item) => item.value === searchScope)?.label ?? '全部'

  const loadPack = useCallback(async () => {
    if (!open) return
    const requestId = ++packRequestId.current
    setPackLoading(true)
    setPackError(null)
    try {
      const result = await fetchMemoryPack({
        mode: effectiveMode,
        conversationId,
        recipient: currentPackConfig.recipient,
        limit: currentPackConfig.limit,
        maxTokens: currentPackConfig.maxTokens,
      })
      if (packRequestId.current !== requestId) return
      setPack(result)
    } catch (error) {
      if (packRequestId.current !== requestId) return
      setPackError(error instanceof Error ? error.message : String(error))
      setPack(null)
    } finally {
      if (packRequestId.current === requestId) setPackLoading(false)
    }
  }, [conversationId, currentPackConfig.limit, currentPackConfig.maxTokens, currentPackConfig.recipient, effectiveMode, open])

  const loadRecent = useCallback(async () => {
    if (!open) return
    const requestId = ++recentRequestId.current
    setRecentLoading(true)
    setRecentError(null)
    try {
      const result = await fetchRecentMemories(12)
      if (recentRequestId.current !== requestId) return
      setRecent(result.results)
    } catch (error) {
      if (recentRequestId.current !== requestId) return
      setRecentError(error instanceof Error ? error.message : String(error))
      setRecent([])
    } finally {
      if (recentRequestId.current === requestId) setRecentLoading(false)
    }
  }, [open])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPack(), loadRecent()])
  }, [loadPack, loadRecent])

  const handleArchiveImported = useCallback(async (_result: MemoryPackArchiveImportResult) => {
    await Promise.all([loadPack(), loadRecent()])
  }, [loadPack, loadRecent])

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim()
    if (!q) {
      setSearchResults([])
      setSearchError(null)
      return
    }
    const requestId = ++searchRequestId.current
    setSearchLoading(true)
    setSearchError(null)
    try {
      const result = await searchMemories(q, 12, 0, searchScope === 'all' ? undefined : searchScope)
      if (searchRequestId.current !== requestId) return
      setSearchResults(result.results)
    } catch (error) {
      if (searchRequestId.current !== requestId) return
      setSearchError(error instanceof Error ? error.message : String(error))
      setSearchResults([])
    } finally {
      if (searchRequestId.current === requestId) setSearchLoading(false)
    }
  }, [searchScope])

  useEffect(() => {
    setManualMode(null)
    setDraftScope(defaultScope)
    setSearchScope('all')
    setTab('pack')
    setSaveError(null)
  }, [conversationId, defaultScope])

  useEffect(() => {
    if (!open) return
    void loadPack()
  }, [loadPack, open])

  useEffect(() => {
    if (!open) return
    void loadRecent()
  }, [loadRecent, open])

  const handleRemember = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = draftText.trim()
      if (!text || saving) return
      setSaving(true)
      setSaveError(null)
      try {
        await recordMemory({
          conversationId,
          scope: draftScope,
          kind: draftKind,
          text,
          source: 'memory-drawer',
          recipient: 'ui',
          importance: importanceForKind(draftKind),
          confidence: 100,
          tags: ['memory-drawer', draftScope, draftKind],
          payload: {
            origin: 'memory-drawer',
            conversationTitle: activeConversation?.title ?? null,
            workspaceMode: activeConversation?.workspaceMode ?? null,
          },
        })
        setDraftText('')
        await Promise.all([loadPack(), loadRecent()])
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error))
      } finally {
        setSaving(false)
      }
    },
    [activeConversation?.title, activeConversation?.workspaceMode, conversationId, draftKind, draftScope, draftText, loadPack, loadRecent, saving],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'left-0 top-0 h-[100dvh] w-[min(100vw,540px)] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-y-0 border-l-0 border-r border-border/70 bg-background p-0 shadow-2xl outline-none sm:w-[min(100vw,560px)]',
          'data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-left-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-left-4',
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                  <LibraryBig className="size-4 text-muted-foreground" />
                  记忆
                </DialogTitle>
                <DialogDescription className="mt-1 truncate text-xs">
                  {recurrenceLabel(activeConversation)}
                </DialogDescription>
              </div>
              <div className="flex items-start gap-1">
                <MemoryArchiveActions
                  conversationId={conversationId}
                  mode={effectiveMode}
                  recipient={currentPackConfig.recipient}
                  limit={currentPackConfig.limit}
                  maxTokens={currentPackConfig.maxTokens}
                  onImported={handleArchiveImported}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  aria-label="关闭记忆面板"
                  title="关闭"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-muted/30 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">当前包</div>
                <div className="mt-1 text-sm font-semibold tabular-nums">{packLoading ? '...' : packCount}</div>
              </div>
              <div className="rounded-xl border bg-muted/30 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">最近记忆</div>
                <div className="mt-1 text-sm font-semibold tabular-nums">{recentLoading ? '...' : recentCount}</div>
              </div>
              <div className="rounded-xl border bg-muted/30 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">检索命中</div>
                <div className="mt-1 text-sm font-semibold tabular-nums">{searchLoading ? '...' : searchCount}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline">{conversationId ? '会话记忆' : '全局记忆'}</Badge>
              <Badge variant="secondary">{activeModeLabel}</Badge>
              <Badge variant="ghost">{activeRecipientLabel}</Badge>
            </div>
          </DialogHeader>

          {conversationId ? (
            <div className="border-b px-4 py-3">
              <MemoryConversationPinPanel conversationId={conversationId} />
            </div>
          ) : null}

          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">当前模式</div>
                <div className="truncate text-sm font-medium">{activeModeLabel}</div>
                <div className="mt-1 text-xs text-muted-foreground">{modeSummary(effectiveMode)}</div>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => void loadPack()}
                title="刷新"
                aria-label="刷新记忆包"
              >
                <RefreshCw className={cn('size-4', packLoading && 'animate-spin')} />
              </Button>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
              <Button
                type="button"
                size="xs"
                variant={manualMode === null ? 'secondary' : 'ghost'}
                onClick={() => setManualMode(null)}
                className="shrink-0"
              >
                自动
              </Button>
              {MEMORY_MODES.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="xs"
                  variant={effectiveMode === item.value ? 'default' : 'ghost'}
                  onClick={() => setManualMode(item.value)}
                  className="shrink-0"
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as MemoryTab)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-2">
              <TabsList className="grid h-9 grid-cols-4 gap-1 bg-muted/60 p-1">
                <TabsTrigger value="pack" className="gap-1.5 text-xs">
                  <BookOpenText className="size-3.5" />
                  当前
                  <span className="tabular-nums text-[10px] text-muted-foreground">{packCount}</span>
                </TabsTrigger>
                <TabsTrigger value="recent" className="gap-1.5 text-xs">
                  <Clock3 className="size-3.5" />
                  最近
                  <span className="tabular-nums text-[10px] text-muted-foreground">{recentCount}</span>
                </TabsTrigger>
                <TabsTrigger value="search" className="gap-1.5 text-xs">
                  <DatabaseSearch className="size-3.5" />
                  搜索
                  <span className="tabular-nums text-[10px] text-muted-foreground">{searchCount}</span>
                </TabsTrigger>
                <TabsTrigger value="remember" className="gap-1.5 text-xs">
                  <NotebookText className="size-3.5" />
                  记住
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1">
              <TabsContent value="pack" className="m-0 h-full outline-none">
                <ScrollArea className="h-full">
                  <div className="space-y-3 px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">当前包</div>
                        <div className="text-xs text-muted-foreground">session → project → core</div>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void refreshAll()} className="gap-1.5">
                        <RefreshCw className={cn('size-3.5', (packLoading || recentLoading) && 'animate-spin')} />
                        刷新全部
                      </Button>
                    </div>
                    <PackSummary pack={pack?.pack ?? null} loading={packLoading} error={packError} />
                    <MemoryList
                      title="当前包"
                      empty="还没有加载到记忆包"
                      loading={packLoading}
                      error={packError}
                      records={pack?.pack.records ?? []}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="recent" className="m-0 h-full outline-none">
                <ScrollArea className="h-full">
                  <div className="space-y-3 px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">最近记忆</div>
                        <div className="text-xs text-muted-foreground">最近写入 / 更新的活跃记录</div>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void loadRecent()}
                        title="刷新最近记忆"
                        aria-label="刷新最近记忆"
                      >
                        <RefreshCw className={cn('size-4', recentLoading && 'animate-spin')} />
                      </Button>
                    </div>
                    <MemoryEntryList
                      loading={recentLoading}
                      error={recentError}
                      empty="还没有最近记忆"
                      entries={recent}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="search" className="m-0 h-full outline-none">
                <ScrollArea className="h-full">
                  <div className="space-y-3 px-4 py-4">
                    <form
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void runSearch(searchQuery)
                      }}
                    >
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜记忆"
                        className="flex-1"
                      />
                      <label className="grid gap-1 text-[10px] text-muted-foreground">
                        范围
                        <select
                          value={searchScope}
                          onChange={(event) => setSearchScope(event.target.value as 'all' | MemoryScope)}
                          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                        >
                          {SEARCH_SCOPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button type="submit" size="sm" disabled={searchLoading} className="shrink-0 gap-1.5">
                        {searchLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                        搜索
                      </Button>
                    </form>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <SlidersHorizontal className="size-3.5" />
                      <span>搜索范围</span>
                      <Badge variant="outline">{activeSearchScopeLabel}</Badge>
                    </div>
                    {searchError && <NoticeTone tone="error" text={searchError} />}
                    <MemoryEntryList
                      loading={searchLoading}
                      error={searchError}
                      empty={searchQuery.trim() ? '没有匹配结果' : '输入关键词后搜索'}
                      entries={searchResults}
                      showRelevance
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="remember" className="m-0 h-full outline-none">
                <ScrollArea className="h-full">
                  <form className="space-y-3 px-4 py-4" onSubmit={(event) => void handleRemember(event)}>
                    <section className="rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>当前范围</span>
                        <Badge variant="outline">{activeScopeLabel}</Badge>
                      </div>
                      <div className="mt-1">{conversationId ? recurrenceLabel(activeConversation) : '全局范围，写入本地 SQLite 真源'}</div>
                    </section>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <label className="grid gap-1.5 text-xs font-medium">
                        范围
                        <select
                          value={draftScope}
                          onChange={(event) => setDraftScope(event.target.value as MemoryScope)}
                          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                        >
                          {MEMORY_SCOPE_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={option.value === 'project' && !activeConversation}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        类型
                        <select
                          value={draftKind}
                          onChange={(event) => setDraftKind(event.target.value as MemoryKind)}
                          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                        >
                          {MEMORY_KIND_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-1.5 text-xs font-medium">
                      内容
                      <textarea
                        value={draftText}
                        onChange={(event) => setDraftText(event.target.value)}
                        placeholder="把这件事记下来"
                        className="min-h-32 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                      />
                    </label>
                    {saveError && <NoticeTone tone="error" text={saveError} />}
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-xs text-muted-foreground">
                        {draftScope === 'project' && !activeConversation
                          ? '项目范围需要当前会话。'
                          : `写入后进入 ${activeScopeLabel} / ${labelForKind(draftKind)}`}
                      </p>
                      <Button type="submit" size="sm" disabled={saving || !draftText.trim()} className="gap-1.5">
                        {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <NotebookText className="size-3.5" />}
                        记住
                      </Button>
                    </div>
                  </form>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PackSummary({
  pack,
  loading,
  error,
}: {
  pack: MemoryPack | null
  loading: boolean
  error: string | null
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">包摘要</div>
          <div className="text-xs text-muted-foreground">session → project → core</div>
        </div>
        {pack && (
          <div className="flex gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant="outline">S {pack.counts.session}</Badge>
            <Badge variant="outline">P {pack.counts.project}</Badge>
            <Badge variant="outline">C {pack.counts.core}</Badge>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {pack && <span>命中 {pack.queryHits}</span>}
        {pack && <span>记录 {pack.records.length}</span>}
        {loading && <span>加载中…</span>}
        {error && <span className="text-destructive">{error}</span>}
      </div>
      <div className="mt-3">
        <MemoryHighlightsPanel highlights={pack?.highlights ?? null} loading={loading} />
      </div>
    </section>
  )
}

function MemoryList({
  title,
  empty,
  loading,
  error,
  records,
}: {
  title: string
  empty: string
  loading: boolean
  error: string | null
  records: MemoryRecord[]
}) {
  return (
    <section className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      {loading ? (
        <div className="rounded-xl border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
          加载中…
        </div>
      ) : error ? (
        <NoticeTone tone="error" text={error} />
      ) : records.length === 0 ? (
        <div className="rounded-xl border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <MemoryRecordCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </section>
  )
}

function MemoryEntryList({
  entries,
  empty,
  loading,
  error,
  showRelevance = false,
}: {
  entries: MemoryEntry[] | MemorySearchHit[]
  empty: string
  loading: boolean
  error: string | null
  showRelevance?: boolean
}) {
  return loading ? (
    <div className="rounded-xl border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
      加载中…
    </div>
  ) : error ? (
    <NoticeTone tone="error" text={error} />
  ) : entries.length === 0 ? (
    <div className="rounded-xl border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
      {empty}
    </div>
  ) : (
    <div className="space-y-2">
      {entries.map((entry) => (
        <MemoryEntryCard key={`${entry.type}:${entry.time}:${entry.content.slice(0, 24)}`} entry={entry} showRelevance={showRelevance} />
      ))}
    </div>
  )
}

function MemoryRecordCard({ record }: { record: MemoryRecord }) {
  return (
    <article className="rounded-xl border bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{record.scope}</Badge>
          <Badge variant="secondary">{record.kind}</Badge>
          {record.status !== 'active' && <Badge variant="ghost">{record.status}</Badge>}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(record.updatedAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-foreground">{record.text}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span title={record.source}>来源 {record.source}</span>
        {record.projectKey && <span title={record.projectKey}>项目 {record.projectKey}</span>}
        {record.conversationId && <span title={record.conversationId}>会话 {record.conversationId}</span>}
      </div>
      {typeof record.payload.evidenceRef === 'string' ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>证据 {record.payload.evidenceRef}</span>
        </div>
      ) : null}
      {record.whyLoaded?.length ? (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{record.whyLoaded.join(' · ')}</p>
      ) : null}
    </article>
  )
}

function MemoryEntryCard({
  entry,
  showRelevance = false,
}: {
  entry: MemoryEntry | MemorySearchHit
  showRelevance?: boolean
}) {
  return (
    <article className="rounded-xl border bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="outline">{entry.type}</Badge>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(entry.time)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-foreground">{entry.content}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span title={entry.time}>{entry.time}</span>
        {showRelevance && 'relevance' in entry && <span>相关度 {Math.round(entry.relevance * 100)}%</span>}
      </div>
    </article>
  )
}

function NoticeTone({ tone, text }: { tone: 'error' | 'info'; text: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 text-xs',
        tone === 'error' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted/20 text-muted-foreground',
      )}
    >
      {text}
    </div>
  )
}
