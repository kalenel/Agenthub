import { eventBus } from './event-bus'

import type { SubAgentHandle } from '@/shared/types'

/**
 * Sub-Agent Manager — tracks spawned sub-agents for multi-agent collaboration.
 * Supports: close, resume, send_input, wait operations.
 */

const subAgents = new Map<string, SubAgentHandle>()
const subAgentChildren = new Map<string, Set<string>>()
const subAgentControllers = new Map<string, AbortController>()
const subAgentRuntimes = new Map<string, SubAgentRuntime>()

let idCounter = 0
let runCounter = 0

function nextId(): string {
  idCounter += 1
  return `sub_${idCounter}_${Date.now().toString(36)}`
}

function nextRunId(): string {
  runCounter += 1
  return `run_${runCounter}_${Date.now().toString(36)}`
}

function publishCreated(handle: SubAgentHandle): void {
  eventBus.publish({
    type: 'sub_agent.created',
    conversationId: handle.parentConvId,
    timestamp: handle.createdAt,
    subAgent: handle,
  })
}

function publishUpdated(handle: SubAgentHandle): void {
  eventBus.publish({
    type: 'sub_agent.updated',
    conversationId: handle.parentConvId,
    timestamp: Date.now(),
    subAgent: handle,
  })
}

function publishRemoved(conversationId: string, subAgentId: string): void {
  eventBus.publish({
    type: 'sub_agent.removed',
    conversationId,
    timestamp: Date.now(),
    subAgentId,
  })
}

function abortController(id: string): void {
  const controller = subAgentControllers.get(id)
  if (!controller) return
  if (!controller.signal.aborted) controller.abort()
}

function isClosedSubAgentStatus(status: SubAgentHandle['status']): boolean {
  return status === 'closed'
}

function ensureQueuedInputs(handle: SubAgentHandle): string[] {
  handle.queuedInputs ??= []
  return handle.queuedInputs
}

function isSettled(handle: SubAgentHandle): boolean {
  return isClosedSubAgentStatus(handle.status) || ((handle.queuedInputs?.length ?? 0) === 0 && handle.status !== 'running')
}

function syncIdleState(handle: SubAgentHandle): void {
  if (isClosedSubAgentStatus(handle.status)) return
  if ((handle.queuedInputs?.length ?? 0) === 0 && handle.status === 'running') {
    handle.status = 'completed'
  }
  if (!isClosedSubAgentStatus(handle.status)) {
    handle.updatedAt = Date.now()
    publishUpdated(handle)
  }
}

async function kickRuntime(id: string): Promise<void> {
  const runtime = subAgentRuntimes.get(id)
  const handle = subAgents.get(id)
  if (!runtime || !handle || isClosedSubAgentStatus(handle.status)) return
  if (runtime.running) return
  if (runtime.parentSignal?.aborted) {
    closeSubAgent(id)
    return
  }

  const nextInput = handle.queuedInputs?.shift()
  if (!nextInput) {
    syncIdleState(handle)
    return
  }

  runtime.running = true
  handle.status = 'running'
  handle.lastTask = nextInput
  handle.lastPrompt = nextInput
  handle.activeRunId = nextRunId()
  handle.error = undefined
  handle.updatedAt = Date.now()
  publishUpdated(handle)

  const controller = new AbortController()
  runtime.controller = controller
  attachSubAgentController(id, controller)

  const onParentAbort = () => controller.abort()
  if (runtime.parentSignal) {
    if (runtime.parentSignal.aborted) {
      controller.abort()
    } else {
      runtime.parentSignal.addEventListener('abort', onParentAbort, { once: true })
    }
  }

  try {
    const result = await runtime.runTurn(nextInput, handle.activeRunId, controller.signal)
    if (!isClosedSubAgentStatus(handle.status)) {
      handle.result = result
      handle.error = undefined
      handle.status = (handle.queuedInputs?.length ?? 0) > 0 ? 'running' : 'completed'
      handle.updatedAt = Date.now()
      publishUpdated(handle)
    }
  } catch (err) {
    if (!isClosedSubAgentStatus(handle.status)) {
      handle.status = 'error'
      handle.error = err instanceof Error ? err.message : String(err)
      handle.updatedAt = Date.now()
      publishUpdated(handle)
    }
  } finally {
    runtime.running = false
    runtime.controller = null
    detachSubAgentController(id)
    if (runtime.parentSignal) {
      runtime.parentSignal.removeEventListener('abort', onParentAbort)
    }
    handle.activeRunId = undefined
    if (!isClosedSubAgentStatus(handle.status) && (handle.queuedInputs?.length ?? 0) > 0) {
      void kickRuntime(id)
    } else if (!isClosedSubAgentStatus(handle.status)) {
      syncIdleState(handle)
    }
  }
}

export function registerSubAgentRuntime(id: string, runtime: SubAgentRuntime): void {
  subAgentRuntimes.set(id, runtime)
  void kickRuntime(id)
}

export function unregisterSubAgentRuntime(id: string): void {
  subAgentRuntimes.delete(id)
}

export function attachSubAgentController(id: string, controller: AbortController): void {
  subAgentControllers.set(id, controller)
}

export function detachSubAgentController(id: string): void {
  subAgentControllers.delete(id)
}

export function createSubAgent(opts: {
  name: string
  parentAgentId: string
  parentConvId: string
  task: string
  toolNames: string[]
  parentSubAgentId?: string
  parentRunId?: string
}): SubAgentHandle {
  const handle: SubAgentHandle = {
    id: nextId(),
    name: opts.name,
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentAgentId: opts.parentAgentId,
    parentConvId: opts.parentConvId,
    parentSubAgentId: opts.parentSubAgentId,
    parentRunId: opts.parentRunId,
    lastTask: opts.task,
    queuedInputs: [opts.task],
    toolNames: opts.toolNames,
  }
  subAgents.set(handle.id, handle)
  if (handle.parentSubAgentId) {
    const children = subAgentChildren.get(handle.parentSubAgentId) ?? new Set<string>()
    children.add(handle.id)
    subAgentChildren.set(handle.parentSubAgentId, children)
  }
  publishCreated(handle)
  return handle
}

export function getSubAgent(id: string): SubAgentHandle | undefined {
  return subAgents.get(id)
}

export function listSubAgents(convId: string): SubAgentHandle[] {
  return Array.from(subAgents.values())
    .filter((s) => s.parentConvId === convId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function closeSubAgent(id: string): boolean {
  const handle = subAgents.get(id)
  if (!handle) return false

  for (const childId of listChildSubAgentIds(id)) {
    closeSubAgent(childId)
  }

  handle.queuedInputs = []
  handle.activeRunId = undefined
  if (handle.status !== 'closed') {
    handle.status = 'closed'
    handle.updatedAt = Date.now()
    publishUpdated(handle)
  }

  abortController(id)
  return true
}

export function resumeSubAgent(id: string, newTask: string): SubAgentHandle | null {
  const handle = subAgents.get(id)
  if (!handle) return null

  handle.status = 'running'
  handle.result = undefined
  handle.error = undefined
  handle.queuedInputs = [newTask]
  handle.updatedAt = Date.now()
  publishUpdated(handle)
  void kickRuntime(id)
  return handle
}

export function sendSubAgentInput(id: string, input: string): SubAgentHandle | null {
  const handle = subAgents.get(id)
  if (!handle || isClosedSubAgentStatus(handle.status)) return null

  ensureQueuedInputs(handle).push(input)
  handle.status = 'running'
  handle.error = undefined
  handle.updatedAt = Date.now()
  publishUpdated(handle)
  void kickRuntime(id)
  return handle
}

export function completeSubAgent(id: string, result: string): void {
  const handle = subAgents.get(id)
  if (!handle || isClosedSubAgentStatus(handle.status)) return
  handle.status = 'completed'
  handle.result = result
  handle.error = undefined
  handle.queuedInputs = []
  handle.activeRunId = undefined
  handle.updatedAt = Date.now()
  publishUpdated(handle)
}

export function failSubAgent(id: string, error: string): void {
  const handle = subAgents.get(id)
  if (!handle || handle.status === 'closed') return
  handle.status = 'error'
  handle.error = error
  handle.queuedInputs = []
  handle.activeRunId = undefined
  handle.updatedAt = Date.now()
  publishUpdated(handle)
}

export function removeSubAgent(id: string): void {
  const handle = subAgents.get(id)
  if (!handle) return

  for (const childId of listChildSubAgentIds(id)) {
    removeSubAgent(childId)
  }

  subAgents.delete(id)
  detachSubAgentController(id)
  unregisterSubAgentRuntime(id)

  if (handle.parentSubAgentId) {
    const children = subAgentChildren.get(handle.parentSubAgentId)
    if (children) {
      children.delete(id)
      if (children.size === 0) subAgentChildren.delete(handle.parentSubAgentId)
    }
  }

  publishRemoved(handle.parentConvId, id)
}

export function listChildSubAgentIds(parentSubAgentId: string): string[] {
  return Array.from(subAgentChildren.get(parentSubAgentId) ?? [])
}

/** Wait for sub-agent to reach final status */
export function waitForSubAgent(id: string, timeoutMs = 60000): Promise<SubAgentHandle> {
  return new Promise((resolve, reject) => {
    const handle = subAgents.get(id)
    if (!handle) return reject(new Error('Sub-agent not found: ' + id))
    if (isSettled(handle)) {
      return resolve(handle)
    }
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error('Timeout waiting for sub-agent: ' + id))
    }, timeoutMs)
    const interval = setInterval(() => {
      const next = subAgents.get(id)
      if (!next || isSettled(next)) {
        clearTimeout(timeout)
        clearInterval(interval)
        resolve(next || handle)
      }
    }, 500)
  })
}

export interface SubAgentRuntime {
  running: boolean
  controller: AbortController | null
  parentSignal?: AbortSignal
  runTurn: (input: string, runId: string, signal: AbortSignal) => Promise<string>
}
