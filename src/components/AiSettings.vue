<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { isLocalAiAvailable } from '../utils/localAi'
import { refreshAiRuntimeConfig, setAiRuntimeConfig } from '../utils/aiClient'

type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'custom'
type TestState = 'idle' | 'testing' | 'success' | 'error'

interface AiSettingsDraft {
  provider: AiProvider
  model: string
  endpoint: string
  enabled: boolean
  inputCostPerMillion: number | null
  outputCostPerMillion: number | null
}

interface UsageSummary {
  requestCount: number
  successCount: number
  failureCount: number
  inputTokens: number | null
  outputTokens: number | null
  averageLatencyMs: number | null
  estimatedCostUsd: number | null
  byProviderModel: Array<{
    provider: string
    model: string
    tool: string
    request_count: number
    input_tokens: number | null
    output_tokens: number | null
    estimated_cost_usd: number | null
  }>
}

const STORAGE_KEY = 'mytools:ai-settings'
const isLocal = isLocalAiAvailable()
const defaults: AiSettingsDraft = {
  provider: 'gemini',
  model: '',
  endpoint: '',
  enabled: false,
  inputCostPerMillion: null,
  outputCostPerMillion: null,
}

const settings = ref<AiSettingsDraft>({ ...defaults })
const apiKey = ref('')
const testState = ref<TestState>('idle')
const testMessage = ref('')
const usage = ref<UsageSummary | null>(null)
const usageError = ref('')
const isClearingUsage = ref(false)
const savedMessage = ref('')

const modelPlaceholder = computed(() => ({
  gemini: '例如 gemini-2.5-flash',
  openai: '例如 gpt-4o-mini',
  anthropic: '例如 claude-3-5-haiku-latest',
  custom: '輸入服務支援的模型名稱',
}[settings.value.provider]))

const endpointPlaceholder = computed(() => ({
  gemini: '預設：https://generativelanguage.googleapis.com/v1beta/openai',
  openai: '預設：https://api.openai.com/v1',
  anthropic: '預設：https://api.anthropic.com',
  custom: '例如 http://localhost:11434/v1',
}[settings.value.provider]))

const requiresApiKey = computed(() => settings.value.provider !== 'custom')
const canTestConnection = computed(() =>
  isLocal && settings.value.model.trim() !== '' &&
  (!requiresApiKey.value || apiKey.value.trim() !== '') &&
  (settings.value.provider !== 'custom' || settings.value.endpoint.trim() !== ''),
)

const loadSettings = () => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AiSettingsDraft>
      settings.value = {
        ...defaults,
        ...parsed,
        // The API key is intentionally ephemeral, so AI must be re-enabled after reload.
        enabled: false,
        provider: ['gemini', 'openai', 'anthropic', 'custom'].includes(String(parsed.provider))
          ? parsed.provider as AiProvider
          : defaults.provider,
      }
    }
  } catch {
    settings.value = { ...defaults }
  }
}

const persistSettings = () => {
  // Deliberately persist configuration only; API keys remain in memory.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings.value, enabled: false }))
  savedMessage.value = '設定已儲存（API Key 不會保存；重新載入後 AI 會保持關閉）。'
  window.setTimeout(() => {
    savedMessage.value = ''
  }, 2400)
}

const loadUsage = async () => {
  if (!isLocal) {
    return
  }

  usageError.value = ''
  try {
    const response = await fetch('/api/ai/usage')
    if (!response.ok) {
      throw new Error('本機 AI API 尚未啟動。')
    }
    usage.value = await response.json() as UsageSummary
  } catch (error) {
    usageError.value = error instanceof Error ? error.message : '無法讀取本機用量統計。'
  }
}

const testConnection = async () => {
  if (!canTestConnection.value) {
    return
  }

  testState.value = 'testing'
  testMessage.value = '正在呼叫模型測試連線；此操作可能產生供應商費用。'
  const payload = {
    provider: settings.value.provider,
    model: settings.value.model.trim(),
    endpoint: settings.value.endpoint.trim() || undefined,
    apiKey: apiKey.value,
    inputCostPerMillion: settings.value.inputCostPerMillion,
    outputCostPerMillion: settings.value.outputCostPerMillion,
    prompt: 'Reply with exactly: OK',
    action: 'connection-test',
  }

  try {
    const response = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const responseText = await response.text()
    let result: { detail?: string; reply?: string; latencyMs?: number }
    try {
      result = JSON.parse(responseText) as typeof result
    } catch {
      throw new Error(
        `本機 AI API 回應格式錯誤（HTTP ${response.status}）。請確認 API 正在執行；可重新啟動 npm run dev:local 後再試。`,
      )
    }
    if (!response.ok) {
      throw new Error(result.detail || `連線測試失敗（HTTP ${response.status}）。`)
    }
    testState.value = 'success'
    testMessage.value = `連線成功：${result.reply || '已收到模型回覆'}（${result.latencyMs ?? 0} ms）`
    await loadUsage()
  } catch (error) {
    testState.value = 'error'
    testMessage.value = error instanceof Error ? error.message : '連線測試失敗。'
    await loadUsage()
  }
}

const clearUsage = async () => {
  if (!window.confirm('確定要刪除此電腦保存的所有 AI 用量統計？')) {
    return
  }

  isClearingUsage.value = true
  try {
    const response = await fetch('/api/ai/usage', { method: 'DELETE' })
    if (!response.ok) {
      throw new Error('清除統計失敗。')
    }
    await loadUsage()
  } catch (error) {
    usageError.value = error instanceof Error ? error.message : '清除統計失敗。'
  } finally {
    isClearingUsage.value = false
  }
}

const clearSettings = () => {
  settings.value = { ...defaults }
  apiKey.value = ''
  testState.value = 'idle'
  testMessage.value = ''
  window.localStorage.removeItem(STORAGE_KEY)
}

const formatCount = (value: number | null) => value === null ? '未知' : value.toLocaleString('zh-TW')
const formatMoney = (value: number | null) => value === null ? '無法估算' : `US$${value.toFixed(6)}`

watch(() => settings.value.provider, () => {
  apiKey.value = ''
  testState.value = 'idle'
  testMessage.value = ''
})

watch([settings, apiKey], () => {
  if (!isLocal) {
    setAiRuntimeConfig(null)
    return
  }

  refreshAiRuntimeConfig()
  setAiRuntimeConfig({
    ...settings.value,
    apiKey: apiKey.value,
  })
}, { deep: true, immediate: true })

onMounted(() => {
  if (isLocal) {
    loadSettings()
    void loadUsage()
  }
})
</script>

<template>
  <main v-if="isLocal" class="ai-settings-page">
    <header class="ai-page-header">
      <div>
        <p class="ai-eyebrow">LOCAL ONLY</p>
        <h1>AI 設定</h1>
        <p class="ai-intro">設定一個 AI 服務供全站共用。AI 只在 localhost 環境提供；工具只有在你明確點擊 AI 操作時才會傳送必要資料。</p>
      </div>
      <span class="local-badge"><span class="local-dot" />僅限本機</span>
    </header>

    <section class="ai-card">
      <div class="ai-card-title">
        <div>
          <h2>服務連線</h2>
          <p>API Key 只保留在目前瀏覽器分頁的記憶體中，切換工具可繼續使用；關閉或重新載入分頁後需重新輸入，不會保存至瀏覽器儲存空間。</p>
        </div>
        <label class="ai-switch">
          <input v-model="settings.enabled" type="checkbox" aria-label="啟用全站 AI" />
          <span class="ai-switch-track" aria-hidden="true"><span /></span>
          <span>{{ settings.enabled ? 'AI 已開啟' : 'AI 已關閉' }}</span>
        </label>
      </div>

      <div class="ai-form-grid">
        <label class="ai-field">
          <span>AI Provider</span>
          <select v-model="settings.provider">
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">自訂 OpenAI-compatible API</option>
          </select>
        </label>
        <label class="ai-field">
          <span>Model</span>
          <input v-model="settings.model" type="text" :placeholder="modelPlaceholder" autocomplete="off" />
        </label>
        <label v-if="settings.provider === 'custom' || settings.endpoint" class="ai-field ai-field-wide">
          <span>API Endpoint</span>
          <input v-model="settings.endpoint" type="url" :placeholder="endpointPlaceholder" autocomplete="url" />
          <small>自訂服務使用 OpenAI-compatible Chat Completions 格式。HTTP 僅允許本機 endpoint。</small>
        </label>
        <label v-else-if="settings.provider !== 'custom'" class="ai-field ai-field-wide">
          <span>自訂 Endpoint（選填）</span>
          <input v-model="settings.endpoint" type="url" :placeholder="endpointPlaceholder" autocomplete="url" />
        </label>
        <label class="ai-field ai-field-wide">
          <span>API Key{{ requiresApiKey ? '' : '（本機服務可留空）' }}</span>
          <input v-model="apiKey" type="password" :placeholder="requiresApiKey ? '輸入此 Provider 的 API Key' : '本機服務通常不需要 API Key'" autocomplete="new-password" />
        </label>
      </div>

      <details class="ai-cost-settings">
        <summary>費用估算設定（每百萬 tokens，美元）</summary>
        <p>請依供應商目前定價自行填寫；未填時只統計 token，不估算費用。</p>
        <div class="ai-cost-grid">
          <label class="ai-field"><span>輸入 token 費率</span><input v-model.number="settings.inputCostPerMillion" type="number" min="0" step="0.01" placeholder="留白則不估算" /></label>
          <label class="ai-field"><span>輸出 token 費率</span><input v-model.number="settings.outputCostPerMillion" type="number" min="0" step="0.01" placeholder="留白則不估算" /></label>
        </div>
      </details>

      <div class="ai-actions">
        <button class="ai-primary-button" type="button" :disabled="testState === 'testing' || !canTestConnection" @click="testConnection">
          {{ testState === 'testing' ? '測試中…' : '測試連線' }}
        </button>
        <button class="ai-secondary-button" type="button" @click="persistSettings">儲存設定</button>
        <button class="ai-text-button" type="button" @click="clearSettings">清除設定</button>
        <span v-if="savedMessage" class="ai-saved-message" role="status">{{ savedMessage }}</span>
      </div>
      <p v-if="testMessage" class="ai-feedback" :class="`is-${testState}`" role="status">{{ testMessage }}</p>
      <p class="ai-notice">連線測試與工具內 AI 操作都會實際呼叫所選模型並可能產生費用。請只使用自己信任的 Provider；各工具會說明實際送出的資料範圍。</p>
    </section>

    <section class="ai-card usage-card">
      <div class="usage-heading">
        <div>
          <h2>本機用量統計</h2>
          <p>只保存在本機 SQLite，不會回傳或彙整到 MyTools。</p>
        </div>
        <div class="usage-actions">
          <button class="ai-secondary-button" type="button" @click="loadUsage">重新整理</button>
          <button class="ai-text-button danger-text" type="button" :disabled="isClearingUsage || !usage?.requestCount" @click="clearUsage">清除統計</button>
        </div>
      </div>
      <p v-if="usageError" class="ai-feedback is-error" role="status">{{ usageError }}</p>
      <div v-if="usage" class="usage-grid">
        <div class="usage-metric"><span>請求總數</span><strong>{{ formatCount(usage.requestCount) }}</strong></div>
        <div class="usage-metric"><span>成功 / 失敗</span><strong>{{ formatCount(usage.successCount) }} / {{ formatCount(usage.failureCount) }}</strong></div>
        <div class="usage-metric"><span>輸入 / 輸出 tokens</span><strong>{{ formatCount(usage.inputTokens) }} / {{ formatCount(usage.outputTokens) }}</strong></div>
        <div class="usage-metric"><span>平均延遲</span><strong>{{ usage.averageLatencyMs === null ? '未知' : `${usage.averageLatencyMs} ms` }}</strong></div>
        <div class="usage-metric"><span>估算費用</span><strong>{{ formatMoney(usage.estimatedCostUsd) }}</strong></div>
      </div>
      <div v-if="usage?.byProviderModel.length" class="usage-table-wrap">
        <table class="usage-table">
          <thead><tr><th>Provider / Model / 工具</th><th>請求</th><th>Input tokens</th><th>Output tokens</th><th>估算費用</th></tr></thead>
          <tbody>
            <tr v-for="row in usage.byProviderModel" :key="`${row.provider}-${row.model}-${row.tool}`">
              <td>{{ row.provider }} / {{ row.model }} / {{ row.tool }}</td><td>{{ formatCount(row.request_count) }}</td><td>{{ formatCount(row.input_tokens) }}</td><td>{{ formatCount(row.output_tokens) }}</td><td>{{ formatMoney(row.estimated_cost_usd) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="!usageError" class="usage-empty">尚無用量紀錄。連線測試會列入統計。</p>
      <p class="ai-notice">token 數以 Provider 回傳資料為準；自訂 endpoint 未提供 usage 時會顯示「未知」。費用由你設定費率估算，不等同供應商帳單。</p>
    </section>
  </main>
</template>

<style scoped>
.ai-settings-page { max-width: 1040px; margin: 0 auto; padding: 34px clamp(18px, 4vw, 48px) 56px; color: #1f2937; }
.ai-page-header, .ai-card-title, .usage-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.ai-page-header { margin-bottom: 24px; }
.ai-eyebrow { margin: 0 0 7px; color: #2563eb; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
h1 { margin: 0; color: #172554; font-size: clamp(28px, 4vw, 36px); line-height: 1.2; }
.ai-intro { max-width: 720px; margin: 10px 0 0; color: #64748b; line-height: 1.65; }
.local-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #bbf7d0; border-radius: 999px; background: #f0fdf4; color: #166534; font-size: 13px; font-weight: 700; white-space: nowrap; }
.local-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.ai-card { margin-top: 18px; padding: clamp(18px, 3vw, 26px); border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; box-shadow: 0 8px 28px rgba(15, 23, 42, .045); }
h2 { margin: 0; color: #172554; font-size: 19px; }
.ai-card-title p, .usage-heading p { margin: 6px 0 0; color: #64748b; font-size: 13px; line-height: 1.55; }
.ai-switch { display: inline-flex; align-items: center; gap: 9px; color: #334155; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.ai-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.ai-switch-track { display: flex; align-items: center; width: 40px; height: 23px; padding: 3px; border-radius: 999px; background: #cbd5e1; transition: background .15s ease; }
.ai-switch-track span { width: 17px; height: 17px; border-radius: 50%; background: white; box-shadow: 0 1px 3px #64748b; transition: transform .15s ease; }
.ai-switch input:checked + .ai-switch-track { background: #2563eb; }
.ai-switch input:checked + .ai-switch-track span { transform: translateX(17px); }
.ai-switch input:focus-visible + .ai-switch-track { outline: 3px solid #bfdbfe; outline-offset: 2px; }
.ai-form-grid, .ai-cost-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }
.ai-field { display: flex; min-width: 0; flex-direction: column; gap: 7px; color: #334155; font-size: 13px; font-weight: 650; }
.ai-field input, .ai-field select { width: 100%; min-height: 42px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; padding: 9px 11px; color: #1f2937; font: inherit; font-weight: 400; }
.ai-field input:focus, .ai-field select:focus { outline: 3px solid #dbeafe; border-color: #3b82f6; }
.ai-field input::placeholder { color: #94a3b8; }
.ai-field small { color: #64748b; font-size: 11px; font-weight: 400; line-height: 1.5; }
.ai-field-wide { grid-column: 1 / -1; }
.ai-cost-settings { margin-top: 18px; border-top: 1px solid #eef2f7; padding-top: 15px; color: #475569; font-size: 13px; }
.ai-cost-settings summary { cursor: pointer; font-weight: 650; }
.ai-cost-settings p { color: #64748b; font-size: 12px; }
.ai-cost-grid { margin-top: 12px; }
.ai-actions, .usage-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.ai-actions { margin-top: 22px; }
.ai-primary-button, .ai-secondary-button, .ai-text-button { min-height: 38px; padding: 0 14px; border-radius: 7px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.ai-primary-button { border: 1px solid #1d4ed8; background: #2563eb; color: white; }
.ai-primary-button:hover:not(:disabled) { background: #1d4ed8; }
.ai-secondary-button { border: 1px solid #cbd5e1; background: #fff; color: #334155; }
.ai-secondary-button:hover:not(:disabled) { background: #f8fafc; }
.ai-text-button { border: 1px solid transparent; background: transparent; color: #475569; }
.danger-text { color: #b91c1c; }
.ai-primary-button:disabled, .ai-secondary-button:disabled, .ai-text-button:disabled { opacity: .5; cursor: not-allowed; }
.ai-saved-message { color: #15803d; font-size: 12px; }
.ai-feedback { margin: 14px 0 0; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 7px; background: #f8fafc; color: #334155; font-size: 13px; }
.ai-feedback.is-success { border-color: #86efac; background: #f0fdf4; color: #166534; }
.ai-feedback.is-error { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.ai-feedback.is-testing { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
.ai-notice { margin: 14px 0 0; color: #64748b; font-size: 12px; line-height: 1.6; }
.usage-heading { align-items: center; }
.usage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 20px; }
.usage-metric { min-width: 0; padding: 14px; border: 1px solid #e2e8f0; border-radius: 9px; background: #f8fafc; }
.usage-metric span, .usage-metric strong { display: block; }
.usage-metric span { color: #64748b; font-size: 11px; }
.usage-metric strong { margin-top: 7px; overflow-wrap: anywhere; color: #172554; font-size: 16px; }
.usage-table-wrap { margin-top: 16px; overflow: auto; }
.usage-table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 12px; }
.usage-table th, .usage-table td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
.usage-table th { color: #64748b; font-weight: 650; }
.usage-empty { margin: 18px 0 0; color: #64748b; font-size: 13px; }
@media (max-width: 640px) { .ai-page-header, .ai-card-title, .usage-heading { flex-direction: column; align-items: stretch; } .local-badge { align-self: flex-start; } .ai-form-grid, .ai-cost-grid { grid-template-columns: 1fr; } .ai-field-wide { grid-column: auto; } .ai-switch { align-self: flex-start; } }
</style>
