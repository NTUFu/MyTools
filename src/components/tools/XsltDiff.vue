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

interface LastXsltComparison {
  leftInput: string
  rightInput: string
  leftFileName: string | null
  rightFileName: string | null
  ignoreWhitespace: boolean
  ignoreIndentation: boolean
  deleted: number
  inserted: number
  equal: number
}

const MAX_LINES = 3000

const historyStore = useHistoryStore()

const leftContent = ref('')
const rightContent = ref('')
const leftFileName = ref('')
const rightFileName = ref('')
const diffResult = ref<SideBySideLine[] | null>(null)
const errorMessage = ref('')
const ignoreWhitespace = ref(false)
const ignoreIndentation = ref(false)
const lastComparison = ref<LastXsltComparison | null>(null)
const saveStatus = ref<'none' | 'saved'>('none')
const leftDiffPane = ref<HTMLDivElement | null>(null)
const rightDiffPane = ref<HTMLDivElement | null>(null)

let isSyncingDiffPaneScroll = false
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

const editorTextareaStyle: CSSProperties = {
  width: '100%',
  height: '200px',
  padding: '5px',
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

  if (ignoreIndentation.value) {
    normalized = normalized.replace(/^[\t ]+/, '')
  }

  if (ignoreWhitespace.value) {
    normalized = normalized.replace(/\s+/g, '')
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
  }, 2000)
}

const handleFileUpload = (side: 'left' | 'right', event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (side === 'left') {
      leftContent.value = content
      leftFileName.value = file.name
    } else {
      rightContent.value = content
      rightFileName.value = file.name
    }
    saveStatus.value = 'none'
    lastComparison.value = null
    input.value = ''
  }
  reader.readAsText(file, 'UTF-8')
}

/** LCS-based line diff, returns a flat array of delete/insert/equal segments */
function computeLineDiff(
  leftLines: DiffLine[],
  rightLines: DiffLine[],
): Array<{ type: 'equal' | 'delete' | 'insert'; leftNum: number | null; rightNum: number | null; leftContent: string | null; rightContent: string | null }> {
  const m = leftLines.length
  const n = rightLines.length

  // dp[i][j] = LCS length for leftLines[0..i-1] and rightLines[0..j-1]
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

  // Backtrack
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

/** Convert flat diff into side-by-side rows, pairing consecutive deletes with inserts */
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
      i++
    } else {
      // Collect consecutive deletes and inserts and pair them
      const deletes: typeof diffLines = []
      const inserts: typeof diffLines = []

      while (i < diffLines.length && diffLines[i].type !== 'equal') {
        if (diffLines[i].type === 'delete') {
          deletes.push(diffLines[i])
        } else {
          inserts.push(diffLines[i])
        }
        i++
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
  }

  return result
}

const handleCompare = () => {
  errorMessage.value = ''
  saveStatus.value = 'none'

  if (leftContent.value.trim() === '') {
    lastComparison.value = null
    errorMessage.value = '請提供左側 XSLT 內容。'
    return
  }
  if (rightContent.value.trim() === '') {
    lastComparison.value = null
    errorMessage.value = '請提供右側 XSLT 內容。'
    return
  }

  const leftLines = toDiffLines(leftContent.value)
  const rightLines = toDiffLines(rightContent.value)

  if (leftLines.length > MAX_LINES || rightLines.length > MAX_LINES) {
    lastComparison.value = null
    errorMessage.value = `單個檔案行數不得超過 ${MAX_LINES} 行（目前：左 ${leftLines.length} 行，右 ${rightLines.length} 行）。`
    return
  }

  const flat = computeLineDiff(leftLines, rightLines)
  const sideBySide = buildSideBySide(flat)
  diffResult.value = sideBySide
  const stats = createDiffStats(sideBySide)
  if (!stats) {
    return
  }

  lastComparison.value = {
    leftInput: leftContent.value,
    rightInput: rightContent.value,
    leftFileName: leftFileName.value || null,
    rightFileName: rightFileName.value || null,
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreIndentation: ignoreIndentation.value,
    deleted: stats.deleted,
    inserted: stats.inserted,
    equal: stats.equal,
  }
}

const handleClear = () => {
  leftContent.value = ''
  rightContent.value = ''
  leftFileName.value = ''
  rightFileName.value = ''
  diffResult.value = null
  lastComparison.value = null
  errorMessage.value = ''
  saveStatus.value = 'none'
}

const handleOptionChange = () => {
  saveStatus.value = 'none'
  if (diffResult.value !== null) {
    handleCompare()
  }
}

const handleInputChange = () => {
  saveStatus.value = 'none'
  lastComparison.value = null
}

const handleSaveCurrent = () => {
  errorMessage.value = ''

  if (!lastComparison.value) {
    errorMessage.value = '尚無可儲存的比較結果，請先執行比較。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'xslt-diff',
    action: 'compare',
    input: lastComparison.value.leftInput,
    output: lastComparison.value.rightInput,
    metadata: {
      leftFileName: lastComparison.value.leftFileName,
      rightFileName: lastComparison.value.rightFileName,
      ignoreWhitespace: lastComparison.value.ignoreWhitespace,
      ignoreIndentation: lastComparison.value.ignoreIndentation,
      deletedLines: lastComparison.value.deleted,
      insertedLines: lastComparison.value.inserted,
      equalLines: lastComparison.value.equal,
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

const diffStats = computed(() => {
  return createDiffStats(diffResult.value)
})

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
})

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

const getDiffLineNumberCellStyle = (type: CellType): CSSProperties => ({
  boxSizing: 'border-box',
  width: '44px',
  minWidth: '44px',
  padding: '1px 4px',
  position: 'sticky',
  left: '0',
  zIndex: 1,
  textAlign: 'right',
  userSelect: 'none',
  color: lineNumColor(type),
  backgroundColor: cellBg(type),
  borderRight: '1px solid #e0e0e0',
  borderBottom: '1px solid #f0f0f0',
  lineHeight: '18px',
  height: '20px',
  fontWeight: type === 'delete' || type === 'insert' ? '600' : '400',
})

const getDiffContentCellStyle = (type: CellType): CSSProperties => ({
  boxSizing: 'border-box',
  padding: '1px 6px',
  whiteSpace: 'pre',
  backgroundColor: cellBg(type),
  borderBottom: '1px solid #f0f0f0',
  lineHeight: '18px',
  height: '20px',
  color: type === 'delete' ? '#c62828' : type === 'insert' ? '#2e7d32' : '#1f2328',
})
</script>

<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; padding: 10px; gap: 6px">
    <h2 style="margin: 0; font-size: 1.2em">XSLT 比較器</h2>

    <div
      v-if="errorMessage"
      style="color: #D8000C; background-color: #FFD2D2; border: 1px solid #D8000C; padding: 8px; border-radius: 5px; flex-shrink: 0; font-size: 0.9em"
    >
      <strong>提示：</strong> {{ errorMessage }}
    </div>

    <!-- Input panels -->
    <div style="display: flex; gap: 8px; flex-shrink: 0; width: 100%; box-sizing: border-box">
      <!-- Left panel -->
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em; white-space: nowrap">原始 XSLT</span>
          <span
            v-if="leftFileName"
            style="font-size: 0.8em; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px"
            :title="leftFileName"
          >{{ leftFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" accept=".xsl,.xslt,.xml" style="display: none" @change="handleFileUpload('left', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">上傳檔案</span>
          </label>
        </div>
        <textarea
          v-model="leftContent"
          placeholder="貼上 XSLT 內容，或點擊「上傳檔案」..."
          spellcheck="false"
          @input="handleInputChange"
          :style="editorTextareaStyle"
        />
      </div>

      <!-- Right panel -->
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em; white-space: nowrap">比較 XSLT</span>
          <span
            v-if="rightFileName"
            style="font-size: 0.8em; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px"
            :title="rightFileName"
          >{{ rightFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" accept=".xsl,.xslt,.xml" style="display: none" @change="handleFileUpload('right', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">上傳檔案</span>
          </label>
        </div>
        <textarea
          v-model="rightContent"
          placeholder="貼上 XSLT 內容，或點擊「上傳檔案」..."
          spellcheck="false"
          @input="handleInputChange"
          :style="editorTextareaStyle"
        />
      </div>
    </div>

    <!-- Action buttons + stats -->
    <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center; flex-wrap: wrap">
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer; margin-right: 6px">
        <input v-model="ignoreWhitespace" type="checkbox" @change="handleOptionChange">
        忽略空白
      </label>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer; margin-right: 6px">
        <input v-model="ignoreIndentation" type="checkbox" @change="handleOptionChange">
        忽略縮排
      </label>
      <button @click="handleCompare" class="tool-button" style="--tool-button-bg: #4CAF50">
        比較
      </button>
      <button @click="handleClear" class="tool-button" style="--tool-button-bg: #f44336">
        清空
      </button>
      <button @click="handleSaveCurrent" class="tool-button" style="--tool-button-bg: #2e7d32">
        儲存此次轉換
      </button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32; align-self: center">✅ 已儲存</span>
      <template v-if="diffStats">
        <span v-if="!diffStats.hasDiff" style="font-size: 0.85em; color: #2e7d32; font-weight: 500">
          ✓ 兩個檔案完全相同（共 {{ diffStats.equal }} 行）
        </span>
        <span v-else style="font-size: 0.85em; color: #555">
          相同 {{ diffStats.equal }} 行 ／
          <span style="color: #c62828">刪除 {{ diffStats.deleted }} 行</span> ／
          <span style="color: #2e7d32">新增 {{ diffStats.inserted }} 行</span>
        </span>
      </template>
    </div>

    <!-- Diff result -->
    <div
      v-if="diffResult !== null"
      style="height: min(420px, 55vh); min-height: 280px; flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: hidden; border: 1px solid #e0e0e0; border-radius: 6px; background-color: #fff"
    >
      <div style="display: flex; flex-direction: column; min-width: 0; border-right: 2px solid #bbb">
        <div style="display: grid; grid-template-columns: 44px minmax(0, 1fr); background-color: #f0f0f0; border-bottom: 2px solid #ccc; flex-shrink: 0">
          <div style="padding: 5px 4px; text-align: center; font-size: 11px; color: #555; font-weight: 600; border-right: 1px solid #ccc">#</div>
          <div style="padding: 5px 8px; text-align: left; font-size: 11px; color: #555; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            原始 XSLT<span v-if="leftFileName" style="font-weight: 400; color: #888"> — {{ leftFileName }}</span>
          </div>
        </div>

        <div
          ref="leftDiffPane"
          :style="diffPaneStyle"
          @scroll="handleDiffPaneScroll('left', $event)"
        >
          <table :style="diffTableStyle">
            <tbody>
              <tr
              v-for="(row, index) in diffResult"
              :key="`left-row-${index}`"
              >
                <td :style="getDiffLineNumberCellStyle(row.leftType)">
                {{ row.leftLineNum ?? '' }}
                </td>
                <td :style="getDiffContentCellStyle(row.leftType)">
                  <span v-if="row.leftType === 'delete'" style="color: #c62828; user-select: none; margin-right: 3px">-</span>{{ row.leftContent ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; min-width: 0">
        <div style="display: grid; grid-template-columns: 44px minmax(0, 1fr); background-color: #f0f0f0; border-bottom: 2px solid #ccc; flex-shrink: 0">
          <div style="padding: 5px 4px; text-align: center; font-size: 11px; color: #555; font-weight: 600; border-right: 1px solid #ccc">#</div>
          <div style="padding: 5px 8px; text-align: left; font-size: 11px; color: #555; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            比較 XSLT<span v-if="rightFileName" style="font-weight: 400; color: #888"> — {{ rightFileName }}</span>
          </div>
        </div>

        <div
          ref="rightDiffPane"
          :style="diffPaneStyle"
          @scroll="handleDiffPaneScroll('right', $event)"
        >
          <table :style="diffTableStyle">
            <tbody>
              <tr
              v-for="(row, index) in diffResult"
              :key="`right-row-${index}`"
              >
                <td :style="getDiffLineNumberCellStyle(row.rightType)">
                {{ row.rightLineNum ?? '' }}
                </td>
                <td :style="getDiffContentCellStyle(row.rightType)">
                  <span v-if="row.rightType === 'insert'" style="color: #2e7d32; user-select: none; margin-right: 3px">+</span>{{ row.rightContent ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <p style="margin: 0; font-size: 0.75em; color: #666; flex-shrink: 0">
      * 支援 .xsl / .xslt / .xml 檔案上傳或直接貼上文字；每側最多 {{ MAX_LINES.toLocaleString() }} 行。勾選「忽略空白」時會忽略所有空白字元差異；勾選「忽略縮排」時只忽略每行開頭的空白。
    </p>
  </div>
</template>
