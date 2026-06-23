import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRow } from '@/db/schema'

import { MemoryArchiveActions } from './memory-archive-actions'
import { MemoryConversationPinPanel } from './memory-conversation-pin-panel'
import { MemoryHighlightsPanel } from './memory-highlights'
import type { MemoryPackHighlights } from '@/lib/memory-api'

type MockConversation = {
  pinnedMessageIds?: string[]
}

type MockAgent = {
  id: string
  name: string
}

type MockState = {
  conversations: Record<string, MockConversation>
  agents: Record<string, MockAgent>
  messages: Record<string, MessageRow>
  messageIdsByConv: Record<string, string[]>
  highlightedMessageId: string | null
  highlightMessage: (messageId: string) => void
  setPinnedMessageIds: (conversationId: string, ids: string[]) => void
}

const mockStore = vi.hoisted(() => {
  const state: MockState = {
    conversations: {},
    agents: {},
    messages: {},
    messageIdsByConv: {},
    highlightedMessageId: null,
    highlightMessage: (messageId: string) => {
      state.highlightedMessageId = messageId
    },
    setPinnedMessageIds: (conversationId: string, ids: string[]) => {
      state.conversations[conversationId] ??= {}
      state.conversations[conversationId].pinnedMessageIds = ids
    },
  }

  const useAppStore = ((selector?: (s: MockState) => unknown) =>
    (selector ? selector(state) : state)) as any

  useAppStore.getState = () => state
  useAppStore.setState = (partial: Partial<MockState> | ((s: MockState) => void)) => {
    if (typeof partial === 'function') {
      partial(state)
      return
    }
    Object.assign(state, partial)
  }

  const getMessages = (conversationId: string) => {
    const ids = state.messageIdsByConv[conversationId] ?? []
    return ids.map((id) => state.messages[id]).filter((message): message is MessageRow => Boolean(message))
  }

  const getPinnedMessages = (conversationId: string) => {
    const ids = state.conversations[conversationId]?.pinnedMessageIds ?? []
    return ids.map((id) => state.messages[id]).filter((message): message is MessageRow => Boolean(message))
  }

  return {
    reset() {
      state.conversations = {}
      state.agents = {}
      state.messages = {}
      state.messageIdsByConv = {}
      state.highlightedMessageId = null
    },
    useAppStore,
    useMessagesForConversation: getMessages,
    usePinnedMessagesForConversation: getPinnedMessages,
  }
})

vi.mock('@/stores/app-store', () => ({
  useAppStore: mockStore.useAppStore,
  useMessagesForConversation: mockStore.useMessagesForConversation,
  usePinnedMessagesForConversation: mockStore.usePinnedMessagesForConversation,
}))

function makeMessage(
  id: string,
  role: MessageRow['role'],
  content: string,
  createdAt: number,
  agentId: string | null = null,
): MessageRow {
  return {
    id,
    conversationId: 'conv_1',
    role,
    agentId,
    parts: [{ type: 'text', content }],
    status: 'complete',
    parentMessageId: null,
    mentionedAgentIds: [],
    runId: null,
    usage: null,
    createdAt,
  } as MessageRow
}

describe('memory ui', () => {
  beforeEach(() => {
    mockStore.reset()
  })

  it('renders evidence pack summary with checkpoints, blockers, transitions, and refs', () => {
    const highlights = {
      latestCheckpoint: {
        id: 'progress_latest',
        itemId: 'item_1',
        episodeId: 'episode_2',
        checkpointId: 'checkpoint_2',
        latestCheckpoint: 'checkpoint_2',
        previousCheckpointId: 'checkpoint_1',
        summary: 'checkpoint v2',
        status: 'blocked',
        blockedReason: 'waiting for upstream api',
        nextAction: 'retry later',
        evidenceRef: 'ev_latest',
        updatedAt: 1710000000000,
      },
      blockers: [
        {
          id: 'progress_blocker',
          itemId: 'item_1',
          episodeId: 'episode_1',
          checkpointId: 'checkpoint_1',
          latestCheckpoint: 'checkpoint_1',
          previousCheckpointId: null,
          summary: 'blocked on upstream api',
          status: 'blocked',
          blockedReason: 'waiting for upstream api',
          nextAction: 'retry later',
          evidenceRef: 'ev_blocker',
          updatedAt: 1710000000100,
        },
      ],
      keyTransitions: [
        {
          id: 'transition_1',
          transitionId: 'transition_1',
          fromState: 'draft',
          toState: 'review',
          reason: 'review needed',
          trigger: 'save',
          scopeImpact: 'project',
          recoveryTarget: 'draft',
          timestamp: 1710000000200,
        },
      ],
      evidenceRefs: ['ev_latest', 'ev_shared', 'ev_blocker'],
    } satisfies MemoryPackHighlights

    const html = renderToStaticMarkup(createElement(MemoryHighlightsPanel, { highlights, loading: false }))

    expect(html).toContain('Evidence Pack')
    expect(html).toContain('latest checkpoint / blockers / transitions / refs')
    expect(html).toContain('3 refs')
    expect(html).toContain('checkpoint v2')
    expect(html).toContain('Blockers')
    expect(html).toContain('Key transitions')
    expect(html).toContain('Evidence refs')
    expect(html).toContain('ev_shared')
  })

  it('renders archive actions with export and import controls', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryArchiveActions, {
        conversationId: 'conv_1',
        mode: 'chat',
        recipient: 'ui',
        limit: 12,
        maxTokens: 320,
        onImported: async () => undefined,
      }),
    )

    expect(html).toContain('datetime-local')
    expect(html).toContain('清空导出范围')
    expect(html).toContain('aria-label="Export memory pack"')
    expect(html).toContain('aria-label="Import memory pack"')
    expect(html).toContain('title="Export"')
    expect(html).toContain('title="Import"')
  })

  it('renders conversation pin controls for pinned and recent messages', () => {
    mockStore.useAppStore.setState({
      conversations: {
        conv_1: { pinnedMessageIds: ['msg_pinned'] },
      },
      agents: {
        ag_writer: { id: 'ag_writer', name: 'Writer' },
      },
      messages: {
        msg_pinned: makeMessage('msg_pinned', 'user', 'remember this', 1),
        msg_recent: makeMessage('msg_recent', 'agent', 'pin me', 2, 'ag_writer'),
        msg_system: makeMessage('msg_system', 'system', 'ignore me', 3),
      },
      messageIdsByConv: { conv_1: ['msg_pinned', 'msg_recent', 'msg_system'] },
    })

    const html = renderToStaticMarkup(createElement(MemoryConversationPinPanel, { conversationId: 'conv_1' }))

    expect(html).toContain('会话 pin')
    expect(html).toContain('remember this')
    expect(html).toContain('pin me')
    expect(html).toContain('取消 pin')
    expect(html).toContain('Pin 此消息')
    expect(html).toContain('最近可 pin')
  })
})
