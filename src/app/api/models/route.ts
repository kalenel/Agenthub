import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

import type { AppSettingsRow } from '@/db/schema'
import { getAppSettings } from '@/server/settings-service'

/**
 * GET /api/models?provider=deepseek&baseUrl=https://...&apiKey=sk-xxx
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider')
  const baseUrl = req.nextUrl.searchParams.get('baseUrl')
  let apiKey = req.nextUrl.searchParams.get('apiKey')

  if (!apiKey) {
    const settings = await getAppSettings()
    const settingsKey = getSettingsKey(provider)
    const settingValue = settings[settingsKey]
    apiKey = typeof settingValue === 'string' ? settingValue : null
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing apiKey (neither per-agent nor global settings)' }, { status: 400 })
    }
  }

  const effectiveBaseUrl = baseUrl || getDefaultBaseUrl(provider)
  if (!effectiveBaseUrl) {
    return NextResponse.json({ error: 'Missing baseUrl and no default for provider' }, { status: 400 })
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: effectiveBaseUrl,
      maxRetries: 1,
      timeout: 10000,
    })

    const response = await client.models.list()
    const models = response.data
      .map((model) => model.id)
      .filter((id) => !id.includes('embed') && !id.includes('moderation') && !id.includes('tts') && !id.includes('whisper'))
      .sort()

    return NextResponse.json({ models, provider, baseUrl: effectiveBaseUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

type AppSettingsApiKeyKey = Extract<keyof AppSettingsRow, 'anthropicApiKey' | 'openaiApiKey' | 'deepseekApiKey' | 'arkApiKey'>

function getSettingsKey(provider: string | null): AppSettingsApiKeyKey {
  switch (provider) {
    case 'deepseek':
      return 'deepseekApiKey'
    case 'openai':
      return 'openaiApiKey'
    case 'anthropic':
      return 'anthropicApiKey'
    case 'volcano-ark':
      return 'arkApiKey'
    default:
      return 'openaiApiKey'
  }
}

function getDefaultBaseUrl(provider: string | null): string | null {
  switch (provider) {
    case 'deepseek':
      return 'https://api.deepseek.com/v1'
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'volcano-ark':
      return 'https://ark.cn-beijing.volces.com/api/v3'
    default:
      return null
  }
}
