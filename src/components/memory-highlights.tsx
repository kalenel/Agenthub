'use client'

import { AlertTriangle, ArrowRight, Link2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { MemoryPackCheckpointHighlight, MemoryPackHighlights, MemoryPackTransitionHighlight } from '@/lib/memory-api'

function formatTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' {
  switch (status) {
    case 'blocked':
      return 'destructive'
    case 'done':
      return 'secondary'
    case 'waiting':
      return 'outline'
    case 'abandoned':
      return 'ghost'
    default:
      return 'default'
  }
}

function trimText(value: string, limit = 160): string {
  const text = value.trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text
}

function renderCheckpointSummary(checkpoint: MemoryPackCheckpointHighlight): string {
  const parts = [checkpoint.summary.trim()]
  if (checkpoint.blockedReason) parts.push(`阻塞: ${checkpoint.blockedReason}`)
  if (checkpoint.nextAction) parts.push(`下一步: ${checkpoint.nextAction}`)
  return parts.join(' | ')
}

export function MemoryHighlightsPanel({
  highlights,
  loading,
}: {
  highlights: MemoryPackHighlights | null
  loading: boolean
}) {
  return (
    <section className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Evidence Pack</div>
          <div className="text-xs text-muted-foreground">latest checkpoint / blockers / transitions / refs</div>
        </div>
        {highlights ? <Badge variant="outline">{highlights.evidenceRefs.length} refs</Badge> : null}
      </div>

      {!highlights ? (
        <div className="mt-3 text-xs text-muted-foreground">
          {loading ? '加载 evidence pack 中...' : '暂无最新 checkpoint / transition。'}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {highlights.latestCheckpoint ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(highlights.latestCheckpoint.status)}>
                    {highlights.latestCheckpoint.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(highlights.latestCheckpoint.updatedAt)}
                  </span>
                </div>
                {highlights.latestCheckpoint.latestCheckpoint &&
                highlights.latestCheckpoint.latestCheckpoint !== highlights.latestCheckpoint.checkpointId ? (
                  <span className="text-[11px] text-muted-foreground">
                    {highlights.latestCheckpoint.latestCheckpoint}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-5 text-foreground">
                {renderCheckpointSummary(highlights.latestCheckpoint)}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                {highlights.latestCheckpoint.itemId ? <span>item {highlights.latestCheckpoint.itemId}</span> : null}
                {highlights.latestCheckpoint.episodeId ? <span>episode {highlights.latestCheckpoint.episodeId}</span> : null}
                {highlights.latestCheckpoint.evidenceRef ? <span>ref {highlights.latestCheckpoint.evidenceRef}</span> : null}
              </div>
            </div>
          ) : null}

          {highlights.blockers.length > 0 ? (
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="size-3.5" />
                Blockers
              </div>
              <div className="space-y-2">
                {highlights.blockers.map((blocker) => (
                  <div key={blocker.id} className="rounded-lg border bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={statusVariant(blocker.status)}>{blocker.status}</Badge>
                      <span className="text-[11px] text-muted-foreground">{formatTime(blocker.updatedAt)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-foreground">{trimText(blocker.summary, 180)}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {blocker.blockedReason ? <span>原因 {trimText(blocker.blockedReason, 120)}</span> : null}
                      {blocker.nextAction ? <span>下一步 {trimText(blocker.nextAction, 120)}</span> : null}
                      {blocker.evidenceRef ? <span>证据 {blocker.evidenceRef}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {highlights.keyTransitions.length > 0 ? (
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ArrowRight className="size-3.5" />
                Key transitions
              </div>
              <div className="space-y-2">
                {highlights.keyTransitions.map((transition) => (
                  <TransitionRow key={transition.id} transition={transition} />
                ))}
              </div>
            </div>
          ) : null}

          {highlights.evidenceRefs.length > 0 ? (
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Link2 className="size-3.5" />
                Evidence refs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {highlights.evidenceRefs.slice(0, 12).map((ref) => (
                  <Badge key={ref} variant="outline" className="max-w-full truncate">
                    {ref}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function TransitionRow({ transition }: { transition: MemoryPackTransitionHighlight }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {transition.fromState ?? 'unknown'} → {transition.toState ?? 'unknown'}
          </Badge>
          {transition.transitionId ? <span className="text-[11px] text-muted-foreground">{transition.transitionId}</span> : null}
        </div>
        <span className="text-[11px] text-muted-foreground">{formatTime(transition.timestamp)}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-foreground">{trimText(transition.reason, 160)}</p>
      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {transition.scopeImpact ? <span>影响 {trimText(transition.scopeImpact, 100)}</span> : null}
        {transition.recoveryTarget ? <span>恢复 {trimText(transition.recoveryTarget, 100)}</span> : null}
        {transition.trigger ? <span>触发 {transition.trigger}</span> : null}
      </div>
    </div>
  )
}
