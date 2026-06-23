'use client'

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  UserRoundCog,
  X,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchSubAgents } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SubAgentHandle } from '@/shared/types'

type TreeNode = SubAgentHandle & {
  children: TreeNode[]
}

type AnnotatedNode = Omit<TreeNode, 'children'> & {
  children: AnnotatedNode[]
  blocked: boolean
  blockReason: string | null
  blockedDescendantCount: number
}

type BlockingChainView = {
  leafId: string
  text: string
}

type BlockingSummary = {
  blockedRoots: number
  blockingChains: BlockingChainView[]
  blockedLeafLabels: string[]
  rootLabels: string[]
}

const STATUS_LABELS: Record<SubAgentHandle['status'], string> = {
  running: '运行中',
  completed: '已完成',
  closed: '已关闭',
  error: '出错',
}

const STATUS_ORDER: Record<SubAgentHandle['status'], number> = {
  running: 0,
  error: 1,
  completed: 2,
  closed: 3,
}

export function SubAgentPanel({ conversationId }: { conversationId: string }) {
  const [subAgents, setSubAgents] = useState<SubAgentHandle[]>([])
  const [loading, setLoading] = useState(false)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isRefreshingRef = useRef(false)
  const conversationIdRef = useRef(conversationId)

  useEffect(() => {
    conversationIdRef.current = conversationId
    setSubAgents([])
    setError(null)
    setLoading(false)
    setCollapsedById({})
    setSelectedId(null)
    isRefreshingRef.current = false
  }, [conversationId])

  const refresh = useCallback(async (silent = false) => {
    if (isRefreshingRef.current) return

    const activeConversationId = conversationIdRef.current
    isRefreshingRef.current = true
    if (!silent) setLoading(true)

    try {
      const list = await fetchSubAgents(activeConversationId)
      if (conversationIdRef.current !== activeConversationId) return
      setSubAgents(list)
      setError(null)
    } catch (err) {
      if (conversationIdRef.current !== activeConversationId) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error('[SubAgentPanel] refresh failed', err)
    } finally {
      isRefreshingRef.current = false
      if (conversationIdRef.current === activeConversationId && !silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh(false)
    const timer = window.setInterval(() => {
      void refresh(true)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const tree = useMemo(() => annotateTree(buildTree(subAgents)), [subAgents])
  const nodeIndex = useMemo(() => buildNodeIndex(tree), [tree])
  const preferredNode = useMemo(() => pickPreferredNode(tree), [tree])
  const visibleTree = useMemo(() => (blockedOnly ? pruneTree(tree, (node) => node.blocked) : tree), [blockedOnly, tree])
  const blockingSummary = useMemo(() => summarizeBlockingChains(tree, nodeIndex), [nodeIndex, tree])

  const selectedNode = useMemo(() => {
    if (selectedId && nodeIndex.has(selectedId)) return nodeIndex.get(selectedId) ?? null
    return preferredNode
  }, [nodeIndex, preferredNode, selectedId])

  useEffect(() => {
    if (!preferredNode) {
      if (selectedId !== null) setSelectedId(null)
      return
    }

    if (!selectedId || !nodeIndex.has(selectedId)) {
      setSelectedId(preferredNode.id)
    }
  }, [nodeIndex, preferredNode, selectedId])

  const selectedPath = useMemo(() => {
    if (!selectedNode) return []
    return collectPath(selectedNode.id, nodeIndex)
  }, [nodeIndex, selectedNode])

  const traceSet = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath])
  const summary = useMemo(() => summarizeNodes(tree), [tree])
  const latestSyncLabel = summary.latestUpdatedAt
    ? new Date(summary.latestUpdatedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—'

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId)
      const path = collectPath(nodeId, nodeIndex)
      setCollapsedById((state) => {
        const next = { ...state }
        for (const ancestor of path.slice(0, -1)) {
          delete next[ancestor.id]
        }
        return next
      })
    },
    [nodeIndex],
  )

  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedById((state) => ({
      ...state,
      [nodeId]: !state[nodeId],
    }))
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <UserRoundCog className="size-4 text-muted-foreground" />
              <h2 className="truncate text-sm font-semibold">DAG / Sub-agents</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">当前会话的子 agent 任务树，按父子链路展开</p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={blockedOnly ? 'default' : 'outline'}
              onClick={() => setBlockedOnly((value) => !value)}
              disabled={loading}
              title={blockedOnly ? '显示全部节点' : '只看阻塞节点'}
            >
              <Filter className="size-3.5" />
              只看阻塞
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => void refresh(false)} disabled={loading} title="刷新">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-2 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{error}</span>
            <Button size="icon-xs" variant="ghost" onClick={() => void refresh(false)} title="重试">
              <RefreshCw className="size-3.5" />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => setError(null)} title="关闭错误">
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
          <Card size="sm" className="border-muted/60 bg-background/80 shadow-none">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-[11px]">总数</CardTitle>
              <CardDescription className="text-[10px]">当前会话子 agent</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-2 text-lg font-semibold leading-none">{summary.total}</CardContent>
          </Card>
          <Card size="sm" className="border-muted/60 bg-background/80 shadow-none">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-[11px]">运行中</CardTitle>
              <CardDescription className="text-[10px]">正在推进的节点</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-2 text-lg font-semibold leading-none">{summary.counts.running}</CardContent>
          </Card>
          <Card size="sm" className="border-muted/60 bg-background/80 shadow-none">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-[11px]">已完成</CardTitle>
              <CardDescription className="text-[10px]">已经汇报结果的节点</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-2 text-lg font-semibold leading-none">{summary.counts.completed}</CardContent>
          </Card>
          <Card size="sm" className="border-muted/60 bg-background/80 shadow-none">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-[11px]">阻塞</CardTitle>
              <CardDescription className="text-[10px]">根阻塞 {summary.blockedRoots} 个</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-2 text-lg font-semibold leading-none text-rose-600 dark:text-rose-400">
              {summary.blockedNodes}
            </CardContent>
          </Card>
        </div>

        {blockingSummary.blockingChains.length > 0 && (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50/60 px-2 py-2 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" />
              当前阻塞链
              <span className="font-mono text-[10px] opacity-80">[{blockingSummary.blockedRoots} 个根阻塞]</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {blockingSummary.blockingChains.slice(0, 3).map((chain) => (
                <button
                  key={chain.leafId}
                  type="button"
                  onClick={() => handleSelectNode(chain.leafId)}
                  className="inline-flex max-w-full items-center rounded-full border border-rose-200/80 bg-background/80 px-2 py-1 text-left text-[10px] leading-4 text-rose-800 transition hover:bg-background dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <span className="truncate">{chain.text}</span>
                </button>
              ))}
            </div>
            {blockingSummary.rootLabels.length > 0 && (
              <div className="mt-1 text-[10px] opacity-80">根节点：{blockingSummary.rootLabels.slice(0, 3).join(' · ')}</div>
            )}
            {blockingSummary.blockedLeafLabels.length > 0 && (
              <div className="mt-1 text-[10px] opacity-80">叶阻塞：{blockingSummary.blockedLeafLabels.slice(0, 3).join(' · ')}</div>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock3 className="size-3" />
          最近同步 {latestSyncLabel}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-2">
            {loading && subAgents.length === 0 ? (
              <EmptyState
                title="正在加载子 agent"
                description="第一次拉取当前会话的 DAG 树，请稍等一下。"
              />
            ) : visibleTree.length === 0 ? (
              <EmptyState
                title={blockedOnly ? '暂无阻塞节点' : '还没有子 agent'}
                description={
                  blockedOnly
                    ? '当前会话里没有处于阻塞状态的节点。'
                    : '当 Orchestrator 或群聊成员生成子 agent 后，它们会显示在这里。'
                }
              />
            ) : (
              visibleTree.map((node, index) => (
                <TreeNodeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  isLast={index === visibleTree.length - 1}
                  collapsedById={collapsedById}
                  selectedId={selectedNode?.id ?? null}
                  traceSet={traceSet}
                  onSelect={handleSelectNode}
                  onToggleCollapse={handleToggleCollapse}
                />
              ))
            )}
          </div>
        </ScrollArea>

        <ScrollArea className="hidden min-h-0 rounded-md border bg-muted/10 lg:block">
          <div className="space-y-3 p-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Search className="size-3.5" />
                追踪详情
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">从根节点到当前聚焦节点的完整链路</div>
            </div>

            {selectedPath.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-2 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">当前链路</span>
                  <span className="font-mono opacity-80">{selectedPath.length} 层</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedPath.map((pathNode, index) => (
                    <button
                      key={pathNode.id}
                      type="button"
                      onClick={() => handleSelectNode(pathNode.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition hover:bg-background',
                        index === selectedPath.length - 1
                          ? 'border-amber-400/60 bg-amber-100/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                          : 'border-amber-200/60 bg-background/80 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200',
                      )}
                    >
                      <span className="max-w-[9rem] truncate">{pathNode.name}</span>
                      <span className="font-mono">{STATUS_LABELS[pathNode.status]}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-md border border-amber-200/40 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground dark:border-amber-900/30 dark:bg-amber-950/20">
                  {formatChainText(selectedPath)}
                </div>
              </div>
            )}

            {selectedNode ? (
              <Card className="border-border/80 bg-background/95 shadow-sm">
                <CardHeader className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-sm">{selectedNode.name}</CardTitle>
                      <CardDescription className="text-[10px]">
                        {selectedNode.lastTask ?? '当前节点没有单独任务说明'}
                      </CardDescription>
                    </div>
                    <Badge variant={statusVariant(selectedNode.status)} className="h-5 px-1.5 text-[10px]">
                      {STATUS_LABELS[selectedNode.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-3 pb-3 text-xs">
                  <div className="rounded-md border bg-muted/20 px-2 py-1.5">
                    <DetailRow label="父 Agent" value={<span className="font-mono">{selectedNode.parentAgentId}</span>} />
                    <DetailRow
                      label="父 Run"
                      value={<span className="font-mono">{selectedNode.parentRunId ?? '—'}</span>}
                    />
                    <DetailRow
                      label="父子节点"
                      value={<span className="font-mono">{selectedNode.parentSubAgentId ?? '—'}</span>}
                    />
                    <DetailRow label="创建时间" value={<span className="font-mono">{formatTime(selectedNode.createdAt)}</span>} />
                    <DetailRow
                      label="更新时间"
                      value={<span className="font-mono">{formatTime(selectedNode.updatedAt ?? selectedNode.createdAt)}</span>}
                    />
                    <DetailRow
                      label="活跃 Run"
                      value={<span className="font-mono">{selectedNode.activeRunId ?? '—'}</span>}
                    />
                    <DetailRow label="子节点" value={<span className="font-mono">{selectedNode.children.length}</span>} />
                    <DetailRow
                      label="下游阻塞"
                      value={<span className="font-mono">{selectedNode.blockedDescendantCount}</span>}
                    />
                  </div>

                  {selectedNode.blockReason && (
                    <div className="rounded-md border border-rose-500/20 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                      <div className="font-medium">阻塞来源</div>
                      <div className="mt-0.5 whitespace-pre-wrap">{selectedNode.blockReason}</div>
                    </div>
                  )}

                  {selectedNode.lastPrompt && (
                    <div className="rounded-md border bg-background/80 px-2 py-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground">最近输入</div>
                      <div className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-foreground">
                        {selectedNode.lastPrompt}
                      </div>
                    </div>
                  )}

                  {(selectedNode.queuedInputs?.length ?? 0) > 0 && (
                    <div className="rounded-md border bg-background/80 px-2 py-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground">待处理输入</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(selectedNode.queuedInputs ?? []).slice(0, 4).map((input, index) => (
                          <span
                            key={'queued-' + selectedNode.id + '-' + index}
                            className="inline-flex max-w-full rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <span className="truncate">{input}</span>
                          </span>
                        ))}
                        {(selectedNode.queuedInputs?.length ?? 0) > 4 && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            +{(selectedNode.queuedInputs?.length ?? 0) - 4}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedNode.result && (
                    <div className="rounded-md border border-emerald-200/60 bg-emerald-50/50 px-2 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-200">
                      <div className="font-medium">结果</div>
                      <div className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap leading-5">{selectedNode.result}</div>
                    </div>
                  )}

                  {selectedNode.error && (
                    <div className="rounded-md border border-rose-500/20 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                      <div className="font-medium">错误</div>
                      <div className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap leading-5">{selectedNode.error}</div>
                    </div>
                  )}

                  {selectedNode.toolNames && selectedNode.toolNames.length > 0 && (
                    <div className="rounded-md border bg-background/80 px-2 py-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground">工具</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {selectedNode.toolNames.slice(0, 5).map((toolName) => (
                          <Badge key={toolName} variant="outline" className="h-5 px-1.5 text-[10px]">
                            {toolName}
                          </Badge>
                        ))}
                        {selectedNode.toolNames.length > 5 && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            +{selectedNode.toolNames.length - 5}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                title="还没有可追踪的子 agent"
                description="当前会话还没有子 agent 记录，或者正在等待第一次同步。"
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 py-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[70%] text-right text-foreground">{value}</span>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <UserRoundCog className="size-5" />
      </div>
      <div className="space-y-1">
        <div className="font-medium text-foreground">{title}</div>
        <div className="leading-5 text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function TreeNodeRow({
  node,
  depth,
  isLast,
  collapsedById,
  selectedId,
  traceSet,
  onSelect,
  onToggleCollapse,
}: {
  node: AnnotatedNode
  depth: number
  isLast: boolean
  collapsedById: Record<string, boolean>
  selectedId: string | null
  traceSet: Set<string>
  onSelect: (nodeId: string) => void
  onToggleCollapse: (nodeId: string) => void
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsedById[node.id] ?? false
  const isSelected = selectedId === node.id
  const onPath = traceSet.has(node.id)

  return (
    <div className={cn('relative', depth > 0 && 'pl-5')}>
      {depth > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute left-[11px] top-0 w-px bg-border/60',
            node.blocked && 'bg-rose-500/45',
            onPath && 'bg-amber-500/70',
          )}
          style={{ bottom: isLast ? '1.25rem' : 0 }}
        />
      )}
      {depth > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute left-[11px] top-4 h-px w-3 border-t border-dashed',
            node.blocked ? 'border-rose-500/45' : 'border-border/60',
            onPath && 'border-amber-500/70',
          )}
        />
      )}

      <div className="relative">
        <div className="flex items-start gap-2">
          {hasChildren ? (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onToggleCollapse(node.id)}
              className={cn(
                'shrink-0',
                node.blocked ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30' : 'text-muted-foreground',
              )}
              title={isCollapsed ? '展开子树' : '收起子树'}
            >
              {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          ) : (
            <div className="size-6 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={cn(
              'min-w-0 flex-1 rounded-xl border px-3 py-2 text-left transition',
              isSelected && 'border-primary/60 bg-primary/5 shadow-md shadow-primary/10 ring-2 ring-primary/40',
              onPath && !isSelected && 'ring-2 ring-amber-400/40',
              node.blocked && 'border-rose-400/50 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20',
              !isSelected && !node.blocked && 'border-border bg-card',
              !isSelected && node.status === 'running' && 'border-amber-300/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium">{node.name}</span>
              <Badge variant={statusVariant(node.status)} className="h-5 px-1.5 text-[10px]">
                {STATUS_LABELS[node.status]}
              </Badge>
              {isSelected && <Badge className="h-5 px-1.5 text-[10px]">当前</Badge>}
              {onPath && !isSelected && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  链路
                </Badge>
              )}
              {node.blocked && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  阻塞
                </Badge>
              )}
              {node.blockedDescendantCount > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  下游 {node.blockedDescendantCount}
                </Badge>
              )}
              {(node.queuedInputs?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  待处理 {node.queuedInputs?.length ?? 0}
                </Badge>
              )}
            </div>

            <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {node.lastTask ?? node.lastPrompt ?? node.result ?? '暂无任务说明'}
            </div>

            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className="font-mono">run {node.activeRunId ?? node.id}</span>
              {node.parentSubAgentId && <span className="font-mono">parent {node.parentSubAgentId}</span>}
              {node.parentRunId && <span className="font-mono">run-parent {node.parentRunId}</span>}
              <span>{formatTime(node.updatedAt ?? node.createdAt)}</span>
            </div>

            {node.toolNames && node.toolNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {node.toolNames.slice(0, 4).map((toolName) => (
                  <Badge key={toolName} variant="outline" className="h-5 px-1.5 text-[10px]">
                    {toolName}
                  </Badge>
                ))}
                {node.toolNames.length > 4 && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    +{node.toolNames.length - 4}
                  </Badge>
                )}
              </div>
            )}

            {node.blocked && node.blockReason && (
              <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                <div className="font-medium">阻塞来源</div>
                <div className="mt-0.5 whitespace-pre-wrap">{node.blockReason}</div>
              </div>
            )}
          </button>
        </div>
      </div>

      {hasChildren && !isCollapsed && (
        <div className={cn('mt-2 space-y-2 border-l border-dashed pl-3', node.blocked ? 'border-rose-500/40' : 'border-border/60')}>
          {node.children.map((child, index) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={index === node.children.length - 1}
              collapsedById={collapsedById}
              selectedId={selectedId}
              traceSet={traceSet}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function summarizeNodes(nodes: AnnotatedNode[]): {
  total: number
  counts: Record<SubAgentHandle['status'], number>
  blockedNodes: number
  blockedRoots: number
  latestUpdatedAt: number
} {
  const counts: Record<SubAgentHandle['status'], number> = {
    running: 0,
    completed: 0,
    closed: 0,
    error: 0,
  }
  let blockedNodes = 0
  let blockedRoots = 0
  let latestUpdatedAt = 0

  const flatNodes = flattenTree(nodes)
  for (const node of flatNodes) {
    counts[node.status] += 1
    if (node.blocked) blockedNodes += 1
    if (node.blocked && !node.parentSubAgentId) blockedRoots += 1
    latestUpdatedAt = Math.max(latestUpdatedAt, node.updatedAt ?? node.createdAt)
  }

  return {
    total: flatNodes.length,
    counts,
    blockedNodes,
    blockedRoots,
    latestUpdatedAt,
  }
}

function summarizeBlockingChains(
  nodes: AnnotatedNode[],
  nodeIndex: Map<string, AnnotatedNode>,
): BlockingSummary {
  const rootLabels = new Set<string>()
  const blockedLeafLabels = new Set<string>()
  const blockingChains: BlockingChainView[] = []
  const seenChains = new Set<string>()

  for (const node of flattenTree(nodes)) {
    if (node.blocked && !node.parentSubAgentId) {
      rootLabels.add(node.name)
    }

    const blockedChildren = node.children.filter((child) => child.blocked)
    if (!node.blocked || blockedChildren.length > 0) continue

    blockedLeafLabels.add(node.name)
    const chain = collectPath(node.id, nodeIndex)
    const text = formatChainText(chain)
    if (!seenChains.has(text)) {
      seenChains.add(text)
      blockingChains.push({ leafId: node.id, text })
    }
  }

  return {
    blockedRoots: rootLabels.size,
    blockingChains,
    blockedLeafLabels: Array.from(blockedLeafLabels),
    rootLabels: Array.from(rootLabels),
  }
}

function buildTree(items: SubAgentHandle[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const item of items) {
    byId.set(item.id, { ...item, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentSubAgentId && byId.has(node.parentSubAgentId)) {
      byId.get(node.parentSubAgentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return sortTree(roots)
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((left, right) => {
    const statusRank = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    if (statusRank !== 0) return statusRank
    const leftUpdated = left.updatedAt ?? left.createdAt
    const rightUpdated = right.updatedAt ?? right.createdAt
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated
    return left.name.localeCompare(right.name, 'zh-CN')
  })

  for (const node of nodes) {
    sortTree(node.children)
  }

  return nodes
}

function annotateTree(nodes: TreeNode[]): AnnotatedNode[] {
  return nodes.map((node) => {
    const children = annotateTree(node.children)
    const blockedDescendantCount = children.reduce(
      (count, child) => count + child.blockedDescendantCount + (child.blocked ? 1 : 0),
      0,
    )
    const blocked = node.status === 'error' || blockedDescendantCount > 0
    const blockReason =
      node.status === 'error'
        ? node.error ?? '当前节点出错'
        : blockedDescendantCount > 0
          ? '下游任务处于阻塞状态'
          : null

    return {
      ...node,
      children,
      blocked,
      blockReason,
      blockedDescendantCount,
    }
  })
}

function flattenTree(nodes: AnnotatedNode[]): AnnotatedNode[] {
  const flat: AnnotatedNode[] = []
  const visit = (list: AnnotatedNode[]) => {
    for (const node of list) {
      flat.push(node)
      visit(node.children)
    }
  }
  visit(nodes)
  return flat
}

function buildNodeIndex(nodes: AnnotatedNode[]): Map<string, AnnotatedNode> {
  const index = new Map<string, AnnotatedNode>()
  for (const node of flattenTree(nodes)) {
    index.set(node.id, node)
  }
  return index
}

function collectPath(targetId: string, nodeIndex: Map<string, AnnotatedNode>): AnnotatedNode[] {
  const path: AnnotatedNode[] = []
  const visited = new Set<string>()
  let current = nodeIndex.get(targetId) ?? null

  while (current && !visited.has(current.id)) {
    path.unshift(current)
    visited.add(current.id)
    if (!current.parentSubAgentId) break
    current = nodeIndex.get(current.parentSubAgentId) ?? null
  }

  return path
}

function pruneTree(nodes: AnnotatedNode[], predicate: (node: AnnotatedNode) => boolean): AnnotatedNode[] {
  return nodes
    .map((node) => ({ ...node, children: pruneTree(node.children, predicate) }))
    .filter((node) => predicate(node) || node.children.length > 0)
}

function pickPreferredNode(nodes: AnnotatedNode[]): AnnotatedNode | null {
  const flat = flattenTree(nodes)
  if (flat.length === 0) return null

  return [...flat].sort((left, right) => {
    const statusRank = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    if (statusRank !== 0) return statusRank
    if (left.blocked !== right.blocked) return left.blocked ? -1 : 1
    return (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt)
  })[0]
}

function formatChainText(path: AnnotatedNode[]): string {
  return path.map((node) => node.name).join(' → ')
}

function statusVariant(status: SubAgentHandle['status']): 'default' | 'outline' | 'destructive' {
  if (status === 'error') return 'destructive'
  if (status === 'running') return 'default'
  return 'outline'
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
