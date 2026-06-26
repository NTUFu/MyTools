<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

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
