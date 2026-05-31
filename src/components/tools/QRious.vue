<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRious from 'qrious'
import jsQR from 'jsqr'
import { useHistoryStore } from '../../stores/history'

const historyStore = useHistoryStore()

const inputValue = ref('https://www.google.com/search?q=Vite+Vue+TS')
const decodeResult = ref<{ text: string; error: string } | null>(null)
const encodeError = ref('')
const saveStatus = ref<'none' | 'saved-encode' | 'saved-decode'>('none')
const lastDecodeSource = ref('')

const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const tempCanvasRef = ref<HTMLCanvasElement | null>(null)

let qriousInstance: QRious | null = null
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

const markSavedTransient = (status: 'saved-encode' | 'saved-decode') => {
  saveStatus.value = status

  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
  }

  saveStatusTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveStatusTimer = null
  }, 2000)
}

const generateQRCode = () => {
  if (!qrCanvasRef.value) {
    encodeError.value = '編碼失敗：Canvas 元素未準備好。'
    return
  }

  if (!inputValue.value) {
    encodeError.value = '請輸入要編碼的文字或網址。'
    return
  }

  encodeError.value = ''

  try {
    if (!qriousInstance) {
      qriousInstance = new QRious({
        element: qrCanvasRef.value,
        value: inputValue.value,
        size: 256,
        padding: 15,
        level: 'H',
      })
    } else {
      qriousInstance.set({ value: inputValue.value })
    }
  } catch {
    encodeError.value = '生成 QR Code 發生錯誤。'
  }
}

const decodeQRCode = (imageDataUrl: string) => {
  if (!tempCanvasRef.value) {
    decodeResult.value = { text: '', error: '解碼失敗：臨時 Canvas 未準備好。' }
    return
  }

  const tempCanvas = tempCanvasRef.value
  const ctx = tempCanvas.getContext('2d')
  if (!ctx) {
    return
  }

  const img = new Image()
  img.onload = () => {
    tempCanvas.width = img.width
    tempCanvas.height = img.height

    ctx.drawImage(img, 0, 0, img.width, img.height)

    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height)

    if (code) {
      decodeResult.value = { text: code.data, error: '' }
    } else {
      decodeResult.value = { text: '', error: '圖片中找不到 QR Code 或無法識別。' }
    }
  }

  img.onerror = () => {
    decodeResult.value = { text: '', error: '無法載入圖片檔案。' }
  }

  img.src = imageDataUrl
}

const handleFileUpload = (event: Event) => {
  decodeResult.value = null
  saveStatus.value = 'none'

  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  lastDecodeSource.value = file.name

  if (!file.type.startsWith('image/')) {
    decodeResult.value = { text: '', error: '請選擇有效的圖片檔案。' }
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    if (e.target?.result && typeof e.target.result === 'string') {
      decodeQRCode(e.target.result)
    }
  }
  reader.readAsDataURL(file)
}

const handleSaveEncode = () => {
  if (!inputValue.value.trim()) {
    encodeError.value = '尚無可儲存的編碼資料。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'qrious',
    action: 'encode',
    input: inputValue.value,
    output: inputValue.value,
    metadata: {
      mode: 'encode',
    },
  })

  markSavedTransient('saved-encode')
}

const handleSaveDecode = () => {
  if (!decodeResult.value) {
    return
  }

  const outputText = decodeResult.value.error ? `錯誤: ${decodeResult.value.error}` : decodeResult.value.text

  historyStore.saveHistoryItem({
    tool: 'qrious',
    action: 'decode',
    input: lastDecodeSource.value || '(未記錄檔名)',
    output: outputText,
    metadata: {
      mode: 'decode',
      source: lastDecodeSource.value || 'unknown',
      success: !decodeResult.value.error,
    },
  })

  markSavedTransient('saved-decode')
}

watch(inputValue, () => {
  saveStatus.value = 'none'
  generateQRCode()
})

onMounted(() => {
  generateQRCode()
})

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
  qriousInstance = null
})
</script>

<template>
  <div class="p-4 sm:p-8 bg-gray-50 min-h-screen font-inter">
    <h1 class="text-3xl font-extrabold text-indigo-700 mb-6 border-b pb-2">二維碼 (QR Code) 編碼/解碼器</h1>
    <p class="text-gray-600 mb-8">即時生成 QR Code 並支援上傳圖片解碼。</p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
      <div class="bg-white p-6 rounded-xl shadow-lg border border-indigo-100">
        <h2 class="text-xl font-bold text-gray-800 mb-4">1. 編碼 (Encode)</h2>

        <textarea
          v-model="inputValue"
          class="w-full p-3 border border-gray-300 rounded-lg resize-none h-32 mb-4 font-mono text-sm"
          placeholder="請輸入要編碼的文字、網址或資料..."
        />

        <div class="mb-4 flex items-center gap-3">
          <button
            @click="handleSaveEncode"
            class="tool-button"
            style="--tool-button-bg: #2e7d32"
          >
            儲存此次轉換
          </button>
          <span v-if="saveStatus === 'saved-encode'" class="text-sm text-green-700">✅ 編碼資料已儲存</span>
        </div>

        <p v-if="encodeError" class="text-red-500 text-sm mb-4 bg-red-50 p-2 rounded-lg">{{ encodeError }}</p>

        <div class="flex justify-center items-center p-4 bg-gray-100 rounded-lg">
          <div class="w-64 h-64 border-4 border-white shadow-2xl rounded-lg overflow-hidden">
            <canvas ref="qrCanvasRef" width="256" height="256" class="block w-full h-full" />
          </div>
        </div>
        <p class="mt-4 text-center text-gray-500 text-sm">QR Code 已即時生成</p>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-lg border border-green-100">
        <h2 class="text-xl font-bold text-gray-800 mb-4">2. 解碼 (Decode)</h2>

        <label class="block mb-4">
          <input type="file" accept="image/*" @change="handleFileUpload" class="block w-full text-sm text-gray-500" />
        </label>

        <div class="mt-6 p-4 bg-gray-100 rounded-lg min-h-[150px]">
          <h3 class="text-lg font-semibold text-gray-700 mb-2">解碼結果：</h3>
          <p v-if="decodeResult && decodeResult.error" class="text-red-600 bg-red-100 p-3 rounded-lg">錯誤: {{ decodeResult.error }}</p>
          <div v-else-if="decodeResult && decodeResult.text" class="break-all bg-green-100 p-3 rounded-lg">
            <p class="font-mono text-green-800">{{ decodeResult.text }}</p>
          </div>
          <p v-else class="text-gray-500">請上傳包含 QR Code 的圖片來進行解碼。</p>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <button
            @click="handleSaveDecode"
            :disabled="!decodeResult"
            class="tool-button"
            style="--tool-button-bg: #2e7d32"
          >
            儲存此次轉換
          </button>
          <span v-if="saveStatus === 'saved-decode'" class="text-sm text-green-700">✅ 解碼資料已儲存</span>
        </div>
      </div>
    </div>

    <canvas ref="tempCanvasRef" width="1" height="1" style="display: none" aria-hidden="true" />
  </div>
</template>
