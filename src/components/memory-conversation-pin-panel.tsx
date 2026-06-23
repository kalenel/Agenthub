'use client'

import { useCallback, useMemo, useState } from 'react'
import { Pin, PinOff } from 'lucide-react'

import { AgentAvatar } from '@/components/agent-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { extractMessageSummary } from '@/components/quoted-message'
import type { AgentRow, MessageRow } from '@/db/schema'
import { toggleMessagePin } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore, useMessagesForConversation, usePinnedMessagesForConversation } from '@/stores/app-store'

const MEMORY_PIN_RECENT_LIMIT = 6

export function MemoryConversationPinPanel({ conversationId }: { conversationId: string }) {
  const messages = useMessagesForConversation(conversationId)
  const pinnedMessages = usePinnedMessagesForConversation(conversationId)
  const agents = useAppStore((s) => s.agents)
  const highlightMessage = useAppStore((s) => s.highlightMessage)

  const recentMessages = useMemo(() => {
    const pinnedIds = new Set(pinnedMessages.map((message) => message.id))
    return messages
      .filter((message) => message.role !== 'system')
      .slice(-MEMORY_PIN_RECENT_LIMIT)
      .reverse()
      .filter((message) => !pinnedIds.has(message.id))
  }, [messages, pinnedMessages])

  const handleJump = useCallback(
    (messageId: string) => {
      const el = document.getElementById('message-' + messageId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightMessage(messageId)
    },
    [highlightMessage],
  )

  const handleTogglePin = useCallback(
    async (messageId: string) => {
      try {
        const result = await toggleMessagePin(messageId, conversationId)
        useAppStore.getState().setPinnedMessageIds(conversationId, result.pinnedMessageIds)
      } catch (error) {
        console.error('[MemoryConversationPinPanel] toggle pin failed', error)
      }
    },
    [conversationId],
  )

  if (!conversationId) return null

  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">会话 pin</div>
        </div>
        <Badge variant="outline">{pinnedMessages.length}</Badge>
      </div>
      {pinnedMessages.length > 0 ? (
        <div className="space-y-2">
          {pinnedMessages.map((message) => (
            <MemoryPinRow
              key={message.id}
              message={message}
              isPinned
              agents={agents}
              onJump={handleJump}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-background/60 px-3 py-4 text-center text-xs text-muted-foreground">
          暂无已 pin 消息
        </div>
      )}

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-foreground">最近可 pin</div>
          <span className="text-[11px] text-muted-foreground">{recentMessages.length}</span>
        </div>
        {recentMessages.length > 0 ? (
          <div className="space-y-2">
            {recentMessages.map((message) => (
              <MemoryPinRow
                key={message.id}
                message={message}
                isPinned={false}
                agents={agents}
                onJump={handleJump}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-background/60 px-3 py-4 text-center text-xs text-muted-foreground">
            最近没有可 pin 消息
          </div>
        )}
      </div>
    </section>
  )
}

function MemoryPinRow({
  message,
  isPinned,
  agents,
  onJump,
  onTogglePin,
}: {
  message: MessageRow
  isPinned: boolean
  agents: Record<string, AgentRow>
  onJump: (messageId: string) => void
  onTogglePin: (messageId: string) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const agent = message.agentId ? agents[message.agentId] ?? null : null
  const speakerName = message.role === 'user' ? '用户' : agent?.name ?? 'Unknown'
  const summary = extractMessageSummary(message.parts)

  return (
    <div className="group flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs transition hover:bg-muted/30">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => onJump(message.id)}
        title="跳到消息"
      >
        <Pin className={cn('size-3 shrink-0 text-primary', isPinned && 'fill-primary')} />
        {agent ? (
          <AgentAvatar agent={agent} size="xs" />
        ) : (
          <div className="size-4 shrink-0 rounded-full bg-primary/20" />
        )}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{speakerName}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground/90">{summary}</span>
      </button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="shrink-0 opacity-0 transition group-hover:opacity-100"
        title={isPinned ? '取消 pin' : 'Pin 此消息'}
        aria-label={isPinned ? '取消 pin' : 'Pin 此消息'}
        disabled={busy}
        onClick={async (event) => {
          event.stopPropagation()
          if (busy) return
          setBusy(true)
          try {
            await onTogglePin(message.id)
          } finally {
            setBusy(false)
          }
        }}
      >
        {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
      </Button>
    </div>
  )
}
