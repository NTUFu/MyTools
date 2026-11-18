<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

type Header = { key: string; value: string; enabled: boolean }
type CopyTarget = 'request' | 'response' | 'response-headers' | 'response-body' | 'none'

const createDefaultHeaders = (): Header[] => [
  { key: 'Accept', value: 'application/json', enabled: true },
  { key: 'Content-Type', value: 'application/json', enabled: true },
  { key: 'Authorization', value: 'Bearer ', enabled: false },
  { key: 'X-API-Key', value: '', enabled: false },
  { key: 'Cache-Control', value: 'no-cache', enabled: false },
]

const method = ref('GET')
const url = ref('https://httpbin.org/get')
const headers = ref<Header[]>(createDefaultHeaders())
const isHeadersExpanded = ref(false)
const body = ref('')
const responseStatus = ref<number | null>(null)
const responseText = ref('')
const responseHeaders = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const copyStatus = ref<CopyTarget>('none')
const aiIsLocal = isLocalAiAvailable()
const aiDescription = ref('')
const aiResult = ref('')
const aiBodyDraft = ref('')
const aiError = ref('')
const isRequestingAi = ref(false)
let activeAiRequest: AbortController | null = null

const activeHeaders = computed(() => headers.value.filter((item) => item.enabled && item.key.trim() && item.value.trim()))
const requestHeaders = computed(() => Object.fromEntries(activeHeaders.value.map((item) => [item.key.trim(), item.value])))
const curlCommand = computed(() => {
  const headerArgs = Object.entries(requestHeaders.value).map(([key, value]) => ` -H ${JSON.stringify(`${key}: ${value}`)}`).join('')
  const bodyArg = body.value.trim() && method.value !== 'GET' ? ` --data ${JSON.stringify(body.value)}` : ''
  return `curl -X ${method.value}${headerArgs}${bodyArg} ${JSON.stringify(url.value)}`
})
const responseOutput = computed(() => [
  responseStatus.value === null ? '' : `HTTP ${responseStatus.value}`,
  responseHeaders.value ? `\n${responseHeaders.value}` : '',
  responseText.value ? `\n\n${responseText.value}` : '',
].join('').trim())
const addHeader = () => headers.value.push({ key: '', value: '', enabled: true })
const removeHeader = (index: number) => headers.value.splice(index, 1)
const resetHeaders = () => {
  headers.value = createDefaultHeaders()
}
const copyText = async (value: string, target: Exclude<CopyTarget, 'none'>) => {
  if (!value.trim()) {
    errorMessage.value = '目前沒有可複製的內容。'
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    copyStatus.value = target
    window.setTimeout(() => {
      if (copyStatus.value === target) copyStatus.value = 'none'
    }, 1600)
  } catch {
    errorMessage.value = '複製失敗：請檢查瀏覽器剪貼簿權限。'
  }
}
const send = async () => {
  errorMessage.value = ''
  responseText.value = ''
  responseHeaders.value = ''
  responseStatus.value = null
  copyStatus.value = 'none'
  isLoading.value = true
  try {
    const response = await fetch(url.value.trim(), {
      method: method.value,
      headers: requestHeaders.value,
      body: method.value === 'GET' || method.value === 'HEAD' ? undefined : body.value,
    })
    responseStatus.value = response.status
    responseHeaders.value = Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}`).join('\n')
    responseText.value = await response.text()
  } catch (error) {
    errorMessage.value = error instanceof Error ? `請求失敗：${error.message}` : '請求失敗。'
  } finally {
    isLoading.value = false
  }
}

const clearAiSuggestion = () => {
  const controller = activeAiRequest
  activeAiRequest = null
  isRequestingAi.value = false
  aiResult.value = ''
  aiBodyDraft.value = ''
  aiError.value = ''
  controller?.abort()
}

const requestBodyAi = async () => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiResult.value = ''
  aiBodyDraft.value = ''
  if (!aiDescription.value.trim()) {
    aiError.value = '請先描述預期的請求資料。'
    return
  }

  const controller = new AbortController()
  activeAiRequest = controller
  isRequestingAi.value = true
  try {
    const result = await generateAiText({
      tool: 'api-request-builder',
      action: 'generate-json-body',
      prompt: '根據使用者描述產生一個合理的 JSON 請求 Body 範例。只輸出有效 JSON，不要 Markdown 或說明；使用虛構的範例值，不要要求或重複任何憑證、個資或真實機密。',
      context: `請求 Body 需求：\n${aiDescription.value.trim()}`,
      signal: controller.signal,
    })
    aiResult.value = result.text
    const candidate = result.text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? result.text.trim()
    try {
      aiBodyDraft.value = JSON.stringify(JSON.parse(candidate), null, 2)
    } catch {
      aiError.value = 'AI 回覆不是有效 JSON，無法帶入 Body；原內容未變更。'
    }
  } catch (error) {
    if (activeAiRequest === controller) {
      aiError.value = error instanceof Error
        ? error.name === 'AbortError' ? '已取消 AI 請求。' : error.message
        : 'AI 請求失敗。'
    }
  } finally {
    if (activeAiRequest === controller) {
      activeAiRequest = null
      isRequestingAi.value = false
    }
  }
}

const applyAiBodyDraft = () => {
  if (aiBodyDraft.value) {
    body.value = aiBodyDraft.value
  }
}

const cancelAiRequest = () => activeAiRequest?.abort()

onBeforeUnmount(clearAiSuggestion)
</script>

<template>
  <div class="tool-page">
    <h2>API Request Builder</h2>
    <div class="tool-actions">
      <select v-model="method" aria-label="HTTP method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
      <input v-model="url" class="tool-input" placeholder="https://example.com/api" />
      <button class="tool-button" :disabled="isLoading" @click="send">{{ isLoading ? '請求中…' : '送出' }}</button>
    </div>
    <div class="api-section">
      <button class="api-section-toggle" type="button" @click="isHeadersExpanded = !isHeadersExpanded">
        <span>Headers（{{ activeHeaders.length }} 個啟用）</span>
        <span aria-hidden="true">{{ isHeadersExpanded ? '收闔' : '展開' }}</span>
      </button>
      <div v-if="isHeadersExpanded" class="api-header-editor">
        <p class="api-help-text">已預載常用 Header；停用空白或不需要的項目即可。Authorization 與 API Key 預設不會送出。</p>
        <div v-for="(header, index) in headers" :key="index" class="api-header-row">
          <label class="api-header-enabled">
            <input v-model="header.enabled" type="checkbox" :aria-label="`啟用 ${header.key || 'Header'}`" />
          </label>
          <input v-model="header.key" class="tool-input" placeholder="Header name" />
          <input v-model="header.value" class="tool-input" placeholder="Header value" />
          <button class="tool-button tool-button--compact" type="button" @click="removeHeader(index)">刪除</button>
        </div>
        <div class="tool-actions">
          <button class="tool-button" type="button" @click="addHeader">新增 Header</button>
          <button class="tool-button" type="button" @click="resetHeaders">重設常用 Header</button>
        </div>
      </div>
    </div>
    <h3>Body</h3>
    <textarea v-model="body" class="tool-textarea" rows="6" placeholder='{"key":"value"}' @input="clearAiSuggestion"></textarea>
    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI JSON Body 助手</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">只傳送你在此輸入的 Body 需求；不會傳送 URL、Headers、既有 Body 或 API 回應。請勿在需求中輸入密鑰或個人資料。草稿需通過 JSON 解析並手動套用，不會送出請求。</p>
      </div>
      <textarea v-model="aiDescription" class="tool-textarea" rows="2" maxlength="4000" placeholder="描述要建立的 JSON 請求資料" @input="clearAiSuggestion" />
      <div class="tool-actions">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || isRequestingAi" @click="requestBodyAi">
          {{ isRequestingAi ? '產生中…' : '產生 JSON Body 草稿' }}
        </button>
        <button v-if="isRequestingAi" class="tool-button tool-button--compact" type="button" @click="cancelAiRequest">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" class="tool-error" role="status">{{ aiError }}</p>
      <div v-if="aiResult" style="display: grid; gap: 8px">
        <pre class="tool-output">{{ aiBodyDraft || aiResult }}</pre>
        <button v-if="aiBodyDraft" class="tool-button tool-button--compact" type="button" @click="applyAiBodyDraft">將 JSON 草稿帶入 Body</button>
      </div>
    </section>
    <h3>cURL</h3>
    <div class="api-output-heading">
      <button class="tool-button tool-button--compact" type="button" @click="copyText(curlCommand, 'request')">
        {{ copyStatus === 'request' ? '已複製' : '複製 cURL' }}
      </button>
    </div>
    <pre class="tool-output">{{ curlCommand }}</pre>
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <div v-if="responseStatus !== null" class="api-output-heading">
      <h3>Response {{ responseStatus }}</h3>
      <button class="tool-button tool-button--compact" type="button" @click="copyText(responseOutput, 'response')">
        {{ copyStatus === 'response' ? '已複製' : '複製完整回應' }}
      </button>
    </div>
    <div v-if="responseHeaders" class="api-response-block">
      <div class="api-output-heading">
        <strong>Response Headers</strong>
        <button class="tool-button tool-button--compact" type="button" @click="copyText(responseHeaders, 'response-headers')">
          {{ copyStatus === 'response-headers' ? '已複製' : '複製 Headers' }}
        </button>
      </div>
      <pre class="tool-output">{{ responseHeaders }}</pre>
    </div>
    <div v-if="responseText" class="api-response-block">
      <div class="api-output-heading">
        <strong>Response Body</strong>
        <button class="tool-button tool-button--compact" type="button" @click="copyText(responseText, 'response-body')">
          {{ copyStatus === 'response-body' ? '已複製' : '複製 Body' }}
        </button>
      </div>
      <pre class="tool-output">{{ responseText }}</pre>
    </div>
  </div>
</template>
