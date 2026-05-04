<script setup lang="ts">
import { ref } from 'vue'
import * as XLSX from 'xlsx'

const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const jsonOutput = ref('')
const errorMessage = ref('')
const isConverting = ref(false)
const copyStatus = ref<'none' | 'copied'>('none')

const resetState = () => {
  jsonOutput.value = ''
  errorMessage.value = ''
  copyStatus.value = 'none'
}

const ensureSupportedFile = (file: File) => {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx')) {
    return
  }

  throw new Error('檔案格式不支援，僅接受 .csv 或 .xlsx。')
}

const parseWorkbook = async (file: File) => {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.csv')) {
    const content = await file.text()
    return XLSX.read(content, { type: 'string', raw: false })
  }

  const content = await file.arrayBuffer()
  return XLSX.read(content, { type: 'array', raw: false })
}

const convertFileToJson = async () => {
  resetState()

  if (!selectedFile.value) {
    errorMessage.value = '請先選擇 csv 或 xlsx 檔案。'
    return
  }

  isConverting.value = true

  try {
    ensureSupportedFile(selectedFile.value)
    const workbook = await parseWorkbook(selectedFile.value)
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      throw new Error('檔案內容為空，無法轉換為 JSON。')
    }

    const firstSheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: null,
      raw: false,
    })

    const hasEmptyHeaders = rows.some((row) => Object.keys(row).some((key) => key.startsWith('__EMPTY')))
    if (hasEmptyHeaders) {
      throw new Error('資料格式不符合：請確認第一列欄位名稱完整且不可空白。')
    }

    if (rows.length === 0) {
      throw new Error('檔案沒有可轉換的資料列。')
    }

    jsonOutput.value = JSON.stringify(rows, null, 2)
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = `轉換失敗：${error.message}`
    } else {
      errorMessage.value = '轉換失敗：檔案格式不符合或內容無法解析。'
    }
  } finally {
    isConverting.value = false
  }
}

const handleFileChange = (event: Event) => {
  resetState()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null

  selectedFile.value = file
  selectedFileName.value = file?.name ?? ''
}

const parseOutputJson = (): unknown | null => {
  if (jsonOutput.value.trim() === '') {
    errorMessage.value = '目前沒有可操作的 JSON 結果。'
    return null
  }

  try {
    return JSON.parse(jsonOutput.value)
  } catch {
    errorMessage.value = 'JSON 格式錯誤，無法進行壓縮或格式化。'
    return null
  }
}

const formatJsonOutput = () => {
  errorMessage.value = ''
  const parsed = parseOutputJson()
  if (!parsed) return

  jsonOutput.value = JSON.stringify(parsed, null, 2)
}

const minifyJsonOutput = () => {
  errorMessage.value = ''
  const parsed = parseOutputJson()
  if (!parsed) return

  jsonOutput.value = JSON.stringify(parsed)
}

const copyJsonOutput = async () => {
  errorMessage.value = ''
  if (jsonOutput.value.trim() === '') {
    errorMessage.value = '目前沒有可複製的 JSON 結果。'
    return
  }

  try {
    await navigator.clipboard.writeText(jsonOutput.value)
    copyStatus.value = 'copied'
    setTimeout(() => {
      copyStatus.value = 'none'
    }, 2000)
  } catch {
    errorMessage.value = '複製失敗：瀏覽器不支援或未授予權限。'
  }
}
</script>

<template>
  <div style="padding: 20px; width: 100%; box-sizing: border-box">
    <h2>CSV/XLSX 轉 JSON</h2>
    <p style="margin-bottom: 15px">上傳 csv 或 xlsx，轉換成 JSON。</p>

    <p
      v-if="errorMessage"
      style="color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap">
      <input
        type="file"
        accept=".csv,.xlsx"
        @change="handleFileChange"
        style="max-width: 340px"
      >
      <button
        class="tool-button"
        style="--tool-button-bg: #1565c0"
        :disabled="isConverting"
        @click="convertFileToJson"
      >
        {{ isConverting ? '轉換中...' : '轉換為 JSON' }}
      </button>
    </div>

    <p
      v-if="selectedFileName"
      style="margin-top: -4px; margin-bottom: 12px; color: #555; overflow-wrap: anywhere"
    >
      已選擇檔案：{{ selectedFileName }}
    </p>

    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px; flex-wrap: wrap">
      <label style="margin: 0">JSON 結果：</label>
      <button
        class="tool-button"
        style="--tool-button-bg: #2e7d32"
        @click="copyJsonOutput"
      >
        複製 JSON
      </button>
      <button
        class="tool-button"
        style="--tool-button-bg: #6a1b9a"
        @click="formatJsonOutput"
      >
        格式化 JSON
      </button>
      <button
        class="tool-button"
        style="--tool-button-bg: #ef6c00"
        @click="minifyJsonOutput"
      >
        壓縮 JSON
      </button>
      <span v-if="copyStatus === 'copied'" style="color: #2e7d32">已複製</span>
    </div>

    <textarea
      v-model="jsonOutput"
      readonly
      rows="18"
      placeholder="轉換結果會顯示在這裡"
      style="width: 100%; box-sizing: border-box; font-family: Consolas, monospace; font-size: 12px; padding: 10px"
    />
  </div>
</template>
