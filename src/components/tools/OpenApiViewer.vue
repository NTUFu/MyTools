<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { parse as parseYaml } from 'yaml'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

interface Endpoint { method: string; path: string; summary: string; operation: Record<string, unknown> }
const input = ref('openapi: 3.0.0\ninfo:\n  title: Example API\npaths:\n  /users:\n    get:\n      summary: List users')
const baseUrl = ref('')
const endpoints = ref<Endpoint[]>([])
const errorMessage = ref('')
const selected = ref<Endpoint | null>(null)
const aiIsLocal = isLocalAiAvailable()
const aiResult = ref('')
const aiError = ref('')
const aiAction = ref<'explain' | 'example' | null>(null)
let activeAiRequest: AbortController | null = null

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const summarizeSchema = (
  value: unknown,
  budget: { remaining: number; fieldNamesRemaining: number },
  depth = 0,
): unknown => {
  const schema = asRecord(value)
  if (!schema) return undefined
  if (budget.remaining <= 0 || depth >= 4) return { truncated: true }
  budget.remaining -= 1

  const summary: Record<string, unknown> = {}
  if (typeof schema.type === 'string') summary.type = schema.type.slice(0, 40)
  if (typeof schema.format === 'string') summary.format = schema.format.slice(0, 40)
  if (Array.isArray(schema.required)) {
    const required = schema.required
      .filter((item): item is string => typeof item === 'string')
      .slice(0, Math.min(6, budget.fieldNamesRemaining))
    budget.fieldNamesRemaining -= required.length
    summary.required = required.map((name) => name.slice(0, 60))
  }
  const properties = asRecord(schema.properties)
  if (properties) {
    const entries = Object.entries(properties).slice(0, Math.min(12, budget.fieldNamesRemaining))
    budget.fieldNamesRemaining -= entries.length
    summary.properties = Object.fromEntries(entries.map(([name, child]) => [
      name.slice(0, 60),
      summarizeSchema(child, budget, depth + 1),
    ]))
    if (Object.keys(properties).length > entries.length || budget.fieldNamesRemaining === 0) summary.propertiesTruncated = true
  }
  if (schema.items) summary.items = summarizeSchema(schema.items, budget, depth + 1)
  return summary
}

const createAiContext = (endpoint: Endpoint): string => {
  const budget = { remaining: 32, fieldNamesRemaining: 64 }
  const parameters = Array.isArray(endpoint.operation.parameters)
    ? endpoint.operation.parameters.slice(0, 20).flatMap((value) => {
      const parameter = asRecord(value)
      if (!parameter) return []
      const item: Record<string, unknown> = {}
      if (typeof parameter.name === 'string') item.name = parameter.name.slice(0, 60)
      if (typeof parameter.in === 'string') item.in = parameter.in.slice(0, 40)
      if (typeof parameter.required === 'boolean') item.required = parameter.required
      if (parameter.schema) item.schema = summarizeSchema(parameter.schema, budget)
      return [item]
    })
    : []
  const requestBody = asRecord(endpoint.operation.requestBody)
  const content = asRecord(requestBody?.content)
  const requestContent = content
    ? Object.entries(content).slice(0, 5).map(([mediaType, mediaValue]) => {
      const media = asRecord(mediaValue)
      return {
        mediaType: mediaType.slice(0, 60),
        schema: summarizeSchema(media?.schema, budget),
      }
    })
    : []
  const responses = asRecord(endpoint.operation.responses)

  return JSON.stringify({
    method: endpoint.method,
    path: endpoint.path.slice(0, 200),
    summary: endpoint.summary.slice(0, 200),
    parameters,
    requestContent,
    responseStatuses: responses ? Object.keys(responses).slice(0, 20) : [],
  })
}

const parseDocument = () => {
  abortAiRequestSilently()
  aiResult.value = ''
  aiError.value = ''
  errorMessage.value = ''
  try {
    const document = parseYaml(input.value) as { servers?: Array<{ url?: string }>; paths?: Record<string, Record<string, Record<string, unknown>>> }
    baseUrl.value = document.servers?.[0]?.url ?? ''
    endpoints.value = Object.entries(document.paths ?? {}).flatMap(([path, operations]) =>
      Object.entries(operations).filter(([method]) => ['get', 'post', 'put', 'patch', 'delete', 'head'].includes(method)).map(([method, operation]) => ({
        method: method.toUpperCase(), path, summary: typeof operation.summary === 'string' ? operation.summary : '', operation,
      })),
    )
    selected.value = endpoints.value[0] ?? null
  } catch (error) {
    endpoints.value = []
    errorMessage.value = error instanceof Error ? `解析失敗：${error.message}` : 'OpenAPI 文件解析失敗。'
  }
}
const curl = computed(() => selected.value ? `curl -X ${selected.value.method} ${JSON.stringify(`${baseUrl.value}${selected.value.path}`)}` : '')

const abortAiRequestSilently = () => {
  const controller = activeAiRequest
  activeAiRequest = null
  aiAction.value = null
  controller?.abort()
}

const selectEndpoint = (endpoint: Endpoint) => {
  abortAiRequestSilently()
  aiResult.value = ''
  aiError.value = ''
  selected.value = endpoint
}

const requestEndpointAi = async (action: 'explain' | 'example') => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiResult.value = ''
  const endpoint = selected.value
  if (!endpoint) {
    aiError.value = '請先解析並選取一個 Endpoint。'
    return
  }

  const controller = new AbortController()
  activeAiRequest = controller
  aiAction.value = action
  try {
    const result = await generateAiText({
      tool: 'openapi-viewer',
      action: `endpoint-${action}`,
      prompt: action === 'explain'
        ? '用繁體中文說明此 OpenAPI Endpoint 的用途、參數與請求 Body 結構。只依據提供的摘要與結構描述，不要推測未提供的行為。'
        : '依據此 OpenAPI Endpoint 的請求結構產生一個虛構的 JSON 請求 Body 範例。只輸出有效 JSON，不要包含真實個資、憑證或秘密；若沒有提供 Body schema，請回覆無法從目前資訊產生範例。',
      context: createAiContext(endpoint),
      signal: controller.signal,
    })
    aiResult.value = result.text
  } catch (error) {
    if (activeAiRequest === controller) {
      aiError.value = error instanceof Error
        ? error.name === 'AbortError' ? '已取消 AI 請求。' : error.message
        : 'AI 請求失敗。'
    }
  } finally {
    if (activeAiRequest === controller) {
      activeAiRequest = null
      aiAction.value = null
    }
  }
}

const cancelAiRequest = () => activeAiRequest?.abort()

onBeforeUnmount(abortAiRequestSilently)
</script>

<template>
  <div class="tool-page">
    <h2>OpenAPI / Swagger Viewer</h2>
    <textarea v-model="input" class="tool-textarea" rows="12"></textarea>
    <div class="tool-actions"><button class="tool-button" @click="parseDocument">解析文件</button><input v-model="baseUrl" class="tool-input" placeholder="Server URL（選填）" /></div>
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <div v-for="endpoint in endpoints" :key="`${endpoint.method}-${endpoint.path}`" class="tool-actions">
      <button class="tool-button" @click="selectEndpoint(endpoint)">{{ endpoint.method }} {{ endpoint.path }}</button><span>{{ endpoint.summary }}</span>
    </div>
    <pre v-if="selected" class="tool-output">{{ curl }}</pre>
    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI Endpoint 助手</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">僅傳送選定 Endpoint 的 method、path、summary、參數與請求 Schema 結構、回應狀態碼；不傳送完整文件、Server URL、描述文字、認證、範例值或請求資料。AI 說明與範例不會改動文件或送出 API 請求。</p>
      </div>
      <div class="tool-actions">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null || !selected" @click="requestEndpointAi('explain')">
          {{ aiAction === 'explain' ? '說明中…' : '說明選定 Endpoint' }}
        </button>
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null || !selected" @click="requestEndpointAi('example')">
          {{ aiAction === 'example' ? '產生中…' : '產生請求 Body 範例' }}
        </button>
        <button v-if="aiAction !== null" class="tool-button tool-button--compact" type="button" @click="cancelAiRequest">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" class="tool-error" role="status">{{ aiError }}</p>
      <pre v-if="aiResult" class="tool-output">{{ aiResult }}</pre>
    </section>
  </div>
</template>
