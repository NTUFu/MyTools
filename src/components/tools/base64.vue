<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useHistoryStore } from '../../stores/history'

type CopyStatus = 'none' | 'plain' | 'base64'
type Base64ConversionAction = 'encode' | 'decode'

interface LastBase64Conversion {
  action: Base64ConversionAction
  input: string
  output: string
  encoding: 'utf-8' | 'ascii'
}

const utf8ToBase64 = (str: string): string => {
  const utf8Bytes = new TextEncoder().encode(str)
  const latin1String = String.fromCharCode.apply(null, Array.from(utf8Bytes))
  return btoa(latin1String)
}

const base64ToUtf8 = (str: string): string => {
  const latin1String = atob(str)
  const utf8Bytes = Uint8Array.from(latin1String, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(utf8Bytes)
}

const historyStore = useHistoryStore()

const plainText = ref('')
const base64Text = ref('')
const error = ref('')
const encoding = ref<'utf-8' | 'ascii'>('utf-8')
const copyStatus = ref<CopyStatus>('none')
const saveStatus = ref<'none' | 'saved'>('none')
const lastConversion = ref<LastBase64Conversion | null>(null)

let copyStatusTimer: ReturnType<typeof setTimeout> | null = null
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

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

const resetUiStatus = () => {
  error.value = ''
  copyStatus.value = 'none'
  saveStatus.value = 'none'
}

const markCopiedTransient = (type: CopyStatus) => {
  copyStatus.value = type
  clearStatusTimer('copy')
  copyStatusTimer = setTimeout(() => {
    copyStatus.value = 'none'
    copyStatusTimer = null
  }, 2000)
}

const markSavedTransient = () => {
  saveStatus.value = 'saved'
  clearStatusTimer('save')
  saveStatusTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveStatusTimer = null
  }, 2000)
}

const handlePlainInput = () => {
  base64Text.value = ''
  lastConversion.value = null
  resetUiStatus()
}

const handleBase64Input = () => {
  plainText.value = ''
  lastConversion.value = null
  resetUiStatus()
}

const handleConvert = () => {
  resetUiStatus()

  let encoder: (str: string) => string
  let decoder: (str: string) => string

  if (encoding.value === 'utf-8') {
    encoder = utf8ToBase64
    decoder = base64ToUtf8
  } else {
    encoder = btoa
    decoder = atob
  }

  if (plainText.value.trim() !== '') {
    try {
      const encoded = encoder(plainText.value)
      base64Text.value = encoded
      lastConversion.value = {
        action: 'encode',
        input: plainText.value,
        output: encoded,
        encoding: encoding.value,
      }
    } catch {
      error.value = '編碼失敗：請檢查輸入或切換編碼方式。'
      lastConversion.value = null
    }
    return
  }

  if (base64Text.value.trim() !== '') {
    try {
      if (!/^[A-Za-z0-9+/=]*$/.test(base64Text.value)) {
        throw new Error('無效的 Base64 字符串')
      }

      const decoded = decoder(base64Text.value)
      plainText.value = decoded
      lastConversion.value = {
        action: 'decode',
        input: base64Text.value,
        output: decoded,
        encoding: encoding.value,
      }
    } catch {
      error.value = '解碼失敗：請檢查 Base64 格式是否正確，或切換編碼方式。'
      lastConversion.value = null
    }
    return
  }

  error.value = '請在任一輸入框中輸入內容。'
  lastConversion.value = null
}

const handleSaveCurrent = () => {
  error.value = ''

  if (!lastConversion.value) {
    error.value = '尚無可儲存的轉換結果，請先執行一次轉換。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'base64',
    action: lastConversion.value.action,
    input: lastConversion.value.input,
    output: lastConversion.value.output,
    metadata: {
      encoding: lastConversion.value.encoding,
    },
  })

  markSavedTransient()
}

const handleCopy = async (text: string, type: CopyStatus) => {
  if (text.trim() === '') {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    markCopiedTransient(type)
  } catch {
    error.value = '複製失敗：瀏覽器不支援或未授予權限。'
  }
}

onBeforeUnmount(() => {
  clearStatusTimer('copy')
  clearStatusTimer('save')
})
</script>

<template>
  <div style="padding: 20px">
    <h2>Base64 編碼/解碼工具</h2>

    <p v-if="error" style="color: red; border: 1px solid red; padding: 10px">
      {{ error }}
    </p>

    <div style="margin-bottom: 15px">
      <label for="encodingSelect" style="margin-right: 10px; font-weight: bold">選擇字符編碼:</label>
      <select
        id="encodingSelect"
        v-model="encoding"
        @change="saveStatus = 'none'"
        style="padding: 8px; border-radius: 4px"
      >
        <option value="utf-8">UTF-8 (推薦, 支援中文)</option>
        <option value="ascii">ASCII (僅支援英文/符號)</option>
      </select>
    </div>

    <div style="margin-bottom: 15px; position: relative">
      <label for="plainText">明文 (Plain Text):</label>

      <button
        @click="handleCopy(plainText, 'plain')"
        class="tool-button tool-button--compact"
        style="position: absolute; top: 35px; right: 10px; z-index: 10; opacity: 0.85; --tool-button-bg: #007bff"
      >
        複製明文
      </button>

      <span
        v-if="copyStatus === 'plain'"
        style="position: absolute; top: 35px; right: 120px; z-index: 10; color: #1a73e8; background-color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; box-shadow: 0 0 5px rgba(0,0,0,0.1)"
      >
        ✅ 已複製！
      </span>

      <textarea
        id="plainText"
        v-model="plainText"
        rows="5"
        placeholder="在這裡輸入明文..."
        style="width: 100%; padding: 10px; padding-right: 120px; box-sizing: border-box"
        @input="handlePlainInput"
      />
    </div>

    <div style="display: flex; gap: 10px; align-items: center">
      <button
        @click="handleConvert"
        class="tool-button"
        style="--tool-button-bg: #1a73e8"
      >
        轉換 Base64 ↔ 明文 (使用 {{ encoding.toUpperCase() }})
      </button>

      <button
        @click="handleSaveCurrent"
        class="tool-button"
        style="--tool-button-bg: #2e7d32"
      >
        儲存此次轉換
      </button>

      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div style="margin-top: 20px; position: relative">
      <label for="base64Text">Base64 文本:</label>

      <button
        @click="handleCopy(base64Text, 'base64')"
        class="tool-button tool-button--compact"
        style="position: absolute; top: 35px; right: 10px; z-index: 10; opacity: 0.85; --tool-button-bg: #007bff"
      >
        複製 Base64
      </button>

      <span
        v-if="copyStatus === 'base64'"
        style="position: absolute; top: 35px; right: 120px; z-index: 10; color: #1a73e8; background-color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; box-shadow: 0 0 5px rgba(0,0,0,0.1)"
      >
        ✅ 已複製！
      </span>

      <textarea
        id="base64Text"
        v-model="base64Text"
        rows="5"
        placeholder="在這裡輸入 Base64 進行解碼..."
        style="width: 100%; padding: 10px; padding-right: 120px; box-sizing: border-box"
        @input="handleBase64Input"
      />
    </div>
  </div>
</template>
