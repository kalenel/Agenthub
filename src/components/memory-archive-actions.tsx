'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  exportMemoryPackArchive,
  importMemoryPackArchive,
  type MemoryMode,
  type MemoryPackArchiveImportInput,
  type MemoryPackArchiveImportResult,
  type MemoryRecipient,
} from '@/lib/memory-api'

export function MemoryArchiveActions({
  conversationId,
  mode,
  recipient,
  limit,
  maxTokens,
  start,
  end,
  onImported,
}: {
  conversationId: string | null
  mode: MemoryMode
  recipient: MemoryRecipient
  limit: number
  maxTokens: number
  start?: string
  end?: string
  onImported: (result: MemoryPackArchiveImportResult) => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportStart, setExportStart] = useState(start ?? '')
  const [exportEnd, setExportEnd] = useState(end ?? '')

  useEffect(() => {
    setBusy(null)
    setMessage(null)
    setError(null)
    setExportStart(start ?? '')
    setExportEnd(end ?? '')
  }, [conversationId, end, mode, start])

  const handleExport = async () => {
    if (busy) return
    setBusy('export')
    setMessage(null)
    setError(null)
    try {
      const archive = await exportMemoryPackArchive({
        mode,
        conversationId,
        recipient,
        limit,
        maxTokens,
        includeAttachments: Boolean(conversationId),
        start: exportStart || undefined,
        end: exportEnd || undefined,
      })
      downloadBlob(archive.blob, archive.fileName)
      setMessage('Exported')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const handlePickFile = async (file: File | null) => {
    if (!file || busy || !conversationId) return
    setBusy('import')
    setMessage(null)
    setError(null)
    try {
      const input: MemoryPackArchiveImportInput = { conversationId, archive: file }
      const result = await importMemoryPackArchive(input)
      await Promise.resolve(onImported(result))
      setMessage(`Imported ${result.importedRecords} records`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="grid w-full gap-1.5">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            开始
            <Input type="datetime-local" value={exportStart} onChange={(event) => setExportStart(event.target.value)} className="h-8 text-xs" />
          </label>
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            结束
            <Input type="datetime-local" value={exportEnd} onChange={(event) => setExportEnd(event.target.value)} className="h-8 text-xs" />
          </label>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => { setExportStart(''); setExportEnd('') }}
            disabled={busy !== null || (!exportStart && !exportEnd)}
            aria-label="清空导出范围"
            title="清空范围"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => void handleExport()}
          disabled={busy !== null}
          aria-label="Export memory pack"
          title="Export"
        >
          {busy === 'export' ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null || !conversationId}
          aria-label="Import memory pack"
          title="Import"
        >
          {busy === 'import' ? <RefreshCw className="size-4 animate-spin" /> : <Upload className="size-4" />}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => void handlePickFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <div className="min-h-4 text-[11px] leading-4">
        {error ? <span className="text-destructive">{error}</span> : message ? <span className="text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  )
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
