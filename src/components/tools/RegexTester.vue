<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

type CopyTarget = 'none' | 'matches' | 'replace'

interface MatchItem {
  index: number
  value: string
  groups: string[]
  namedGroups: Record<string, string>
}

const MAX_FILE_SIZE = 2 * 1024 * 1024

const historyStore = useHistoryStore()

const pattern = ref('')
const flags = ref('g')
const testText = ref('')
const replaceTemplate = ref('')
const replaceOutput = ref('')
const fileName = ref('')
const regexError = ref('')
const copyStatus = ref<CopyTarget>('none')
const saveStatus = ref<'none' | 'saved'>('none')
const aiDescription = ref('')
const aiResult = ref('')
const aiError = ref('')
const aiAction = ref<'generate' | 'explain' | 'examples' | null>(null)
const aiIsLocal = isLocalAiAvailable()
let activeAiRequest: AbortController | null = null

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

const normalizedFlags = computed(() => {
  const allowed = new Set(['g', 'i', 'm', 's', 'u', 'y'])
  const unique = new Set<string>()

  for (const char of flags.value) {
    if (allowed.has(char)) {
      unique.add(char)
    }
  }

  return Array.from(unique).join('')
})

const compiledRegex = computed(() => {
  regexError.value = ''

  if (pattern.value === '') {
    return null
  }

  try {
    return new RegExp(pattern.value, normalizedFlags.value)
  } catch {
    regexError.value = '正則表達式格式錯誤。'
    return null
  }
})

const matches = computed<MatchItem[]>(() => {
  const regex = compiledRegex.value
  if (!regex || testText.value === '') {
    return []
  }

  const sourceRegex = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`)
  const result: MatchItem[] = []

  for (const match of testText.value.matchAll(sourceRegex)) {
    result.push({
      index: match.index ?? 0,
      value: match[0] ?? '',
      groups: match.slice(1),
      namedGroups: match.groups ? { ...match.groups } : {},
    })

    if (result.length >= 500) {
      break
    }
  }

  return result
})

const getSuggestedRegex = (): { pattern: string; flags: string } | null => {
  const fenced = aiResult.value.match(/```(?:regex|regexp|javascript|js)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = (fenced || aiResult.value.trim().split('\n')[0] || '').trim()
  const literal = candidate.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/)
  if (!literal) {
    return null
  }

  const allowedFlags = new Set(['g', 'i', 'm', 's', 'u', 'y'])
  const suggestedFlags = Array.from(new Set(literal[2])).filter((flag) => allowedFlags.has(flag)).join('')
  try {
    new RegExp(literal[1], suggestedFlags)
    return { pattern: literal[1], flags: suggestedFlags }
  } catch {
    return null
  }
}

const suggestedRegex = computed(getSuggestedRegex)

const requestRegexAi = async (action: 'generate' | 'explain' | 'examples') => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiResult.value = ''

  if (action === 'generate' && aiDescription.value.trim() === '') {
    aiError.value = '請先描述要匹配的內容。'
    return
  }
  if (action !== 'generate' && pattern.value.trim() === '') {
    aiError.value = '請先輸入要分析的 Regex。'
    return
  }

  let prompt = ''
  let context = ''
  if (action === 'generate') {
    prompt = '依據使用者提供的需求，產生一個 JavaScript 正則表達式。只回傳一個 JavaScript regex literal（含 /pattern/flags），不要 Markdown、說明或其他文字。請選用必要且本工具支援的 flags（g、i、m、s、u、y）。'
    context = `需求描述：\n${aiDescription.value.trim()}`
  } else if (action === 'explain') {
    prompt = '請用繁體中文解釋這個 JavaScript 正則表達式的用途、各部分意義、flags、可能的邊界條件，以及一個簡短例子。若 regex 無效，指出可能原因；不要假稱已執行測試。'
    context = `Pattern：${pattern.value}\nFlags：${normalizedFlags.value}`
  } else {
    prompt = '請用繁體中文為這個 JavaScript 正則表達式提供 3 個精簡測試案例，每個案例標示預期符合或不符合，並說明原因。不要宣稱已在程式中執行。'
    context = `Pattern：${pattern.value}\nFlags：${normalizedFlags.value}`
  }

  const controller = new AbortController()
  activeAiRequest = controller
  aiAction.value = action
  try {
    const result = await generateAiText({
      tool: 'regex-tester',
      action: `regex-${action}`,
      prompt,
      context,
      signal: controller.signal,
    })
    aiResult.value = result.text
  } catch (error) {
    aiError.value = error instanceof Error
      ? error.name === 'AbortError' ? '已取消 AI 請求。' : error.message
      : 'AI 請求失敗。'
  } finally {
    if (activeAiRequest === controller) {
      activeAiRequest = null
      aiAction.value = null
    }
  }
}

const cancelRegexAi = () => {
  activeAiRequest?.abort()
}

const applySuggestedRegex = () => {
  if (!suggestedRegex.value) {
    return
  }
  pattern.value = suggestedRegex.value.pattern
  flags.value = suggestedRegex.value.flags || 'g'
  replaceOutput.value = ''
  regexError.value = ''
  saveStatus.value = 'none'
}

const handleRunReplace = () => {
  saveStatus.value = 'none'

  const regex = compiledRegex.value
  if (!regex) {
    replaceOutput.value = ''
    return
  }

  try {
    replaceOutput.value = testText.value.replace(regex, replaceTemplate.value)
  } catch {
    replaceOutput.value = ''
    regexError.value = '替換失敗，請檢查 replace 模板。'
  }
}

const handleCopy = async (target: Exclude<CopyTarget, 'none'>) => {
  let value = ''

  if (target === 'matches') {
    value = JSON.stringify(matches.value, null, 2)
  } else {
    value = replaceOutput.value
  }

  if (value.trim() === '') {
    regexError.value = '尚無可複製內容。'
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    markCopySuccess(target)
  } catch {
    regexError.value = '複製失敗：請檢查剪貼簿權限。'
  }
}

const handleSave = () => {
  if (!compiledRegex.value) {
    regexError.value = '尚無可儲存結果，請先輸入有效正則。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'regex-tester',
    action: replaceTemplate.value.trim() === '' ? 'test' : 'replace',
    input: JSON.stringify({ pattern: pattern.value, flags: normalizedFlags.value, testText: testText.value }, null, 2),
    output: JSON.stringify({ matches: matches.value, replaceOutput: replaceOutput.value }, null, 2),
    metadata: {
      fileName: fileName.value || null,
      matchCount: matches.value.length,
    },
  })

  markSavedSuccess()
}

const handleClear = () => {
  pattern.value = ''
  flags.value = 'g'
  testText.value = ''
  replaceTemplate.value = ''
  replaceOutput.value = ''
  fileName.value = ''
  regexError.value = ''
  copyStatus.value = 'none'
  saveStatus.value = 'none'
  aiDescription.value = ''
  aiResult.value = ''
  aiError.value = ''
}

const handleFileUpload = (event: Event) => {
  regexError.value = ''
  saveStatus.value = 'none'

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  if (file.size > MAX_FILE_SIZE) {
    regexError.value = `檔案過大（上限 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB）。`
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (loadEvent) => {
    testText.value = String(loadEvent.target?.result ?? '')
    fileName.value = file.name
    replaceOutput.value = ''
    input.value = ''
  }
  reader.onerror = () => {
    regexError.value = '讀取檔案失敗，請改用貼上文字。'
    input.value = ''
  }

  reader.readAsText(file, 'UTF-8')
}

onBeforeUnmount(() => {
  activeAiRequest?.abort()
  clearTimer('copy')
  clearTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">Regex Tester</h2>

    <p
      v-if="regexError"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ regexError }}
    </p>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <label style="cursor: pointer; line-height: 1">
        <input type="file" style="display: none" @change="handleFileUpload">
        <span class="tool-button" style="--tool-button-bg: #546e7a; display: inline-block">載入檔案</span>
      </label>
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleRunReplace">執行 Replace 預覽</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
      <span v-if="fileName" style="font-size: 0.9em; color: #666">檔案：{{ fileName }}</span>
    </div>

    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI Regex 助手</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">
          只會傳送需求描述，或目前的 Pattern 與 Flags；不會傳送測試文字或上傳檔案內容。AI 結果需自行檢查。
        </p>
      </div>
      <textarea
        v-model="aiDescription"
        rows="2"
        maxlength="4000"
        placeholder="描述要匹配的內容，例如：台灣手機號碼，允許 +886 前綴"
        style="width: 100%; box-sizing: border-box; padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical"
      />
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null" @click="requestRegexAi('generate')">
          {{ aiAction === 'generate' ? '產生中…' : '依描述產生 Regex' }}
        </button>
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null || !pattern.trim()" @click="requestRegexAi('explain')">
          {{ aiAction === 'explain' ? '解釋中…' : '解釋目前 Regex' }}
        </button>
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null || !pattern.trim()" @click="requestRegexAi('examples')">
          {{ aiAction === 'examples' ? '產生中…' : '建議測試案例' }}
        </button>
        <button v-if="aiAction !== null" class="tool-button tool-button--compact" type="button" style="--tool-button-bg: #64748b" @click="cancelRegexAi">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai" style="font-size: 12px; color: #1d4ed8">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" role="status" style="margin: 0; color: #b91c1c; font-size: 13px">{{ aiError }}</p>
      <div v-if="aiResult" style="display: grid; gap: 8px">
        <pre style="max-height: 300px; margin: 0; overflow: auto; padding: 12px; border: 1px solid #dbe2ea; border-radius: 6px; background: #fff; color: #1f2937; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.55 Consolas, monospace">{{ aiResult }}</pre>
        <button v-if="aiAction === null && suggestedRegex" class="tool-button tool-button--compact" type="button" style="justify-self: start; --tool-button-bg: #2563eb" @click="applySuggestedRegex">
          將建議帶入 Pattern / Flags
        </button>
      </div>
    </section>

    <div style="display: grid; grid-template-columns: minmax(220px, 2fr) minmax(120px, 1fr); gap: 8px">
      <input
        v-model="pattern"
        placeholder="Pattern（例如 ^[A-Za-z0-9_]+$）"
        style="padding: 8px; border: 1px solid #ccc; border-radius: 4px"
        @input="saveStatus = 'none'"
      >
      <input
        v-model="flags"
        placeholder="Flags（gim...）"
        style="padding: 8px; border: 1px solid #ccc; border-radius: 4px"
        @input="saveStatus = 'none'"
      >
    </div>

    <textarea
      v-model="testText"
      rows="8"
      placeholder="輸入或載入測試文字..."
      spellcheck="false"
      style="width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-family: Consolas, monospace"
      @input="saveStatus = 'none'"
    />

    <div style="display: grid; grid-template-columns: minmax(200px, 1fr) auto; gap: 8px; align-items: center">
      <input
        v-model="replaceTemplate"
        placeholder="Replace 模板（例如 $1）"
        style="padding: 8px; border: 1px solid #ccc; border-radius: 4px"
        @input="saveStatus = 'none'"
      >
      <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleRunReplace">更新 Replace 預覽</button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px">
      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 8px; background: #fafafa">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px">
          <strong>Match 清單（{{ matches.length }}）</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'matches'" style="color: #2e7d32; font-size: 0.85em">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('matches')">複製 JSON</button>
          </div>
        </div>

        <div v-if="matches.length === 0" style="color: #777; font-size: 0.9em">沒有 match 或目前 regex 無效。</div>

        <div
          v-for="(item, index) in matches"
          :key="`match-${index}-${item.index}`"
          style="border: 1px solid #e3e5e8; border-radius: 6px; padding: 8px; background: #fff"
        >
          <div><strong>#{{ index + 1 }}</strong> index={{ item.index }}</div>
          <div style="word-break: break-all"><strong>value:</strong> {{ item.value }}</div>
          <div v-if="item.groups.length > 0" style="margin-top: 4px">
            <strong>groups:</strong>
            <span>{{ item.groups.join(' | ') }}</span>
          </div>
          <div v-if="Object.keys(item.namedGroups).length > 0" style="margin-top: 4px">
            <strong>named groups:</strong>
            <span>{{ item.namedGroups }}</span>
          </div>
        </div>
      </div>

      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; display: grid; gap: 8px; background: #fafafa">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px">
          <strong>Replace 預覽</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'replace'" style="color: #2e7d32; font-size: 0.85em">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #455a64" @click="handleCopy('replace')">複製結果</button>
          </div>
        </div>

        <textarea
          :value="replaceOutput"
          rows="12"
          readonly
          style="width: 100%; box-sizing: border-box; padding: 8px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; font-family: Consolas, monospace"
        />
      </div>
    </div>
  </div>
</template>
