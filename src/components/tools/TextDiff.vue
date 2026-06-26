<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'
import { useHistoryStore } from '../../stores/history'

type CellType = 'equal' | 'delete' | 'insert' | 'empty'

interface SideBySideLine {
  leftLineNum: number | null
  leftContent: string | null
  leftType: CellType
  rightLineNum: number | null
  rightContent: string | null
  rightType: CellType
}

interface DiffLine {
  lineNumber: number
  original: string
  normalized: string
}

const MAX_LINES = 3000
const MAX_FILE_SIZE = 2 * 1024 * 1024

const historyStore = useHistoryStore()

const leftContent = ref('')
const rightContent = ref('')
const leftFileName = ref('')
const rightFileName = ref('')
const diffResult = ref<SideBySideLine[] | null>(null)
const errorMessage = ref('')
const ignoreWhitespace = ref(false)
const ignoreCase = ref(false)
const saveStatus = ref<'none' | 'saved'>('none')
const leftDiffPane = ref<HTMLDivElement | null>(null)
const rightDiffPane = ref<HTMLDivElement | null>(null)

let isSyncingDiffPaneScroll = false
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

const editorTextareaStyle: CSSProperties = {
  width: '100%',
  height: '200px',
  padding: '8px',
  boxSizing: 'border-box',
  fontFamily: 'Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  border: '1px solid #ccc',
  borderRadius: '5px',
  resize: 'none',
  overflow: 'auto',
  backgroundColor: '#ffffff',
  color: '#1f2328',
  caretColor: '#1f2328',
  colorScheme: 'light',
}

const diffPaneStyle: CSSProperties = {
  flex: '1 1 0',
  minHeight: 0,
  minWidth: 0,
  overflow: 'auto',
  overscrollBehavior: 'contain',
}

const diffTableStyle: CSSProperties = {
  width: 'max-content',
  minWidth: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'auto',
  fontFamily: 'Consolas, monospace',
  fontSize: '12px',
}

const normalizeLine = (line: string) => {
  let normalized = line

  if (ignoreWhitespace.value) {
    normalized = normalized.replace(/\s+/g, '')
  }

  if (ignoreCase.value) {
    normalized = normalized.toLowerCase()
  }

  return normalized
}

const toDiffLines = (content: string): DiffLine[] =>
  content.split('\n').map((line, index) => ({
    lineNumber: index + 1,
    original: line,
    normalized: normalizeLine(line),
  }))

const createDiffStats = (lines: SideBySideLine[] | null) => {
  if (!lines) {
    return null
  }

  let deleted = 0
  let inserted = 0
  let equal = 0

  for (const line of lines) {
    if (line.leftType === 'delete') {
      deleted += 1
    }
    if (line.rightType === 'insert') {
      inserted += 1
    }
    if (line.leftType === 'equal') {
      equal += 1
    }
  }

  return {
    deleted,
    inserted,
    equal,
    hasDiff: deleted > 0 || inserted > 0,
  }
}

const markSavedTransient = () => {
  saveStatus.value = 'saved'

  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
  }

  saveStatusTimer = setTimeout(() => {
    saveStatus.value = 'none'
    saveStatusTimer = null
  }, 1800)
}

const loadFile = (side: 'left' | 'right', event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  errorMessage.value = ''
  saveStatus.value = 'none'

  if (file.size > MAX_FILE_SIZE) {
    errorMessage.value = `檔案過大（上限 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB）。`
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (loadEvent) => {
    const content = String(loadEvent.target?.result ?? '')
    if (side === 'left') {
      leftContent.value = content
      leftFileName.value = file.name
    } else {
      rightContent.value = content
      rightFileName.value = file.name
    }

    diffResult.value = null
    input.value = ''
  }

  reader.onerror = () => {
    errorMessage.value = '讀取檔案失敗，請改用文字貼上。'
    input.value = ''
  }

  reader.readAsText(file, 'UTF-8')
}

function computeLineDiff(
  leftLines: DiffLine[],
  rightLines: DiffLine[],
): Array<{ type: 'equal' | 'delete' | 'insert'; leftNum: number | null; rightNum: number | null; leftContent: string | null; rightContent: string | null }> {
  const m = leftLines.length
  const n = rightLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftLines[i - 1].normalized === rightLines[j - 1].normalized) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const stack: Array<{ type: 'equal' | 'delete' | 'insert'; leftNum: number | null; rightNum: number | null; leftContent: string | null; rightContent: string | null }> = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1].normalized === rightLines[j - 1].normalized) {
      stack.push({
        type: 'equal',
        leftNum: leftLines[i - 1].lineNumber,
        rightNum: rightLines[j - 1].lineNumber,
        leftContent: leftLines[i - 1].original,
        rightContent: rightLines[j - 1].original,
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'insert',
        leftNum: null,
        rightNum: rightLines[j - 1].lineNumber,
        leftContent: null,
        rightContent: rightLines[j - 1].original,
      })
      j--
    } else {
      stack.push({
        type: 'delete',
        leftNum: leftLines[i - 1].lineNumber,
        rightNum: null,
        leftContent: leftLines[i - 1].original,
        rightContent: null,
      })
      i--
    }
  }

  return stack.reverse()
}

function buildSideBySide(
  diffLines: ReturnType<typeof computeLineDiff>,
): SideBySideLine[] {
  const result: SideBySideLine[] = []
  let i = 0

  while (i < diffLines.length) {
    const line = diffLines[i]

    if (line.type === 'equal') {
      result.push({
        leftLineNum: line.leftNum,
        leftContent: line.leftContent,
        leftType: 'equal',
        rightLineNum: line.rightNum,
        rightContent: line.rightContent,
        rightType: 'equal',
      })
      i += 1
      continue
    }

    const deletes: typeof diffLines = []
    const inserts: typeof diffLines = []

    while (i < diffLines.length && diffLines[i].type !== 'equal') {
      if (diffLines[i].type === 'delete') {
        deletes.push(diffLines[i])
      } else {
        inserts.push(diffLines[i])
      }
      i += 1
    }

    const maxLen = Math.max(deletes.length, inserts.length)
    for (let k = 0; k < maxLen; k++) {
      const del = deletes[k]
      const ins = inserts[k]
      result.push({
        leftLineNum: del?.leftNum ?? null,
        leftContent: del?.leftContent ?? null,
        leftType: del ? 'delete' : 'empty',
        rightLineNum: ins?.rightNum ?? null,
        rightContent: ins?.rightContent ?? null,
        rightType: ins ? 'insert' : 'empty',
      })
    }
  }

  return result
}

const runCompare = () => {
  errorMessage.value = ''
  saveStatus.value = 'none'

  if (leftContent.value.trim() === '') {
    diffResult.value = null
    errorMessage.value = '請提供左側文字內容。'
    return
  }

  if (rightContent.value.trim() === '') {
    diffResult.value = null
    errorMessage.value = '請提供右側文字內容。'
    return
  }

  const leftLines = toDiffLines(leftContent.value)
  const rightLines = toDiffLines(rightContent.value)

  if (leftLines.length > MAX_LINES || rightLines.length > MAX_LINES) {
    diffResult.value = null
    errorMessage.value = `單側行數不得超過 ${MAX_LINES} 行（左 ${leftLines.length} / 右 ${rightLines.length}）。`
    return
  }

  diffResult.value = buildSideBySide(computeLineDiff(leftLines, rightLines))
}

const handleInputChange = () => {
  saveStatus.value = 'none'
  diffResult.value = null
}

const handleOptionChange = () => {
  saveStatus.value = 'none'
  if (diffResult.value) {
    runCompare()
  }
}

const handleClear = () => {
  leftContent.value = ''
  rightContent.value = ''
  leftFileName.value = ''
  rightFileName.value = ''
  diffResult.value = null
  errorMessage.value = ''
  saveStatus.value = 'none'
}

const handleSave = () => {
  errorMessage.value = ''

  if (!diffResult.value) {
    errorMessage.value = '尚無可儲存結果，請先執行比較。'
    return
  }

  const stats = createDiffStats(diffResult.value)
  if (!stats) {
    errorMessage.value = '目前結果無法儲存。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'text-diff',
    action: 'diff',
    input: leftContent.value,
    output: rightContent.value,
    metadata: {
      leftFileName: leftFileName.value || null,
      rightFileName: rightFileName.value || null,
      ignoreWhitespace: ignoreWhitespace.value,
      ignoreCase: ignoreCase.value,
      deletedLines: stats.deleted,
      insertedLines: stats.inserted,
      equalLines: stats.equal,
    },
  })

  markSavedTransient()
}

const handleDiffPaneScroll = (side: 'left' | 'right', event: Event) => {
  if (isSyncingDiffPaneScroll) {
    return
  }

  const target = event.target as HTMLDivElement
  const pairedPane = side === 'left' ? rightDiffPane.value : leftDiffPane.value

  if (!pairedPane || pairedPane.scrollTop === target.scrollTop) {
    return
  }

  isSyncingDiffPaneScroll = true
  pairedPane.scrollTop = target.scrollTop

  requestAnimationFrame(() => {
    isSyncingDiffPaneScroll = false
  })
}

const diffStats = computed(() => createDiffStats(diffResult.value))

const cellBg = (type: CellType): string => {
  if (type === 'delete') return '#ffeef0'
  if (type === 'insert') return '#e6ffec'
  if (type === 'empty') return '#f6f8fa'
  return 'transparent'
}

const lineNumColor = (type: CellType): string => {
  if (type === 'delete') return '#c62828'
  if (type === 'insert') return '#2e7d32'
  return '#6b7280'
}

const getLineNumberCellStyle = (type: CellType): CSSProperties => ({
  boxSizing: 'border-box',
  width: '44px',
  minWidth: '44px',
  padding: '1px 4px',
  textAlign: 'right',
  userSelect: 'none',
  color: lineNumColor(type),
  backgroundColor: cellBg(type),
  borderRight: '1px solid #e0e0e0',
  borderBottom: '1px solid #f0f0f0',
  lineHeight: '18px',
  height: '20px',
})

const getContentCellStyle = (type: CellType): CSSProperties => ({
  boxSizing: 'border-box',
  padding: '1px 6px',
  whiteSpace: 'pre',
  backgroundColor: cellBg(type),
  borderBottom: '1px solid #f0f0f0',
  lineHeight: '18px',
  height: '20px',
  color: type === 'delete' ? '#c62828' : type === 'insert' ? '#2e7d32' : '#1f2328',
})

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
})
</script>

<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; padding: 10px; gap: 8px">
    <h2 style="margin: 0; font-size: 1.2em">Text Diff</h2>

    <p
      v-if="errorMessage"
      style="margin: 0; color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 8px; flex-shrink: 0; width: 100%; box-sizing: border-box">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em">左側內容</span>
          <span v-if="leftFileName" style="font-size: 0.8em; color: #6b7280">{{ leftFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" style="display: none" @change="loadFile('left', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">載入檔案</span>
          </label>
        </div>
        <textarea
          v-model="leftContent"
          :style="editorTextareaStyle"
          spellcheck="false"
          placeholder="貼上左側文字..."
          @input="handleInputChange"
        />
      </div>

      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em">右側內容</span>
          <span v-if="rightFileName" style="font-size: 0.8em; color: #6b7280">{{ rightFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" style="display: none" @change="loadFile('right', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">載入檔案</span>
          </label>
        </div>
        <textarea
          v-model="rightContent"
          :style="editorTextareaStyle"
          spellcheck="false"
          placeholder="貼上右側文字..."
          @input="handleInputChange"
        />
      </div>
    </div>

    <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center">
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer; margin-right: 6px">
        <input v-model="ignoreWhitespace" type="checkbox" @change="handleOptionChange">
        忽略空白
      </label>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer; margin-right: 6px">
        <input v-model="ignoreCase" type="checkbox" @change="handleOptionChange">
        忽略大小寫
      </label>
      <button class="tool-button" style="--tool-button-bg: #4caf50" @click="runCompare">比較</button>
      <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSave">儲存此次轉換</button>
      <button class="tool-button" style="--tool-button-bg: #f44336" @click="handleClear">清空</button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
      <template v-if="diffStats">
        <span v-if="!diffStats.hasDiff" style="font-size: 0.85em; color: #2e7d32; font-weight: 500">✓ 完全相同（{{ diffStats.equal }} 行）</span>
        <span v-else style="font-size: 0.85em; color: #555">
          相同 {{ diffStats.equal }} 行 ／
          <span style="color: #c62828">刪除 {{ diffStats.deleted }} 行</span> ／
          <span style="color: #2e7d32">新增 {{ diffStats.inserted }} 行</span>
        </span>
      </template>
    </div>

    <div
      v-if="diffResult !== null"
      style="height: min(420px, 55vh); min-height: 280px; flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: hidden; border: 1px solid #e0e0e0; border-radius: 6px; background-color: #fff"
    >
      <div style="display: flex; flex-direction: column; min-width: 0; border-right: 2px solid #bbb">
        <div style="display: grid; grid-template-columns: 44px minmax(0, 1fr); background-color: #f0f0f0; border-bottom: 2px solid #ccc; flex-shrink: 0">
          <div style="padding: 5px 4px; text-align: center; font-size: 11px; color: #555; font-weight: 600; border-right: 1px solid #ccc">#</div>
          <div style="padding: 5px 8px; text-align: left; font-size: 11px; color: #555; font-weight: 600">Left</div>
        </div>

        <div ref="leftDiffPane" :style="diffPaneStyle" @scroll="handleDiffPaneScroll('left', $event)">
          <table :style="diffTableStyle">
            <tbody>
              <tr v-for="(row, index) in diffResult" :key="`left-${index}`">
                <td :style="getLineNumberCellStyle(row.leftType)">{{ row.leftLineNum ?? '' }}</td>
                <td :style="getContentCellStyle(row.leftType)"><span v-if="row.leftType === 'delete'" style="color: #c62828; user-select: none; margin-right: 3px">-</span>{{ row.leftContent ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; min-width: 0">
        <div style="display: grid; grid-template-columns: 44px minmax(0, 1fr); background-color: #f0f0f0; border-bottom: 2px solid #ccc; flex-shrink: 0">
          <div style="padding: 5px 4px; text-align: center; font-size: 11px; color: #555; font-weight: 600; border-right: 1px solid #ccc">#</div>
          <div style="padding: 5px 8px; text-align: left; font-size: 11px; color: #555; font-weight: 600">Right</div>
        </div>

        <div ref="rightDiffPane" :style="diffPaneStyle" @scroll="handleDiffPaneScroll('right', $event)">
          <table :style="diffTableStyle">
            <tbody>
              <tr v-for="(row, index) in diffResult" :key="`right-${index}`">
                <td :style="getLineNumberCellStyle(row.rightType)">{{ row.rightLineNum ?? '' }}</td>
                <td :style="getContentCellStyle(row.rightType)"><span v-if="row.rightType === 'insert'" style="color: #2e7d32; user-select: none; margin-right: 3px">+</span>{{ row.rightContent ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <p style="margin: 0; font-size: 0.75em; color: #666">* 支援純文字載入；每側最多 {{ MAX_LINES.toLocaleString() }} 行，檔案上限 {{ (MAX_FILE_SIZE / 1024 / 1024).toFixed(0) }} MB。</p>
  </div>
</template>
