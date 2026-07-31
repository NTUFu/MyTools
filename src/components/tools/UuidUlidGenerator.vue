<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

type GeneratorType = 'uuid-v4' | 'uuid-v7' | 'ulid'

const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_COUNT = 200

const historyStore = useHistoryStore()

const generatorType = ref<GeneratorType>('uuid-v4')
const count = ref(10)
const prefix = ref('')
const suffix = ref('')
const generatedItems = ref<string[]>([])
const errorMessage = ref('')
const copyStatus = ref<'none' | 'copied'>('none')
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

const markCopied = () => {
  copyStatus.value = 'copied'
  clearTimer('copy')
  copyTimer = setTimeout(() => {
    copyStatus.value = 'none'
    copyTimer = null
  }, 1800)
}

const markSaved = () => {
  saveStatus.value = 'saved'
  clearTimer('save')
  saveTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveTimer = null
  }, 1800)
}

const getRandomBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const formatUuidFromBytes = (bytes: Uint8Array): string => {
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const generateUuidV4 = (): string => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = getRandomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return formatUuidFromBytes(bytes)
}

const generateUuidV7 = (): string => {
  const bytes = getRandomBytes(16)
  let timestamp = Date.now()

  // UUID v7 前 48 bits 為 Unix 毫秒時間，保留時間序特性。
  for (let index = 5; index >= 0; index--) {
    bytes[index] = timestamp & 0xff
    timestamp = Math.floor(timestamp / 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return formatUuidFromBytes(bytes)
}

const encodeTime = (timeMs: number): string => {
  let value = timeMs
  let output = ''

  for (let index = 0; index < 10; index++) {
    output = CROCKFORD32[value % 32] + output
    value = Math.floor(value / 32)
  }

  return output
}

const encodeRandom = (bytes: Uint8Array): string => {
  let bits = 0
  let bitBuffer = 0
  let output = ''

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      output += CROCKFORD32[(bitBuffer >> bits) & 31]
    }
  }

  if (bits > 0) {
    output += CROCKFORD32[(bitBuffer << (5 - bits)) & 31]
  }

  return output.slice(0, 16)
}

const generateUlid = (): string => {
  const timePart = encodeTime(Date.now())
  const randomPart = encodeRandom(getRandomBytes(10))
  return `${timePart}${randomPart}`
}

const createValue = (): string => {
  if (generatorType.value === 'uuid-v4') {
    return generateUuidV4()
  }

  if (generatorType.value === 'uuid-v7') {
    return generateUuidV7()
  }

  return generateUlid()
}

const handleGenerate = () => {
  clearStatus()

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    errorMessage.value = '目前瀏覽器不支援加密隨機數產生。'
    generatedItems.value = []
    return
  }

  const safeCount = Number.isFinite(count.value) ? Math.trunc(count.value) : 0
  if (safeCount < 1 || safeCount > MAX_COUNT) {
    errorMessage.value = `數量需介於 1 到 ${MAX_COUNT}。`
    generatedItems.value = []
    return
  }

  generatedItems.value = Array.from({ length: safeCount }, () => `${prefix.value}${createValue()}${suffix.value}`)
}

const handleCopyAll = async () => {
  if (generatedItems.value.length === 0) {
    errorMessage.value = '尚無可複製內容，請先產生。'
    return
  }

  try {
    await navigator.clipboard.writeText(generatedItems.value.join('\n'))
    markCopied()
  } catch {
    errorMessage.value = '複製失敗：請確認剪貼簿權限。'
  }
}

const handleSave = () => {
  clearStatus()

  if (generatedItems.value.length === 0) {
    errorMessage.value = '尚無可儲存結果，請先產生。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'uuid-ulid-generator',
    action: 'generate',
    input: JSON.stringify({
      type: generatorType.value,
      count: generatedItems.value.length,
      prefix: prefix.value,
      suffix: suffix.value,
    }),
    output: generatedItems.value.join('\n'),
    metadata: {
      type: generatorType.value,
      count: generatedItems.value.length,
    },
  })

  markSaved()
}

const handleClear = () => {
  generatorType.value = 'uuid-v4'
  count.value = 10
  prefix.value = ''
  suffix.value = ''
  generatedItems.value = []
  clearStatus()
}

const heading = computed(() => {
  if (generatorType.value === 'uuid-v4') {
    return 'UUID v4'
  }

  if (generatorType.value === 'uuid-v7') {
    return 'UUID v7'
  }

  return 'ULID'
})

onBeforeUnmount(() => {
  clearTimer('copy')
  clearTimer('save')
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px">
    <h2 style="margin: 0">UUID / ULID Generator</h2>

    <p style="margin: 0; color: #666">
      支援 UUID v4、UUID v7 與 ULID，最多一次產生 {{ MAX_COUNT }} 筆。
    </p>

    <p
      v-if="errorMessage"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px">
      <label style="display: grid; gap: 6px">
        <span>種類</span>
        <select v-model="generatorType" style="padding: 8px; border: 1px solid #ccc; border-radius: 6px" @change="saveStatus = 'none'">
          <option value="uuid-v4">UUID v4</option>
          <option value="uuid-v7">UUID v7</option>
          <option value="ulid">ULID</option>
        </select>
      </label>

      <label style="display: grid; gap: 6px">
        <span>數量（1-{{ MAX_COUNT }}）</span>
        <input v-model.number="count" type="number" min="1" :max="MAX_COUNT" style="padding: 8px; border: 1px solid #ccc; border-radius: 6px" @input="saveStatus = 'none'">
      </label>

      <label style="display: grid; gap: 6px">
        <span>Prefix（選填）</span>
        <input v-model="prefix" type="text" placeholder="ex: item-" style="padding: 8px; border: 1px solid #ccc; border-radius: 6px" @input="saveStatus = 'none'">
      </label>

      <label style="display: grid; gap: 6px">
        <span>Suffix（選填）</span>
        <input v-model="suffix" type="text" placeholder="ex: -dev" style="padding: 8px; border: 1px solid #ccc; border-radius: 6px" @input="saveStatus = 'none'">
      </label>
    </div>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="handleGenerate">產生</button>
      <button class="tool-button" style="--tool-button-bg: #455a64" @click="handleCopyAll">複製全部</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleClear">清空</button>
      <span v-if="copyStatus === 'copied'" style="color: #1a73e8">✅ 已複製</span>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div style="border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; display: grid; gap: 8px">
      <strong>{{ heading }} 結果（{{ generatedItems.length }}）</strong>
      <textarea
        :value="generatedItems.join('\n')"
        rows="14"
        readonly
        style="width: 100%; box-sizing: border-box; font-family: Consolas, monospace; padding: 10px; border: 1px solid #ccc; border-radius: 6px; background: #fff"
      />
    </div>
  </div>
</template>
