<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'
import { useHistoryStore } from '../../stores/history'
import JsonTreeNode from './JsonTreeNode.vue'

const INDENT_SPACES = 2

type CopyStatus = 'none' | 'copied'
type JsonConversionAction = 'format' | 'minify'

interface LastJsonConversion {
  action: JsonConversionAction
  input: string
  output: string
}

interface JsonErrorDetailsResult {
  details: string[]
  line: number | null
  column: number | null
  highlightLine: number | null
  highlightColumn: number | null
  highlightLength: number
}

const historyStore = useHistoryStore()

const jsonInput = ref('')
const error = ref('')
const errorDetails = ref<string[]>([])
const hasJsonSyntaxError = ref(false)
const errorLineNumber = ref<number | null>(null)
const errorColumnNumber = ref<number | null>(null)
const errorHighlightLength = ref(1)
const copyStatus = ref<CopyStatus>('none')
const parsedJson = ref<unknown | null>(null)
const searchKeyword = ref('')
const expandAllTree = ref(false)
const lastConversion = ref<LastJsonConversion | null>(null)
const saveStatus = ref<'none' | 'saved'>('none')
const lineNumberContainer = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

let copyStatusTimer: ReturnType<typeof setTimeout> | null = null
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

const TEXTAREA_LINE_HEIGHT = 18
const TEXTAREA_PADDING_TOP = 5
const TEXTAREA_PADDING_LEFT = 5

const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLowerCase())

const lineNumbers = computed(() => {
  const total = Math.max(jsonInput.value.split('\n').length, 1)
  return Array.from({ length: total }, (_, i) => i + 1)
})

const errorHighlightStyle = computed<CSSProperties>(() => {
  if (!hasJsonSyntaxError.value || errorLineNumber.value === null) {
    return {
      backgroundImage: 'none',
      backgroundSize: 'auto',
      backgroundPosition: '0 0',
      backgroundRepeat: 'no-repeat',
    }
  }

  const top = TEXTAREA_PADDING_TOP + (errorLineNumber.value - 1) * TEXTAREA_LINE_HEIGHT
  const isSingleLineInput = lineNumbers.value.length === 1

  if (isSingleLineInput && errorColumnNumber.value !== null) {
    const colIndex = Math.max(errorColumnNumber.value - 1, 0)
    const highlightChars = Math.max(errorHighlightLength.value, 1)
    return {
      backgroundImage: 'linear-gradient(#FFE5E5, #FFE5E5)',
      backgroundSize: `${highlightChars}ch ${TEXTAREA_LINE_HEIGHT}px`,
      backgroundPosition: `calc(${TEXTAREA_PADDING_LEFT}px + ${colIndex}ch) ${top}px`,
      backgroundRepeat: 'no-repeat',
    }
  }

  return {
    backgroundImage: 'linear-gradient(#FFE5E5, #FFE5E5)',
    backgroundSize: `calc(100% - ${TEXTAREA_PADDING_LEFT * 2}px) ${TEXTAREA_LINE_HEIGHT}px`,
    backgroundPosition: `${TEXTAREA_PADDING_LEFT}px ${top}px`,
    backgroundRepeat: 'no-repeat',
  }
})

const editorWrapperStyle = computed<CSSProperties>(() => ({
  display: 'flex',
  border: hasJsonSyntaxError.value ? '1px solid #D8000C' : '1px solid #ccc',
  borderRadius: '5px',
  overflow: 'hidden',
  marginBottom: '0',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  height: '45vh',
}))

const jsonInputStyle = computed<CSSProperties>(() => ({
  flex: '1 1 0',
  minWidth: 0,
  maxWidth: '100%',
  padding: '5px',
  boxSizing: 'border-box',
  fontFamily: 'Consolas, monospace',
  fontSize: '12px',
  lineHeight: `${TEXTAREA_LINE_HEIGHT}px`,
  color: '#1f2328',
  caretColor: '#1f2328',
  border: 'none',
  outline: 'none',
  resize: 'none',
  overflow: 'auto',
  backgroundColor: '#fff',
  backgroundAttachment: 'local',
  ...errorHighlightStyle.value,
}))

const getLineNumberItemStyle = (line: number): CSSProperties => ({
  height: `${TEXTAREA_LINE_HEIGHT}px`,
  lineHeight: `${TEXTAREA_LINE_HEIGHT}px`,
  padding: '0 4px',
  backgroundColor: line === errorLineNumber.value ? '#FFE5E5' : 'transparent',
  color: line === errorLineNumber.value ? '#D8000C' : '#6b7280',
  fontWeight: line === errorLineNumber.value ? '600' : '400',
})

const getLineAndColumnByPosition = (source: string, position: number): { line: number; column: number } => {
  const safePosition = Math.max(0, Math.min(position, source.length))
  const lines = source.slice(0, safePosition).split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

const findLikelyUnquotedKey = (source: string, position: number): { key: string; start: number } | null => {
  const regex = /(^|[{,]\s*)(?!")([A-Za-z_$][\w$-]*)"?\s*:/gm
  let match: RegExpExecArray | null
  let best: { key: string; start: number } | null = null
  let bestScore = Number.POSITIVE_INFINITY

  while ((match = regex.exec(source)) !== null) {
    const prefix = match[1] ?? ''
    const key = match[2]
    const start = match.index + prefix.length
    const score = start >= position ? start - position : (position - start) + 40

    if (score < bestScore) {
      bestScore = score
      best = { key, start }
    }
  }

  if (!best) {
    return null
  }

  return Math.abs(best.start - position) <= 200 ? best : null
}

const buildJsonErrorDetails = (source: string, message: string): JsonErrorDetailsResult => {
  const details: string[] = [`錯誤訊息：${message}`]

  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  const positionMatch = message.match(/position\s+(\d+)/i)

  let line: number | null = lineColumnMatch ? Number.parseInt(lineColumnMatch[1], 10) : null
  let column: number | null = lineColumnMatch ? Number.parseInt(lineColumnMatch[2], 10) : null
  const position = positionMatch ? Number.parseInt(positionMatch[1], 10) : null

  if (position !== null) {
    details.push(`字元位置：${position}`)
  }

  if ((line === null || column === null) && position !== null) {
    const mapped = getLineAndColumnByPosition(source, position)
    line = mapped.line
    column = mapped.column
  }

  let highlightLine = line
  let highlightColumn = column
  let highlightLength = 1

  if (position !== null && /double-quoted property name/i.test(message)) {
    const keyCandidate = findLikelyUnquotedKey(source, position)
    if (keyCandidate) {
      const mapped = getLineAndColumnByPosition(source, keyCandidate.start)
      highlightLine = mapped.line
      highlightColumn = mapped.column
      highlightLength = Math.max(keyCandidate.key.length, 1)
      details.push(`推測缺少雙引號的 key：${keyCandidate.key}（已定位高亮）`)
    }
  }

  if (line !== null) {
    details.push(`行號：第 ${line} 行`)
  }
  if (column !== null) {
    details.push(`欄位：第 ${column} 列`)
  }

  if (line !== null) {
    const errorLine = source.split('\n')[line - 1] ?? ''
    if (errorLine !== '') {
      details.push(`錯誤行內容：${errorLine}`)
    }
  }

  return {
    details,
    line,
    column,
    highlightLine,
    highlightColumn,
    highlightLength,
  }
}

const resetInputState = () => {
  error.value = ''
  errorDetails.value = []
  hasJsonSyntaxError.value = false
  errorLineNumber.value = null
  errorColumnNumber.value = null
  errorHighlightLength.value = 1
  copyStatus.value = 'none'
  parsedJson.value = null
  searchKeyword.value = ''
  expandAllTree.value = false
  lastConversion.value = null
  saveStatus.value = 'none'
}

const resetErrorState = () => {
  error.value = ''
  errorDetails.value = []
  hasJsonSyntaxError.value = false
  errorLineNumber.value = null
  errorColumnNumber.value = null
  errorHighlightLength.value = 1
}

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

const markCopiedTransient = () => {
  copyStatus.value = 'copied'
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

const prepareConversion = () => {
  resetErrorState()
  copyStatus.value = 'none'
  saveStatus.value = 'none'
}

const handleTextareaScroll = (event: Event) => {
  if (!lineNumberContainer.value) return
  const target = event.target as HTMLTextAreaElement
  lineNumberContainer.value.scrollTop = target.scrollTop
}

const parseJson = (): unknown | null => {
  if (jsonInput.value.trim() === '') {
    return null
  }

  try {
    const parsed = JSON.parse(jsonInput.value) as unknown
    parsedJson.value = parsed
    hasJsonSyntaxError.value = false
    errorLineNumber.value = null
    errorColumnNumber.value = null
    errorHighlightLength.value = 1
    errorDetails.value = []
    return parsed
  } catch (e) {
    parsedJson.value = null
    lastConversion.value = null
    hasJsonSyntaxError.value = true
    if (e instanceof Error) {
      error.value = 'JSON 語法錯誤，請依下列資訊逐行檢查。'
      const parsedError = buildJsonErrorDetails(jsonInput.value, e.message)
      errorDetails.value = parsedError.details
      errorLineNumber.value = parsedError.highlightLine
      errorColumnNumber.value = parsedError.highlightColumn
      errorHighlightLength.value = parsedError.highlightLength
    } else {
      error.value = 'JSON 語法錯誤：請檢查您的輸入。'
      errorDetails.value = []
      errorLineNumber.value = null
      errorColumnNumber.value = null
      errorHighlightLength.value = 1
    }
    return null
  }
}

const handleCopy = async () => {
  if (jsonInput.value.trim() === '') {
    error.value = '複製失敗：輸入內容為空。'
    return
  }

  try {
    await navigator.clipboard.writeText(jsonInput.value)
    markCopiedTransient()
  } catch {
    error.value = '複製失敗：瀏覽器不支援或未授予權限。'
  }
}

const handleFormat = () => {
  prepareConversion()

  if (jsonInput.value.trim() === '') {
    return
  }

  const sourceJson = jsonInput.value
  const parsedObject = parseJson()
  if (hasJsonSyntaxError.value) {
    return
  }

  const formattedJson = JSON.stringify(parsedObject, null, INDENT_SPACES)
  jsonInput.value = formattedJson
  searchKeyword.value = ''
  lastConversion.value = {
    action: 'format',
    input: sourceJson,
    output: formattedJson,
  }
}

const handleMinify = () => {
  prepareConversion()

  if (jsonInput.value.trim() === '') {
    return
  }

  const sourceJson = jsonInput.value
  const parsedObject = parseJson()
  if (hasJsonSyntaxError.value) {
    return
  }

  const minifiedJson = JSON.stringify(parsedObject)
  jsonInput.value = minifiedJson
  searchKeyword.value = ''
  lastConversion.value = {
    action: 'minify',
    input: sourceJson,
    output: minifiedJson,
  }
}

const handleClear = () => {
  jsonInput.value = ''
  resetInputState()
}

const toggleExpandAll = () => {
  expandAllTree.value = !expandAllTree.value
}

const handleSaveCurrent = () => {
  error.value = ''

  if (!lastConversion.value) {
    error.value = '尚無可儲存的轉換結果，請先執行格式化或壓縮。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'json-formatter',
    action: lastConversion.value.action,
    input: lastConversion.value.input,
    output: lastConversion.value.output,
  })

  markSavedTransient()
}

const handleImportFile = () => {
  fileInputRef.value?.click()
}

const onFileSelected = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) {
    return
  }

  const file = target.files[0]
  const reader = new FileReader()

  reader.onload = (e) => {
    const content = e.target?.result
    if (typeof content === 'string') {
      jsonInput.value = content
      resetInputState()
      parseJson()
    } else {
      error.value = '檔案讀取失敗：無法將檔案內容讀取為文字。'
    }
  }

  reader.onerror = () => {
    error.value = '檔案讀取時發生錯誤。'
  }

  reader.readAsText(file)
  target.value = '' // Reset input so the same file can be re-selected
}

onBeforeUnmount(() => {
  clearStatusTimer('copy')
  clearStatusTimer('save')
})
</script>

<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; padding: 10px; gap: 5px">
    <h2 style="margin: 0; font-size: 1.2em">JSON 格式化 / 校驗器</h2>

    <div
      v-if="error"
      style="color: #D8000C; background-color: #FFD2D2; border: 1px solid #D8000C; padding: 8px; border-radius: 5px; margin-bottom: 0; flex-shrink: 0; font-size: 0.9em"
    >
      <strong>錯誤：</strong> {{ error }}
      <ul v-if="errorDetails.length > 0" style="margin: 8px 0 0 18px; padding: 0">
        <li v-for="(detail, index) in errorDetails" :key="`${detail}-${index}`" style="margin: 2px 0">
          {{ detail }}
        </li>
      </ul>
    </div>

    <div style="display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; box-sizing: border-box; gap: 5px">
      <!-- Editor section (fixed height) -->
      <div style="display: flex; flex-direction: column; flex-shrink: 0; width: 100%; box-sizing: border-box; gap: 3px; overflow: hidden">
      <!-- Copy button area -->
      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 0; min-height: 32px; flex-shrink: 0">
          <span
            v-if="copyStatus === 'copied'"
            style="color: #28a745; font-size: 12px"
          >
            ✅ 已複製！
          </span>
          <button
            @click="handleCopy"
            class="tool-button tool-button--compact"
            style="--tool-button-bg: #28a745"
          >
            複製結果
          </button>
        </div>

        <div :style="editorWrapperStyle">
          <div
            ref="lineNumberContainer"
            style="width: 40px; border-right: 1px solid #e5e7eb; background-color: #f6f8fa; overflow: hidden; pointer-events: none; flex-shrink: 0"
          >
            <div style="padding: 5px 0; font-family: Consolas, monospace; font-size: 12px; text-align: right; user-select: none">
              <div
                v-for="line in lineNumbers"
                :key="line"
                :style="getLineNumberItemStyle(line)"
              >
                {{ line }}
              </div>
            </div>
          </div>

          <textarea
            v-model="jsonInput"
            wrap="off"
            spellcheck="false"
            placeholder="請在這裡貼上 JSON 數據進行格式化或校驗..."
            :style="{ ...jsonInputStyle, height: '100%' }"
            @input="resetInputState"
            @scroll="handleTextareaScroll"
          />
        </div>
      </div>

      <!-- Buttons row -->
      <div style="display: flex; gap: 6px; width: 100%; box-sizing: border-box; overflow: hidden; flex-wrap: wrap; align-items: center; flex-shrink: 0">
        <button
          @click="handleFormat"
          class="tool-button"
          style="--tool-button-bg: #4CAF50"
        >
          格式化 (Format)
        </button>

        <button
          @click="handleMinify"
          class="tool-button"
          style="--tool-button-bg: #008CBA"
        >
          壓縮 (Minify)
        </button>

        <button
          @click="handleClear"
          class="tool-button"
          style="--tool-button-bg: #f44336"
        >
          清空 (Clear)
        </button>

        <button
          @click="handleImportFile"
          class="tool-button"
        >
          匯入 .json
        </button>

        <button
          @click="handleSaveCurrent"
          class="tool-button"
          style="--tool-button-bg: #2e7d32"
        >
          儲存此次轉換
        </button>

        <span v-if="saveStatus === 'saved'" style="color: #2e7d32; align-self: center">✅ 已儲存</span>

        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="onFileSelected"
        />
      </div>

      <!-- Tree view section (grows to fill remaining space) -->
      <div v-if="parsedJson !== null" style="display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; box-sizing: border-box; overflow: hidden">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px; width: 100%; box-sizing: border-box; overflow: hidden; flex-shrink: 0">
          <label style="white-space: nowrap; font-weight: 500; font-size: 0.9em">搜尋 key / value：</label>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜尋樹狀瀏覽的 key 或 value..."
            style="flex: 1; padding: 4px 6px; border: 1px solid #d0d7de; border-radius: 5px; font-size: 12px; box-sizing: border-box; min-width: 0"
          >
          <button
            class="tool-button tool-button--compact"
            style="--tool-button-bg: #455a64; flex-shrink: 0"
            @click="toggleExpandAll"
          >
            {{ expandAllTree ? '全部收合' : '全部展開' }}
          </button>
        </div>

        <!-- Tree view title and content -->
        <h3 style="margin: 0 0 4px 0; font-size: 12px; flex-shrink: 0">樹狀瀏覽</h3>
        <div style="border: 1px solid #e0e0e0; border-radius: 6px; background-color: #fafafa; flex: 1; min-height: 0; overflow: auto; padding: 6px 8px">
          <JsonTreeNode
            :nodeKey="null"
            :value="parsedJson"
            :depth="0"
            :searchKeyword="normalizedSearchKeyword"
            :lineNumber="1"
            :expandAll="expandAllTree"
          />
        </div>
      </div>
    </div>

    <p style="margin: 0; font-size: 0.75em; color: #666; flex-shrink: 0">* 點擊任一按鈕即可同時進行 JSON 語法校驗。</p>
  </div>
</template>
