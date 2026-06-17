'use client'

import { ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fetchModels } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ModelSwitcherProps {
  agentId: string
  provider: string
  currentModel: string
  apiKey?: string
  apiBaseUrl?: string
  onModelChange: (modelId: string) => void
  className?: string
}

export function ModelSwitcher({
  agentId,
  provider,
  currentModel,
  apiKey,
  apiBaseUrl,
  onModelChange,
  className,
}: ModelSwitcherProps) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!apiKey) return
    setLoading(true)
    setError('')
    fetchModels({ provider, apiKey, baseUrl: apiBaseUrl })
      .then(setModels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [provider, apiKey, apiBaseUrl])

  // Always show - API endpoint will resolve key from global settings if per-agent key is missing

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 gap-1 px-2 text-xs font-mono text-muted-foreground', className)}
        >
          {currentModel || 'Select model'}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
        {loading && (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Loading models...
          </div>
        )}
        {error && (
          <div className="px-2 py-2 text-xs text-destructive">{error}</div>
        )}
        {!loading &&
          !error &&
          models.map((m) => (
            <DropdownMenuItem
              key={m}
              onClick={() => onModelChange(m)}
              className={cn('text-xs font-mono', m === currentModel && 'bg-accent')}
            >
              {m}
            </DropdownMenuItem>
          ))}
        {models.length === 0 && !loading && !error && (
          <div className="px-2 py-2 text-xs text-muted-foreground">No models found</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}