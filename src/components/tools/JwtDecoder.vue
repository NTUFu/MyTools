<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { DocumentDuplicateIcon } from '@heroicons/vue/24/outline'
import { useHistoryStore } from '../../stores/history'

type JwtObject = Record<string, unknown>

type CopyStatus = 'none' | 'header' | 'payload' | 'signature'

interface DecodedJwt {
  normalizedToken: string
  header: JwtObject
  payload: JwtObject
  signature: string
}

interface LastJwtConversion {
  input: string
  output: string
  metadata: Record<string, string | number | boolean | null>
}

const decodeBase64UrlSegment = (segment: string): string => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4)) % 4
  const padded = normalized + '='.repeat(paddingLength)

  const decodedBinary = atob(padded)
  const bytes = Uint8Array.from(decodedBinary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const parseJwtToken = (rawToken: string): DecodedJwt => {
  const trimmedInput = rawToken.trim()
  const token = trimmedInput.toLowerCase().startsWith('bearer ')
    ? trimmedInput.slice(7).trim()
    : trimmedInput

  if (!token) {
    throw new Error('請先輸入 JWT Token。')
  }

  const parts = token.split('.')
  if (parts.length < 2 || parts.length > 3) {
    throw new Error('JWT 格式錯誤：應為 header.payload 或 header.payload.signature。')
  }

  const [headerPart, payloadPart, signaturePart = ''] = parts

  if (!headerPart || !payloadPart) {
    throw new Error('JWT 格式錯誤：header 或 payload 內容為空。')
  }

  try {
    const header = JSON.parse(decodeBase64UrlSegment(headerPart)) as JwtObject
    const payload = JSON.parse(decodeBase64UrlSegment(payloadPart)) as JwtObject

    return {
      normalizedToken: token,
      header,
      payload,
      signature: signaturePart,
    }
  } catch {
    throw new Error('JWT 解碼失敗：請確認 token 為有效的 Base64URL JSON。')
  }
}

const getNumericClaim = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const formatUnixTimestamp = (unixSeconds: number): string => {
  try {
    return new Date(unixSeconds * 1000).toLocaleString('zh-TW', { hour12: false })
  } catch {
    return '無法解析時間'
  }
}

const buildHistoryOutput = (decoded: DecodedJwt): string => {
  return JSON.stringify(
    {
      header: decoded.header,
      payload: decoded.payload,
      signature: decoded.signature,
    },
    null,
    2,
  )
}

const historyStore = useHistoryStore()

const tokenInput = ref('')
const decodedJwt = ref<DecodedJwt | null>(null)
const errorMessage = ref('')
const saveStatus = ref<'none' | 'saved'>('none')
const copyStatus = ref<CopyStatus>('none')
const lastConversion = ref<LastJwtConversion | null>(null)

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
  saveStatus.value = 'none'
  copyStatus.value = 'none'
}

const markCopiedTransient = (target: Exclude<CopyStatus, 'none'>) => {
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
  }, 2000)
}

const headerText = computed(() => (decodedJwt.value ? JSON.stringify(decodedJwt.value.header, null, 2) : ''))
const payloadText = computed(() => (decodedJwt.value ? JSON.stringify(decodedJwt.value.payload, null, 2) : ''))
const signatureText = computed(() => decodedJwt.value?.signature ?? '')

const exp = computed(() => (decodedJwt.value ? getNumericClaim(decodedJwt.value.payload['exp']) : null))
const iat = computed(() => (decodedJwt.value ? getNumericClaim(decodedJwt.value.payload['iat']) : null))
const nbf = computed(() => (decodedJwt.value ? getNumericClaim(decodedJwt.value.payload['nbf']) : null))

const expirationStatus = computed(() => {
  if (!decodedJwt.value) {
    return '尚未解碼'
  }

  if (exp.value === null) {
    return '無 exp 欄位'
  }

  const remainingMs = exp.value * 1000 - Date.now()
  if (remainingMs <= 0) {
    return '已過期'
  }

  const remainingMinutes = Math.floor(remainingMs / 1000 / 60)
  return `有效中（約剩 ${remainingMinutes} 分鐘）`
})

const handleDecode = () => {
  errorMessage.value = ''
  resetUiStatus()

  try {
    const decoded = parseJwtToken(tokenInput.value)
    const algorithm = typeof decoded.header.alg === 'string' ? decoded.header.alg : null
    const tokenType = typeof decoded.header.typ === 'string' ? decoded.header.typ : null
    const expUnix = getNumericClaim(decoded.payload.exp)

    const metadata: Record<string, string | number | boolean | null> = {
      alg: algorithm,
      typ: tokenType,
      hasSignature: decoded.signature !== '',
    }

    if (expUnix !== null) {
      metadata.exp = expUnix
      metadata.expAt = formatUnixTimestamp(expUnix)
      metadata.isExpired = Date.now() >= expUnix * 1000
    }

    decodedJwt.value = decoded
    lastConversion.value = {
      input: decoded.normalizedToken,
      output: buildHistoryOutput(decoded),
      metadata,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JWT 解碼失敗。'
    decodedJwt.value = null
    lastConversion.value = null
    errorMessage.value = message
  }
}

const handleCopy = async (text: string, target: Exclude<CopyStatus, 'none'>, emptyMessage = '尚無可複製內容，請先解碼 JWT。') => {
  errorMessage.value = ''

  if (text.trim() === '') {
    errorMessage.value = emptyMessage
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    markCopiedTransient(target)
  } catch {
    errorMessage.value = '複製失敗：瀏覽器不支援或未授予權限。'
  }
}

const handleSaveCurrent = () => {
  errorMessage.value = ''

  if (!lastConversion.value) {
    errorMessage.value = '尚無可儲存資料，請先執行一次 JWT 解碼。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'jwt-decoder',
    action: 'decode',
    input: lastConversion.value.input,
    output: lastConversion.value.output,
    metadata: lastConversion.value.metadata,
  })

  markSavedTransient()
}

onBeforeUnmount(() => {
  clearStatusTimer('copy')
  clearStatusTimer('save')
})
</script>

<template>
  <div style="padding: 20px">
    <h2>JWT Decoder</h2>
    <p style="color: #666; margin-bottom: 15px">
      貼上 JWT（支援 Bearer 前綴），可解析 Header/Payload 與時間欄位。此工具僅解碼，不驗證簽章。
    </p>

    <p v-if="errorMessage" style="color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px">
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center">
      <button
        @click="handleDecode"
        class="tool-button"
        style="--tool-button-bg: #1a73e8"
      >
        解碼 JWT
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

    <div style="display: flex; gap: 20px; min-height: 560px">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">
        <label for="jwtInput" style="margin-bottom: 6px; font-weight: 700">JWT Token 輸入區</label>
        <textarea
          id="jwtInput"
          v-model="tokenInput"
          rows="16"
          placeholder="請貼上 JWT，例如：eyJhbGciOi..."
          style="flex: 1; width: 100%; padding: 10px; box-sizing: border-box; font-family: Consolas, monospace; font-size: 14px; resize: none; border: 1px solid #ccc; border-radius: 5px"
          @input="errorMessage = ''; resetUiStatus()"
        />
      </div>

      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px">
        <div style="border: 1px solid #ddd; border-radius: 8px; background-color: #fff; padding: 10px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
            <span style="font-weight: 700">Header</span>
            <div style="display: flex; align-items: center; gap: 8px">
              <span v-if="copyStatus === 'header'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
              <button
                @click="handleCopy(headerText, 'header')"
                class="tool-button tool-button--compact"
                style="--tool-button-bg: #ffffff; --tool-button-text: #37474f; --tool-button-border: #cfd8dc; --tool-button-shadow: none"
              >
                <DocumentDuplicateIcon style="width: 13px; height: 13px" />
                <span>複製</span>
              </button>
            </div>
          </div>
          <pre style="margin: 0; max-height: 140px; overflow: auto; background-color: #f6f8fa; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-word">{{ decodedJwt ? headerText : '尚未解碼' }}</pre>
        </div>

        <div style="border: 1px solid #ddd; border-radius: 8px; background-color: #fff; padding: 10px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
            <span style="font-weight: 700">Payload</span>
            <div style="display: flex; align-items: center; gap: 8px">
              <span v-if="copyStatus === 'payload'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
              <button
                @click="handleCopy(payloadText, 'payload')"
                class="tool-button tool-button--compact"
                style="--tool-button-bg: #ffffff; --tool-button-text: #37474f; --tool-button-border: #cfd8dc; --tool-button-shadow: none"
              >
                <DocumentDuplicateIcon style="width: 13px; height: 13px" />
                <span>複製</span>
              </button>
            </div>
          </div>
          <pre style="margin: 0; max-height: 180px; overflow: auto; background-color: #f6f8fa; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-word">{{ decodedJwt ? payloadText : '尚未解碼' }}</pre>
        </div>

        <div style="border: 1px solid #ddd; border-radius: 8px; background-color: #fff; padding: 10px">
          <span style="font-weight: 700; margin-bottom: 6px; display: block">時間欄位解析</span>
          <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; font-size: 14px">
            <strong>exp</strong>
            <span>{{ exp !== null ? `${exp} (${formatUnixTimestamp(exp)})` : '—' }}</span>
            <strong>iat</strong>
            <span>{{ iat !== null ? `${iat} (${formatUnixTimestamp(iat)})` : '—' }}</span>
            <strong>nbf</strong>
            <span>{{ nbf !== null ? `${nbf} (${formatUnixTimestamp(nbf)})` : '—' }}</span>
            <strong>狀態</strong>
            <span>{{ expirationStatus }}</span>
          </div>
        </div>

        <div style="border: 1px solid #ddd; border-radius: 8px; background-color: #fff; padding: 10px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
            <span style="font-weight: 700">Signature</span>
            <div style="display: flex; align-items: center; gap: 8px">
              <span v-if="copyStatus === 'signature'" style="color: #2e7d32; font-size: 12px">✅ 已複製</span>
              <button
                @click="handleCopy(signatureText, 'signature', '此 JWT 沒有簽章段可複製。')"
                class="tool-button tool-button--compact"
                style="--tool-button-bg: #ffffff; --tool-button-text: #37474f; --tool-button-border: #cfd8dc; --tool-button-shadow: none"
              >
                <DocumentDuplicateIcon style="width: 13px; height: 13px" />
                <span>複製</span>
              </button>
            </div>
          </div>
          <pre style="margin: 0; max-height: 80px; overflow: auto; background-color: #f6f8fa; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-word">{{ decodedJwt ? (decodedJwt.signature || '(無簽章段)') : '尚未解碼' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
