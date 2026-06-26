<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

type HashName = 'md5' | 'sha1' | 'sha256' | 'sha512'
type CopyStatus = 'none' | HashName

interface HashResult {
  md5: string
  sha1: string
  sha256: string
  sha512: string
}

const MAX_FILE_SIZE = 2 * 1024 * 1024

const historyStore = useHistoryStore()

const inputText = ref('')
const loadedFileName = ref('')
const errorMessage = ref('')
const hashResult = ref<HashResult | null>(null)
const copyStatus = ref<CopyStatus>('none')
const saveStatus = ref<'none' | 'saved'>('none')

let copyStatusTimer: ReturnType<typeof setTimeout> | null = null
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

const md5Shift = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const md5K = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0)

const clearStatusTimer = (type: 'copy' | 'save') => {
  if (type === 'copy') {
    if (copyStatusTimer) {
      clearTimeout(copyStatusTimer)
      copyStatusTimer = null
    }
    return
  }

  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
}

const markCopiedTransient = (target: HashName) => {
  copyStatus.value = target
  clearStatusTimer('copy')
  copyStatusTimer = setTimeout(() => {
    copyStatus.value = 'none'
    copyStatusTimer = null
  }, 1800)
}

const markSavedTransient = () => {
  saveStatus.value = 'saved'
  clearStatusTimer('save')
  saveStatusTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveStatusTimer = null
  }, 1800)
}

const resetUiState = () => {
  errorMessage.value = ''
  saveStatus.value = 'none'
  copyStatus.value = 'none'
}

const leftRotate = (value: number, shift: number): number => {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

const wordToHexLe = (word: number): string => {
  let hex = ''
  for (let i = 0; i < 4; i++) {
    const byte = (word >>> (i * 8)) & 0xff
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

const md5FromText = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  const bitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 8) >> 6) + 1) * 64
  const padded = new Uint8Array(paddedLength)

  padded.set(bytes)
  padded[bytes.length] = 0x80

  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, bitLength >>> 0, true)
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const m = new Uint32Array(16)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      m[i] = view.getUint32(offset + i * 4, true)
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f = 0
      let g = 0

      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      const nextD = d
      d = c
      c = b

      const sum = (a + f + md5K[i] + m[g]) >>> 0
      b = (b + leftRotate(sum, md5Shift[i])) >>> 0
      a = nextD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return `${wordToHexLe(a0)}${wordToHexLe(b0)}${wordToHexLe(c0)}${wordToHexLe(d0)}`
}

const digestText = async (algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest(algorithm, bytes)
  const hashBytes = new Uint8Array(buffer)
  return Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const handleFileUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  resetUiState()

  if (file.size > MAX_FILE_SIZE) {
    errorMessage.value = `檔案過大，請使用小於 ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB 的檔案。`
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (loadEvent) => {
    inputText.value = String(loadEvent.target?.result ?? '')
    loadedFileName.value = file.name
    hashResult.value = null
    input.value = ''
  }
  reader.onerror = () => {
    errorMessage.value = '讀取檔案失敗，請確認檔案為文字格式。'
    input.value = ''
  }
  reader.readAsText(file, 'UTF-8')
}

const handleComputeHashes = async () => {
  resetUiState()

  if (inputText.value.trim() === '') {
    hashResult.value = null
    errorMessage.value = '請先輸入文字或載入檔案。'
    return
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    hashResult.value = null
    errorMessage.value = '目前瀏覽器不支援 Web Crypto，無法計算 SHA 雜湊。'
    return
  }

  try {
    const [sha1, sha256, sha512] = await Promise.all([
      digestText('SHA-1', inputText.value),
      digestText('SHA-256', inputText.value),
      digestText('SHA-512', inputText.value),
    ])

    hashResult.value = {
      md5: md5FromText(inputText.value),
      sha1,
      sha256,
      sha512,
    }
  } catch {
    hashResult.value = null
    errorMessage.value = '雜湊計算失敗，請稍後重試。'
  }
}

const handleCopy = async (type: HashName) => {
  if (!hashResult.value) {
    errorMessage.value = '尚無可複製內容，請先產生雜湊值。'
    return
  }

  try {
    await navigator.clipboard.writeText(hashResult.value[type])
    markCopiedTransient(type)
  } catch {
    errorMessage.value = '複製失敗：瀏覽器不支援或未授予權限。'
  }
}

const handleSaveCurrent = () => {
  resetUiState()

  if (!hashResult.value) {
    errorMessage.value = '尚無可儲存結果，請先產生雜湊值。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'hash-generator',
    action: 'hash',
    input: inputText.value,
    output: JSON.stringify(hashResult.value, null, 2),
    metadata: {
      fileName: loadedFileName.value || null,
      inputLength: inputText.value.length,
    },
  })

  markSavedTransient()
}

const handleClear = () => {
  inputText.value = ''
  loadedFileName.value = ''
  hashResult.value = null
  resetUiState()
}

const resultRows = computed(() => {
  if (!hashResult.value) {
    return [] as Array<{ key: HashName; label: string; value: string }>
  }

  return [
    { key: 'md5' as const, label: 'MD5', value: hashResult.value.md5 },
    { key: 'sha1' as const, label: 'SHA-1', value: hashResult.value.sha1 },
    { key: 'sha256' as const, label: 'SHA-256', value: hashResult.value.sha256 },
    { key: 'sha512' as const, label: 'SHA-512', value: hashResult.value.sha512 },
  ]
})

onBeforeUnmount(() => {
  clearStatusTimer('copy')
  clearStatusTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">Hash Generator</h2>

    <p style="margin: 0; color: #666">
      產生 MD5、SHA-1、SHA-256、SHA-512。MD5 只建議用於檔案校驗或相容需求，不適合安全用途。
    </p>

    <p
      v-if="errorMessage"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <label style="cursor: pointer; line-height: 1">
        <input type="file" style="display: none" @change="handleFileUpload">
        <span class="tool-button tool-button--compact" style="--tool-button-bg: #455a64; display: inline-block">載入檔案</span>
      </label>
      <span v-if="loadedFileName" style="font-size: 0.9em; color: #666">檔案：{{ loadedFileName }}</span>
    </div>

    <textarea
      v-model="inputText"
      rows="8"
      placeholder="輸入文字或載入檔案內容..."
      spellcheck="false"
      style="width: 100%; box-sizing: border-box; font-family: Consolas, monospace; padding: 10px"
      @input="saveStatus = 'none'"
    />

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleComputeHashes">產生 Hash</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSaveCurrent">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div v-if="hashResult" style="display: flex; flex-direction: column; gap: 10px">
      <div
        v-for="row in resultRows"
        :key="row.key"
        style="border: 1px solid #d6d9de; border-radius: 6px; padding: 10px; background-color: #fafbfc"
      >
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px">
          <strong>{{ row.label }}</strong>
          <div style="display: flex; align-items: center; gap: 8px">
            <span v-if="copyStatus === row.key" style="font-size: 12px; color: #2e7d32">✅ 已複製</span>
            <button class="tool-button tool-button--compact" style="--tool-button-bg: #546e7a" @click="handleCopy(row.key)">複製</button>
          </div>
        </div>
        <pre
          style="margin: 0; white-space: pre-wrap; word-break: break-all; background-color: #fff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px"
        >{{ row.value }}</pre>
      </div>
    </div>
  </div>
</template>
