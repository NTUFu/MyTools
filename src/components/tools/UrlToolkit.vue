<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

interface QueryItem {
  id: string
  key: string
  value: string
}

type CopyTarget = 'none' | 'full-url' | 'encoded' | 'decoded'

const MAX_FILE_SIZE = 2 * 1024 * 1024

const historyStore = useHistoryStore()

const rawUrlInput = ref('')
const loadedFileName = ref('')
const parsedUrl = ref<URL | null>(null)
const queryItems = ref<QueryItem[]>([])
const encodedInput = ref('')
const decodedInput = ref('')
const encodedOutput = ref('')
const decodedOutput = ref('')
const errorMessage = ref('')
const copyStatus = ref<CopyTarget>('none')
const saveStatus = ref<'none' | 'saved'>('none')

let copyTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const clearStatusTimer = (type: 'copy' | 'save') => {
  if (type === 'copy') {
    if (copyTimer) {
      clearTimeout(copyTimer)
      copyTimer = null
    }
    return
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

const markCopySuccess = (target: Exclude<CopyTarget, 'none'>) => {
  copyStatus.value = target
  clearStatusTimer('copy')
  copyTimer = setTimeout(() => {
    copyStatus.value = 'none'
    copyTimer = null
  }, 1800)
}

const markSavedSuccess = () => {
  saveStatus.value = 'saved'
  clearStatusTimer('save')
  saveTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveTimer = null
  }, 1800)
}

const resetStatus = () => {
  errorMessage.value = ''
  copyStatus.value = 'none'
  saveStatus.value = 'none'
}

const createQueryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const rebuildParsedUrlFromQuery = () => {
  if (!parsedUrl.value) {
    return
  }

  const next = new URL(parsedUrl.value.toString())
  next.search = ''

  for (const item of queryItems.value) {
    const key = item.key.trim()
    if (key === '') {
      continue
    }

    next.searchParams.append(key, item.value)
  }

  parsedUrl.value = next
  rawUrlInput.value = next.toString()
}

const parseCurrentUrl = () => {
  resetStatus()

  const candidate = rawUrlInput.value.trim()
  if (candidate === '') {
    parsedUrl.value = null
    queryItems.value = []
    errorMessage.value = '請輸入 URL。'
    return
  }

  try {
    const parsed = new URL(candidate)
    parsedUrl.value = parsed
    queryItems.value = Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
      id: createQueryId(),
      key,
      value,
    }))
  } catch {
    parsedUrl.value = null
    queryItems.value = []
    errorMessage.value = 'URL 格式錯誤，請確認包含協定（例如 https://）。'
  }
}

const addQueryItem = () => {
  queryItems.value.push({
    id: createQueryId(),
    key: '',
    value: '',
  })
  saveStatus.value = 'none'
}

const removeQueryItem = (id: string) => {
  queryItems.value = queryItems.value.filter((item) => item.id !== id)
  rebuildParsedUrlFromQuery()
  saveStatus.value = 'none'
}

const handleQueryInput = () => {
  rebuildParsedUrlFromQuery()
  saveStatus.value = 'none'
}

const handleEncode = () => {
  resetStatus()

  try {
    encodedOutput.value = encodeURIComponent(encodedInput.value)
  } catch {
    encodedOutput.value = ''
    errorMessage.value = 'URL Encode 失敗。'
  }
}

const handleDecode = () => {
  resetStatus()

  try {
    decodedOutput.value = decodeURIComponent(decodedInput.value)
  } catch {
    decodedOutput.value = ''
    errorMessage.value = 'URL Decode 失敗，請確認輸入為有效編碼。'
  }
}

const handleCopy = async (target: Exclude<CopyTarget, 'none'>, value: string) => {
  if (value.trim() === '') {
    errorMessage.value = '尚無可複製內容。'
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    markCopySuccess(target)
  } catch {
    errorMessage.value = '複製失敗：請檢查剪貼簿權限。'
  }
}

const handleSave = () => {
  resetStatus()

  if (!parsedUrl.value && encodedOutput.value.trim() === '' && decodedOutput.value.trim() === '') {
    errorMessage.value = '目前沒有可儲存內容。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'url-toolkit',
    action: 'transform',
    input: rawUrlInput.value,
    output: JSON.stringify({
      parsedUrl: parsedUrl.value?.toString() ?? null,
      encodedOutput: encodedOutput.value || null,
      decodedOutput: decodedOutput.value || null,
    }, null, 2),
    metadata: {
      fileName: loadedFileName.value || null,
      queryCount: queryItems.value.length,
    },
  })

  markSavedSuccess()
}

const handleFileUpload = (event: Event) => {
  resetStatus()

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  if (file.size > MAX_FILE_SIZE) {
    errorMessage.value = `檔案過大（上限 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB）。`
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (loadEvent) => {
    const content = String(loadEvent.target?.result ?? '')
    const firstLine = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)

    rawUrlInput.value = firstLine ?? ''
    loadedFileName.value = file.name
    parsedUrl.value = null
    queryItems.value = []
    input.value = ''
  }

  reader.onerror = () => {
    errorMessage.value = '讀取檔案失敗，請改用手動貼上 URL。'
    input.value = ''
  }

  reader.readAsText(file, 'UTF-8')
}

const handleClear = () => {
  rawUrlInput.value = ''
  loadedFileName.value = ''
  parsedUrl.value = null
  queryItems.value = []
  encodedInput.value = ''
  decodedInput.value = ''
  encodedOutput.value = ''
  decodedOutput.value = ''
  resetStatus()
}

const parsedFields = computed(() => {
  if (!parsedUrl.value) {
    return null
  }

  return {
    href: parsedUrl.value.toString(),
    protocol: parsedUrl.value.protocol,
    host: parsedUrl.value.host,
    hostname: parsedUrl.value.hostname,
    port: parsedUrl.value.port || '(default)',
    pathname: parsedUrl.value.pathname,
    search: parsedUrl.value.search || '(empty)',
    hash: parsedUrl.value.hash || '(empty)',
  }
})

onBeforeUnmount(() => {
  clearStatusTimer('copy')
  clearStatusTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">URL Toolkit</h2>

    <p
      v-if="errorMessage"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <label style="cursor: pointer; line-height: 1">
        <input type="file" style="display: none" @change="handleFileUpload">
        <span class="tool-button" style="--tool-button-bg: #546e7a; display: inline-block">載入檔案</span>
      </label>
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="parseCurrentUrl">解析 URL</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
      <span v-if="loadedFileName" style="font-size: 0.9em; color: #666">檔案：{{ loadedFileName }}</span>
    </div>

    <textarea
      v-model="rawUrlInput"
      rows="3"
      placeholder="輸入完整 URL（例如 https://example.com/path?a=1#demo）"
      spellcheck="false"
      style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-family: Consolas, monospace"
      @input="saveStatus = 'none'"
    />

    <div v-if="parsedFields" style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 6px; background: #fafafa">
      <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between; flex-wrap: wrap">
        <strong>解析結果</strong>
        <div style="display: flex; align-items: center; gap: 8px">
          <span v-if="copyStatus === 'full-url'" style="color: #2e7d32; font-size: 0.85em">✅ 已複製</span>
          <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('full-url', parsedFields.href)">複製完整 URL</button>
        </div>
      </div>
      <div><strong>href:</strong> {{ parsedFields.href }}</div>
      <div><strong>protocol:</strong> {{ parsedFields.protocol }}</div>
      <div><strong>host:</strong> {{ parsedFields.host }}</div>
      <div><strong>hostname:</strong> {{ parsedFields.hostname }}</div>
      <div><strong>port:</strong> {{ parsedFields.port }}</div>
      <div><strong>pathname:</strong> {{ parsedFields.pathname }}</div>
      <div><strong>search:</strong> {{ parsedFields.search }}</div>
      <div><strong>hash:</strong> {{ parsedFields.hash }}</div>
    </div>

    <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 8px; background: #fff">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <strong>Query 參數</strong>
        <button class="tool-button tool-button--compact" style="--tool-button-bg: #1565c0" @click="addQueryItem">新增參數</button>
      </div>

      <div v-if="queryItems.length === 0" style="color: #777; font-size: 0.9em">目前沒有 query 參數。</div>

      <div v-for="item in queryItems" :key="item.id" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: center">
        <input
          v-model="item.key"
          placeholder="key"
          style="padding: 6px; border: 1px solid #ccc; border-radius: 4px"
          @input="handleQueryInput"
        >
        <input
          v-model="item.value"
          placeholder="value"
          style="padding: 6px; border: 1px solid #ccc; border-radius: 4px"
          @input="handleQueryInput"
        >
        <button class="tool-button tool-button--compact" style="--tool-button-bg: #c62828" @click="removeQueryItem(item.id)">刪除</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px">
      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 8px; background: #fafafa">
        <strong>URL Encode</strong>
        <textarea
          v-model="encodedInput"
          rows="4"
          placeholder="輸入要 encode 的內容"
          style="width: 100%; box-sizing: border-box; padding: 8px"
          @input="saveStatus = 'none'"
        />
        <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleEncode">Encode</button>
        <textarea
          :value="encodedOutput"
          rows="4"
          readonly
          style="width: 100%; box-sizing: border-box; padding: 8px; background: #f5f5f5"
        />
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px">
          <span v-if="copyStatus === 'encoded'" style="color: #2e7d32; font-size: 0.85em">✅ 已複製</span>
          <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('encoded', encodedOutput)">複製 Encode 結果</button>
        </div>
      </div>

      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 8px; background: #fafafa">
        <strong>URL Decode</strong>
        <textarea
          v-model="decodedInput"
          rows="4"
          placeholder="輸入要 decode 的內容"
          style="width: 100%; box-sizing: border-box; padding: 8px"
          @input="saveStatus = 'none'"
        />
        <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleDecode">Decode</button>
        <textarea
          :value="decodedOutput"
          rows="4"
          readonly
          style="width: 100%; box-sizing: border-box; padding: 8px; background: #f5f5f5"
        />
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px">
          <span v-if="copyStatus === 'decoded'" style="color: #2e7d32; font-size: 0.85em">✅ 已複製</span>
          <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('decoded', decodedOutput)">複製 Decode 結果</button>
        </div>
      </div>
    </div>
  </div>
</template>
