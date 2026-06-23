import { z } from 'zod'

import type { TaskProgressReport } from '@/shared/types'

import type { ToolDef } from './tools/types'

export const REPORT_TASK_PROGRESS_TOOL_NAME = 'report_task_progress'

export const ReportTaskProgressArgsSchema = z.object({
  summary: z.string().min(1),
  percent: z.number().int().min(0).max(100).optional(),
  nextStep: z.string().min(1).optional(),
  blockers: z.array(z.string().min(1)).optional(),
})

type ParsedTaskProgressReport = z.infer<typeof ReportTaskProgressArgsSchema>

export function normalizeTaskProgressReport(data: ParsedTaskProgressReport): TaskProgressReport {
  const blockers = data.blockers?.map((blocker) => blocker.trim()).filter(Boolean)
  return {
    summary: data.summary.trim(),
    ...(typeof data.percent === 'number' ? { percent: data.percent } : {}),
    ...(data.nextStep?.trim() ? { nextStep: data.nextStep.trim() } : {}),
    ...(blockers && blockers.length > 0 ? { blockers } : {}),
  }
}

export function parseTaskProgressReport(value: unknown): TaskProgressReport | null {
  const parsed = ReportTaskProgressArgsSchema.safeParse(value)
  return parsed.success ? normalizeTaskProgressReport(parsed.data) : null
}

export function readTaskProgressReportFromToolResult(result: unknown): TaskProgressReport | null {
  return readTaskProgressReportFromUnknown(result, 0)
}

export function isTaskProgressReportToolName(toolName: string): boolean {
  return (
    toolName === REPORT_TASK_PROGRESS_TOOL_NAME ||
    toolName.endsWith(`__${REPORT_TASK_PROGRESS_TOOL_NAME}`) ||
    toolName.endsWith(`_${REPORT_TASK_PROGRESS_TOOL_NAME}`)
  )
}

export const reportTaskProgressTool: ToolDef = {
  name: REPORT_TASK_PROGRESS_TOOL_NAME,
  description:
    'Report an in-progress update for the current AgentHub dispatched sub-task. Use this while the task is still running to surface a concise status, optional percent, optional next step, and optional blockers. This does not complete the task.',
  parameters: {
    type: 'object',
    required: ['summary'],
    properties: {
      summary: {
        type: 'string',
        description: 'Concise status update for what is happening now.',
      },
      percent: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Optional rough progress percentage from 0 to 100.',
      },
      nextStep: {
        type: 'string',
        description: 'Optional next concrete step.',
      },
      blockers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional blocking conditions that are slowing the task down.',
      },
    },
  },
  async handler(args, ctx) {
    const parsed = ReportTaskProgressArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid task progress report: ${parsed.error.message}` }
    }
    if (!ctx.taskId) {
      return { ok: false, error: 'Task progress reporting requires a dispatched task id' }
    }
    return { ok: true, value: normalizeTaskProgressReport(parsed.data) }
  },
}

function readTaskProgressReportFromUnknown(value: unknown, depth: number): TaskProgressReport | null {
  if (depth > 3 || value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      return parseTaskProgressReport(JSON.parse(trimmed) as unknown)
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readTaskProgressReportFromUnknown(item, depth + 1)
      if (parsed) return parsed
    }
    return null
  }
  if (typeof value !== 'object') return null

  const record = value as {
    structuredContent?: unknown
    result?: unknown
    content?: unknown
    text?: unknown
    data?: unknown
  }

  const structured =
    readTaskProgressReportFromUnknown(record.structuredContent, depth + 1) ??
    readTaskProgressReportFromUnknown(record.result, depth + 1) ??
    readTaskProgressReportFromUnknown(record.content, depth + 1) ??
    readTaskProgressReportFromUnknown(record.data, depth + 1)
  if (structured) return structured

  if (typeof record.text === 'string') {
    return readTaskProgressReportFromUnknown(record.text, depth + 1)
  }

  const parsed = ReportTaskProgressArgsSchema.safeParse(value)
  return parsed.success ? normalizeTaskProgressReport(parsed.data) : null
}
