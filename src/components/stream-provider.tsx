'use client'

import { useEffect, useRef } from 'react'

import type { StreamEvent } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'

/**
 * StreamProvider — 全局唯一 SSE 连接。
 *
 * 用 requestAnimationFrame 批量处理所有事件：
 * 每帧攒一波一次性 apply，最多 60fps 状态更新，
 * 多 Agent 同时输出也不会造成渲染风暴。
 */

let activeSource: EventSource | null = null
let refCount = 0

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const applyEvent = useAppStore((s) => s.applyEvent)
  const setStreamConnected = useAppStore((s) => s.setStreamConnected)
  const batchRef = useRef<StreamEvent[]>([])
  const rafRef = useRef<number | null>(null)

  const flushBatch = () => {
    rafRef.current = null
    const events = batchRef.current
    batchRef.current = []
    if (events.length === 0) return
    for (const ev of events) {
      applyEvent(ev)
    }
  }

  useEffect(() => {
    refCount++

    if (!activeSource) {
      activeSource = new EventSource('/api/stream')

      activeSource.onopen = () => setStreamConnected(true)

      activeSource.onerror = () => setStreamConnected(false)

      activeSource.onmessage = (e) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(e.data)
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return

        const obj = parsed as { type?: string }
        if (obj.type === 'connected') {
          setStreamConnected(true)
          return
        }

        // 攒入帧级批次
        batchRef.current.push(parsed as StreamEvent)
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushBatch)
        }
      }
    }

    return () => {
      refCount--
      if (refCount <= 0) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          flushBatch()
        }
        activeSource?.close()
        activeSource = null
        refCount = 0
        setStreamConnected(false)
      }
    }
  }, [applyEvent, setStreamConnected])

  return <>{children}</>
}
