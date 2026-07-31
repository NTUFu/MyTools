<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

type InputType = 'auto' | 'seconds' | 'milliseconds' | 'iso'
type CopyTarget = 'none' | 'seconds' | 'milliseconds' | 'iso' | 'local'

interface ConvertResult {
  seconds: string
  milliseconds: string
  isoUtc: string
  local: string
}

const historyStore = useHistoryStore()

const inputValue = ref('')
const inputType = ref<InputType>('auto')
const errorMessage = ref('')
const result = ref<ConvertResult | null>(null)
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

const clearStatus = () => {
  errorMessage.value = ''
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

const formatLocal = (date: Date): string => {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

const parseInputToDate = (): Date | null => {
  const raw = inputValue.value.trim()
  if (raw === '') {
    errorMessage.value = '請先輸入時間內容。'
    return null
  }

  if (inputType.value === 'seconds') {
    const numberValue = Number(raw)
    if (!Number.isFinite(numberValue)) {
      errorMessage.value = '秒數格式錯誤。'
      return null
    }
    return new Date(numberValue * 1000)
  }

  if (inputType.value === 'milliseconds') {
    const numberValue = Number(raw)
    if (!Number.isFinite(numberValue)) {
      errorMessage.value = '毫秒格式錯誤。'
      return null
    }
    return new Date(numberValue)
  }

  if (inputType.value === 'iso') {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      errorMessage.value = '時間字串格式錯誤，請使用 ISO 或可解析日期格式。'
      return null
    }
    return parsed
  }

  if (/^-?\d+$/.test(raw)) {
    const numeric = Number(raw)
    const isMilliseconds = Math.abs(numeric) >= 1_000_000_000_000
    return new Date(isMilliseconds ? numeric : numeric * 1000)
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    errorMessage.value = '無法自動判斷格式，請切換輸入類型後再試。'
    return null
  }

  return parsed
}

const handleConvert = () => {
  clearStatus()

  const date = parseInputToDate()
  if (!date) {
    result.value = null
    return
  }

  if (Number.isNaN(date.getTime())) {
    result.value = null
    errorMessage.value = '轉換失敗，請確認輸入內容。'
    return
  }

  const milliseconds = date.getTime()
  const seconds = Math.floor(milliseconds / 1000)

  result.value = {
    seconds: String(seconds),
    milliseconds: String(milliseconds),
    isoUtc: date.toISOString(),
    local: formatLocal(date),
  }
}

const handleUseNow = () => {
  clearStatus()
  inputType.value = 'milliseconds'
  inputValue.value = String(Date.now())
  handleConvert()
}

const handleCopy = async (target: Exclude<CopyTarget, 'none'>) => {
  if (!result.value) {
    errorMessage.value = '尚無可複製內容。'
    return
  }

  const map: Record<Exclude<CopyTarget, 'none'>, string> = {
    seconds: result.value.seconds,
    milliseconds: result.value.milliseconds,
    iso: result.value.isoUtc,
    local: result.value.local,
  }

  try {
    await navigator.clipboard.writeText(map[target])
    markCopySuccess(target)
  } catch {
    errorMessage.value = '複製失敗：請確認剪貼簿權限。'
  }
}

const handleSave = () => {
  clearStatus()

  if (!result.value) {
    errorMessage.value = '尚無可儲存結果，請先執行轉換。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'timestamp-converter',
    action: 'convert',
    input: JSON.stringify({ inputType: inputType.value, inputValue: inputValue.value }),
    output: JSON.stringify(result.value, null, 2),
    metadata: {
      inputType: inputType.value,
    },
  })

  markSavedSuccess()
}

const handleClear = () => {
  inputValue.value = ''
  inputType.value = 'auto'
  result.value = null
  clearStatus()
}

const localTimeZone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)

onBeforeUnmount(() => {
  clearTimer('copy')
  clearTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">Timestamp Converter</h2>

    <p style="margin: 0; color: #666">
      支援 Unix 秒/毫秒、ISO 字串互轉，並顯示本地時區（{{ localTimeZone }}）。
    </p>

    <p
      v-if="errorMessage"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 8px; align-items: center">
      <input
        v-model="inputValue"
        placeholder="輸入秒/毫秒/ISO（例如 1760000000 或 2026-07-31T09:30:00Z）"
        style="padding: 10px; border: 1px solid #ccc; border-radius: 6px"
        @input="saveStatus = 'none'"
      >
      <select v-model="inputType" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px" @change="saveStatus = 'none'">
        <option value="auto">自動判斷</option>
        <option value="seconds">Unix 秒</option>
        <option value="milliseconds">Unix 毫秒</option>
        <option value="iso">ISO / 日期字串</option>
      </select>
    </div>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleConvert">轉換</button>
      <button class="tool-button" style="--tool-button-bg: #455a64" @click="handleUseNow">帶入現在時間</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div v-if="result" style="display: grid; gap: 8px">
      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap">
          <strong>Unix Seconds</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'seconds'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #546e7a" @click="handleCopy('seconds')">複製</button>
          </div>
        </div>
        <div style="font-family: Consolas, monospace; word-break: break-all">{{ result.seconds }}</div>
      </div>

      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap">
          <strong>Unix Milliseconds</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'milliseconds'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #546e7a" @click="handleCopy('milliseconds')">複製</button>
          </div>
        </div>
        <div style="font-family: Consolas, monospace; word-break: break-all">{{ result.milliseconds }}</div>
      </div>

      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap">
          <strong>ISO (UTC)</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'iso'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #546e7a" @click="handleCopy('iso')">複製</button>
          </div>
        </div>
        <div style="font-family: Consolas, monospace; word-break: break-all">{{ result.isoUtc }}</div>
      </div>

      <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap">
          <strong>本地時間</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === 'local'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #546e7a" @click="handleCopy('local')">複製</button>
          </div>
        </div>
        <div style="font-family: Consolas, monospace; word-break: break-all">{{ result.local }}</div>
      </div>
    </div>
  </div>
</template>
