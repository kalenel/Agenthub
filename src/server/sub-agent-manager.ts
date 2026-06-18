/**
 * Sub-Agent Manager ? tracks spawned sub-agents for multi-agent collaboration.
 * Supports: close, resume, send_input, wait operations.
 */

export type SubAgentStatus = 'running' | 'completed' | 'closed' | 'error'

export interface SubAgentHandle {
  id: string
  name: string
  status: SubAgentStatus
  result?: string
  error?: string
  createdAt: number
  parentAgentId: string
  parentConvId: string
  // For resume: stored context
  lastTask?: string
  toolNames?: string[];
}

const subAgents = new Map<string, SubAgentHandle>();

let _idCounter = 0;
function nextId(): string {
  return 'sub_' + (++_idCounter) + '_' + Date.now().toString(36);
}

export function createSubAgent(opts: {
  name: string;
  parentAgentId: string;
  parentConvId: string;
  task: string;
  toolNames: string[];
}): SubAgentHandle {
  const handle: SubAgentHandle = {
    id: nextId(),
    name: opts.name,
    status: 'running',
    createdAt: Date.now(),
    parentAgentId: opts.parentAgentId,
    parentConvId: opts.parentConvId,
    lastTask: opts.task,
    toolNames: opts.toolNames,
  };
  subAgents.set(handle.id, handle);
  return handle;
}

export function getSubAgent(id: string): SubAgentHandle | undefined {
  return subAgents.get(id);
}

export function listSubAgents(convId: string): SubAgentHandle[] {
  return Array.from(subAgents.values()).filter(s => s.parentConvId === convId);
}

export function closeSubAgent(id: string): boolean {
  const handle = subAgents.get(id);
  if (!handle) return false;
  handle.status = 'closed';
  return true;
}

export function resumeSubAgent(id: string, newTask: string): SubAgentHandle | null {
  const handle = subAgents.get(id);
  if (!handle || handle.status !== 'closed') return null;
  handle.status = 'running';
  handle.lastTask = newTask;
  return handle;
}

export function completeSubAgent(id: string, result: string): void {
  const handle = subAgents.get(id);
  if (handle) {
    handle.status = 'completed';
    handle.result = result;
  }
}

export function failSubAgent(id: string, error: string): void {
  const handle = subAgents.get(id);
  if (handle) {
    handle.status = 'error';
    handle.error = error;
  }
}

/** Wait for sub-agent to reach final status */
export function waitForSubAgent(id: string, timeoutMs = 60000): Promise<SubAgentHandle> {
  return new Promise((resolve, reject) => {
    const handle = subAgents.get(id);
    if (!handle) return reject(new Error('Sub-agent not found: ' + id));
    if (handle.status === 'completed' || handle.status === 'error' || handle.status === 'closed') {
      return resolve(handle);
    }
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timeout waiting for sub-agent: ' + id));
    }, timeoutMs);
    const interval = setInterval(() => {
      const h = subAgents.get(id);
      if (!h || h.status === 'completed' || h.status === 'error' || h.status === 'closed') {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve(h || handle);
      }
    }, 500);
  });
}