import { ref } from 'vue'
import { isLocalAiAvailable } from './localAi'

type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'custom'

export interface AiRuntimeConfig {
  provider: AiProvider
  model: string
  endpoint: string
  apiKey: string
  enabled: boolean
  inputCostPerMillion: number | null
  outputCostPerMillion: number | null
}

export interface AiGenerationRequest {
  tool: string
  action: string
  prompt: string
  context?: string
  signal?: AbortSignal
}

export interface AiGenerationResult {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

let runtimeConfig: AiRuntimeConfig | null = null
export const aiIsReady = ref(false)

const getSavedSettings = (): Partial<AiRuntimeConfig> => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    return JSON.parse(window.localStorage.getItem('mytools:ai-settings') ?? '{}') as Partial<AiRuntimeConfig>
  } catch {
    return {}
  }
}

export const refreshAiRuntimeConfig = (): void => {
  const saved = getSavedSettings()
  if (!runtimeConfig) {
    runtimeConfig = {
      provider: saved.provider === 'openai' || saved.provider === 'anthropic' || saved.provider === 'custom' ? saved.provider : 'gemini',
      model: saved.model ?? '',
      endpoint: saved.endpoint ?? '',
      apiKey: '',
      enabled: saved.enabled ?? false,
      inputCostPerMillion: saved.inputCostPerMillion ?? null,
      outputCostPerMillion: saved.outputCostPerMillion ?? null,
    }
  } else {
    runtimeConfig = {
      ...runtimeConfig,
      ...saved,
      apiKey: runtimeConfig.apiKey,
      // Keep the in-memory toggle for this tab; persistence always stores it off.
      enabled: runtimeConfig.enabled,
    }
  }
  aiIsReady.value = Boolean(
    runtimeConfig.enabled && runtimeConfig.model.trim() &&
    (runtimeConfig.provider === 'custom' || runtimeConfig.apiKey.trim()),
  )
}

export const setAiRuntimeConfig = (config: AiRuntimeConfig | null): void => {
  runtimeConfig = config ? { ...config } : null
  aiIsReady.value = Boolean(
    runtimeConfig?.enabled &&
    runtimeConfig.model.trim() &&
    (runtimeConfig.provider === 'custom' || runtimeConfig.apiKey.trim()),
  )
}

export const generateAiText = async (request: AiGenerationRequest): Promise<AiGenerationResult> => {
  refreshAiRuntimeConfig()
  if (!isLocalAiAvailable()) {
    throw new Error('AI 功能僅能在 localhost 使用。')
  }

  if (!runtimeConfig?.enabled) {
    throw new Error('請先到「AI 設定」開啟全站 AI。')
  }

  if (!runtimeConfig.model.trim()) {
    throw new Error('請先在「AI 設定」填寫 Model。')
  }

  if (runtimeConfig.provider !== 'custom' && !runtimeConfig.apiKey.trim()) {
    throw new Error('API Key 未設定；請回到「AI 設定」重新輸入。')
  }

  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: request.signal,
    body: JSON.stringify({
      provider: runtimeConfig.provider,
      model: runtimeConfig.model.trim(),
      endpoint: runtimeConfig.endpoint.trim() || undefined,
      apiKey: runtimeConfig.apiKey,
      inputCostPerMillion: runtimeConfig.inputCostPerMillion,
      outputCostPerMillion: runtimeConfig.outputCostPerMillion,
      tool: request.tool,
      action: request.action,
      prompt: request.prompt,
      context: request.context ?? '',
    }),
  })

  const responseText = await response.text()
  let result: {
    detail?: string
    text?: string
    inputTokens?: number | null
    outputTokens?: number | null
    latencyMs?: number
  }
  try {
    result = JSON.parse(responseText) as typeof result
  } catch {
    throw new Error(`本機 AI API 回應格式錯誤（HTTP ${response.status}）。請確認 API 正在執行。`)
  }

  if (!response.ok) {
    throw new Error(result.detail || `AI 請求失敗（HTTP ${response.status}）。`)
  }

  if (typeof result.text !== 'string' || result.text.trim() === '') {
    throw new Error('AI 服務沒有回傳文字內容。')
  }

  return {
    text: result.text,
    inputTokens: typeof result.inputTokens === 'number' ? result.inputTokens : null,
    outputTokens: typeof result.outputTokens === 'number' ? result.outputTokens : null,
    latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : 0,
  }
}
