<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Ajv, { type ErrorObject } from 'ajv'
import { useHistoryStore } from '../../stores/history'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

type CopyTarget = 'none' | 'errors' | 'normalized-json'

interface ValidationErrorItem {
  path: string
  message: string
  keyword: string
}

const historyStore = useHistoryStore()

const schemaInput = ref(`{
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "integer", "minimum": 1 },
    "name": { "type": "string", "minLength": 1 },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}`)

const jsonInput = ref(`{
  "id": 1,
  "name": "mytools",
  "tags": ["vue", "typescript"]
}`)

const parseError = ref('')
const validateError = ref('')
const isValid = ref<boolean | null>(null)
const validationErrors = ref<ValidationErrorItem[]>([])
const normalizedJson = ref('')
const copyStatus = ref<CopyTarget>('none')
const saveStatus = ref<'none' | 'saved'>('none')
const aiIsLocal = isLocalAiAvailable()
const aiExplanation = ref('')
const aiError = ref('')
const isRequestingAi = ref(false)
let activeAiRequest: AbortController | null = null
const AI_ERROR_SUMMARY_LIMIT = 40

const abortAiRequestSilently = () => {
  const controller = activeAiRequest
  activeAiRequest = null
  isRequestingAi.value = false
  controller?.abort()
}

let copyTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

const clearTimer = (type: 'copy' | 'save') => {
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

const clearStatus = () => {
  parseError.value = ''
  validateError.value = ''
  copyStatus.value = 'none'
  saveStatus.value = 'none'
}

const markCopySuccess = (target: Exclude<CopyTarget, 'none'>) => {
  copyStatus.value = target
  clearTimer('copy')
  copyTimer = setTimeout(() => {
    copyStatus.value = 'none'
    copyTimer = null
  }, 1800)
}

const markSavedSuccess = () => {
  saveStatus.value = 'saved'
  clearTimer('save')
  saveTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveTimer = null
  }, 1800)
}

const toErrorItems = (errors: ErrorObject[] | null | undefined): ValidationErrorItem[] => {
  if (!errors) {
    return []
  }

  return errors.map((error) => ({
    path: error.instancePath || '/',
    message: error.message || 'Unknown validation error',
    keyword: error.keyword,
  }))
}

const runValidation = () => {
  abortAiRequestSilently()
  aiExplanation.value = ''
  aiError.value = ''
  clearStatus()

  let parsedSchema: unknown
  let parsedJson: unknown

  try {
    parsedSchema = JSON.parse(schemaInput.value)
  } catch {
    isValid.value = null
    validationErrors.value = []
    normalizedJson.value = ''
    parseError.value = 'Schema JSON 格式錯誤，請先修正。'
    return
  }

  try {
    parsedJson = JSON.parse(jsonInput.value)
    normalizedJson.value = JSON.stringify(parsedJson, null, 2)
  } catch {
    isValid.value = null
    validationErrors.value = []
    normalizedJson.value = ''
    parseError.value = '待驗證 JSON 格式錯誤，請先修正。'
    return
  }

  try {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const validate = ajv.compile(parsedSchema)
    const valid = validate(parsedJson)

    isValid.value = valid
    validationErrors.value = valid ? [] : toErrorItems(validate.errors)
  } catch {
    isValid.value = null
    validationErrors.value = []
    validateError.value = 'Schema 驗證器初始化失敗，請確認 Schema 結構。'
  }
}

const handleCopy = async (target: Exclude<CopyTarget, 'none'>) => {
  let value = ''

  if (target === 'errors') {
    value = JSON.stringify(validationErrors.value, null, 2)
  }

  if (target === 'normalized-json') {
    value = normalizedJson.value
  }

  if (value.trim() === '') {
    validateError.value = '尚無可複製內容。'
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    markCopySuccess(target)
  } catch {
    validateError.value = '複製失敗：請確認剪貼簿權限。'
  }
}

const handleSave = () => {
  clearStatus()

  if (isValid.value === null) {
    validateError.value = '尚未完成驗證，請先執行「驗證」。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'json-schema-validator',
    action: 'validate',
    input: JSON.stringify({ schema: schemaInput.value, json: jsonInput.value }),
    output: JSON.stringify({ isValid: isValid.value, errors: validationErrors.value }, null, 2),
    metadata: {
      errorCount: validationErrors.value.length,
    },
  })

  markSavedSuccess()
}

const handleClear = () => {
  abortAiRequestSilently()
  schemaInput.value = '{}'
  jsonInput.value = '{}'
  isValid.value = null
  validationErrors.value = []
  normalizedJson.value = ''
  aiExplanation.value = ''
  aiError.value = ''
  clearStatus()
}

const handleValidationInput = () => {
  abortAiRequestSilently()
  aiExplanation.value = ''
  aiError.value = ''
  saveStatus.value = 'none'
}

const explainValidationErrors = async () => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiExplanation.value = ''

  if (isValid.value !== false || validationErrors.value.length === 0) {
    aiError.value = '請先執行驗證並確認有驗證錯誤。'
    return
  }

  const controller = new AbortController()
  activeAiRequest = controller
  isRequestingAi.value = true
  try {
    const errors = validationErrors.value.slice(0, AI_ERROR_SUMMARY_LIMIT).map(({ path, message, keyword }) => ({
      path: path.slice(0, 160),
      keyword: keyword.slice(0, 80),
      message: message.slice(0, 240),
    }))
    const result = await generateAiText({
      tool: 'json-schema-validator',
      action: 'explain-validation-errors',
      prompt: '用繁體中文逐項說明這些 JSON Schema 驗證錯誤代表什麼，以及可採取的修正方向。只依據錯誤路徑、keyword 和訊息推論；不要猜測或產生任何實際資料值，也不要修改資料。',
      context: `驗證錯誤摘要：\n${JSON.stringify({
        errors,
        omittedErrorCount: validationErrors.value.length - errors.length,
      })}`,
      signal: controller.signal,
    })
    aiExplanation.value = result.text
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

const cancelAiRequest = () => activeAiRequest?.abort()

const resultTitle = computed(() => {
  if (isValid.value === null) {
    return '尚未驗證'
  }

  return isValid.value ? '驗證成功' : '驗證失敗'
})

onBeforeUnmount(() => {
  abortAiRequestSilently()
  clearTimer('copy')
  clearTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">JSON Schema Validator</h2>

    <p
      v-if="parseError || validateError"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ parseError || validateError }}
    </p>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="runValidation">驗證</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px">
      <div style="display: grid; gap: 6px">
        <strong>Schema</strong>
        <textarea
          v-model="schemaInput"
          rows="14"
          spellcheck="false"
          style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-family: Consolas, monospace"
          @input="handleValidationInput"
        />
      </div>

      <div style="display: grid; gap: 6px">
        <strong>JSON</strong>
        <textarea
          v-model="jsonInput"
          rows="14"
          spellcheck="false"
          style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-family: Consolas, monospace"
          @input="handleValidationInput"
        />
      </div>
    </div>

    <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap">
        <strong>{{ resultTitle }}</strong>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
          <span v-if="copyStatus === 'errors'" style="color: #2e7d32; font-size: 12px">✅ 已複製錯誤</span>
          <span v-if="copyStatus === 'normalized-json'" style="color: #2e7d32; font-size: 12px">✅ 已複製 JSON</span>
          <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('errors')">複製錯誤</button>
          <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('normalized-json')">複製 JSON</button>
        </div>
      </div>

      <div v-if="isValid === true" style="color: #2e7d32">資料符合 Schema。</div>

      <div v-if="isValid === false" style="display: grid; gap: 6px">
        <div style="color: #d32f2f">共 {{ validationErrors.length }} 筆錯誤：</div>
        <div
          v-for="(item, index) in validationErrors"
          :key="`${item.path}-${item.keyword}-${index}`"
          style="border: 1px solid #e3e5e8; border-radius: 6px; background: #fff; padding: 8px"
        >
          <div><strong>#{{ index + 1 }}</strong> path: {{ item.path }}</div>
          <div>keyword: {{ item.keyword }}</div>
          <div>message: {{ item.message }}</div>
        </div>
      </div>

      <div v-if="isValid === null" style="color: #666">請輸入 Schema 與 JSON，然後按「驗證」。</div>
    </div>

    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI 驗證錯誤說明</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">僅傳送 validator 產生的錯誤路徑、keyword 與訊息；不會傳送 Schema 或 JSON 內容。AI 建議不會修改驗證結果或資料。</p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || isRequestingAi || isValid !== false" @click="explainValidationErrors">
          {{ isRequestingAi ? '說明中…' : '解釋驗證錯誤' }}
        </button>
        <button v-if="isRequestingAi" class="tool-button tool-button--compact" type="button" @click="cancelAiRequest">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" class="tool-error" role="status">{{ aiError }}</p>
      <pre v-if="aiExplanation" class="tool-output">{{ aiExplanation }}</pre>
    </section>
  </div>
</template>
