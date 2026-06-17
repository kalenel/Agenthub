import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

/**
 * GET /api/models?provider=deepseek&baseUrl=https://...&apiKey=sk-xxx
 * 
 * 从 OpenAI-compatible 端点拉取可用模型列表。
 * 支持: deepseek, openai, volcano-ark, openai-compatible
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider')
  const baseUrl = req.nextUrl.searchParams.get('baseUrl')
  let apiKey = req.nextUrl.searchParams.get('apiKey')

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 })
  }

  // 通过 Query 传 key 不安全，仅本地使用；生产应走 settings
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
      .map((m) => m.id)
      .filter((id) => !id.includes('embed') && !id.includes('moderation') && !id.includes('tts') && !id.includes('whisper'))
      .sort()

    return NextResponse.json({ models, provider, baseUrl: effectiveBaseUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function getDefaultBaseUrl(provider: string | null): string | null {
  switch (provider) {
    case 'deepseek': return 'https://api.deepseek.com/v1'
    case 'openai': return 'https://api.openai.com/v1'
    case 'volcano-ark': return 'https://ark.cn-beijing.volces.com/api/v3'
    default: return null
  }
}