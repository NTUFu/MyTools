<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'
import { useHistoryStore } from '../../stores/history'

interface ExtractedItem {
  value: string
  normalized: string
  lineNumber: number
  rawLine: string
}

interface CompareResult {
  leftUniqueValues: string[]
  rightUniqueValues: string[]
  missingInRight: string[]
  missingInLeft: string[]
}

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

interface LastSqlCompare {
  leftInput: string
  rightInput: string
  leftFileName: string | null
  rightFileName: string | null
  compareMode: CompareMode
  textCompareMode: TextCompareMode
  variableName: string
  conditionPattern: string
  conditionFlags: string
  ignoreCommentLines: boolean
  ignoreCaseOnCompare: boolean
  result: CompareResult
}

type CompareMode = 'variable-if' | 'text-compare' | 'custom-regex'
type TextCompareMode = 'trim' | 'exact'

interface CompareModeOption {
  value: CompareMode
  label: string
}

const MAX_LINES = 4000

const historyStore = useHistoryStore()

const leftContent = ref('')
const rightContent = ref('')
const leftFileName = ref('')
const rightFileName = ref('')

const compareMode = ref<CompareMode>('variable-if')
const textCompareMode = ref<TextCompareMode>('trim')
const variableName = ref('@docmd')
const conditionPattern = ref("^\\s*if\\s+@docmd\\s*=\\s*N?'([^']+)'")
const conditionFlags = ref('i')
const ignoreCommentLines = ref(true)
const ignoreCaseOnCompare = ref(true)

const compareResult = ref<CompareResult | null>(null)
const textDiffResult = ref<SideBySideLine[] | null>(null)
const lastComparison = ref<LastSqlCompare | null>(null)
const errorMessage = ref('')
const saveStatus = ref<'none' | 'saved'>('none')
const leftDiffPane = ref<HTMLDivElement | null>(null)
const rightDiffPane = ref<HTMLDivElement | null>(null)
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

let isSyncingDiffPaneScroll = false
let activeDragPane: HTMLDivElement | null = null
let dragStartX = 0
let dragStartY = 0
let dragStartScrollLeft = 0
let dragStartScrollTop = 0

const compareModeOptions: CompareModeOption[] = [
  { value: 'variable-if', label: '指定變數' },
  { value: 'text-compare', label: '文字比較' },
  { value: 'custom-regex', label: '進階' },
]

const resetCompareOutputs = (options?: { clearError?: boolean }) => {
  compareResult.value = null
  textDiffResult.value = null
  lastComparison.value = null
  saveStatus.value = 'none'

  if (options?.clearError) {
    errorMessage.value = ''
  }
}

const createTextDiffStats = (lines: SideBySideLine[] | null) => {
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

  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = (e.target?.result as string) || ''

    if (side === 'left') {
      leftContent.value = content
      leftFileName.value = file.name
    } else {
      rightContent.value = content
      rightFileName.value = file.name
    }

    resetCompareOutputs()
    input.value = ''
  }

  reader.readAsText(file, 'UTF-8')
}

const normalizeValue = (value: string) => {
  const normalizedSource = compareMode.value === 'text-compare' && textCompareMode.value === 'exact'
    ? value
    : value.trim()

  if (!ignoreCaseOnCompare.value) {
    return normalizedSource
  }

  return normalizedSource.toLowerCase()
}

const normalizeTextDiffLine = (line: string) => {
  const normalizedSource = textCompareMode.value === 'exact' ? line : line.trim()

  if (!ignoreCaseOnCompare.value) {
    return normalizedSource
  }

  return normalizedSource.toLowerCase()
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildMatcher = (): RegExp => {
  if (compareMode.value === 'variable-if') {
    const targetVariable = variableName.value.trim()
    if (!targetVariable) {
      throw new Error('empty-variable-name')
    }

    const escapedVariable = escapeRegex(targetVariable)
    return new RegExp(`^\\s*if\\s+${escapedVariable}\\s*=\\s*N?'([^']+)'`, 'i')
  }

  const flags = conditionFlags.value.replace(/g/g, '')
  return new RegExp(conditionPattern.value, flags)
}

const extractValues = (content: string, matcher: RegExp): ExtractedItem[] => {
  const lines = content.split('\n')
  const extracted: ExtractedItem[] = []

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index].replace(/\r$/, '')

    if (ignoreCommentLines.value && rawLine.trimStart().startsWith('--')) {
      continue
    }

    let value = ''

    if (compareMode.value === 'text-compare') {
      value = textCompareMode.value === 'exact' ? rawLine : rawLine.trim()
      if (!rawLine.trim()) {
        continue
      }
    } else {
      const match = rawLine.match(matcher)
      if (!match || !match[1]) {
        continue
      }

      value = match[1].trim()
    }

    if (!value) {
      continue
    }

    extracted.push({
      value,
      normalized: normalizeValue(value),
      lineNumber: index + 1,
      rawLine,
    })
  }

  return extracted
}

const toUniqueMap = (items: ExtractedItem[]) => {
  const map = new Map<string, string>()

  for (const item of items) {
    if (!map.has(item.normalized)) {
      map.set(item.normalized, item.value)
    }
  }

  return map
}

const toDiffLines = (content: string): DiffLine[] => {
  const lines = content.split('\n')
  const diffLines: DiffLine[] = []

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index].replace(/\r$/, '')

    if (!rawLine.trim()) {
      continue
    }

    if (ignoreCommentLines.value && rawLine.trimStart().startsWith('--')) {
      continue
    }

    diffLines.push({
      lineNumber: index + 1,
      original: rawLine,
      normalized: normalizeTextDiffLine(rawLine),
    })
  }

  return diffLines
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
      i++
    } else {
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
      for (let index = 0; index < maxLen; index++) {
        const del = deletes[index]
        const ins = inserts[index]
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
  resetCompareOutputs({ clearError: true })

  if (leftContent.value.trim() === '') {
    errorMessage.value = '請提供左側 SQL 內容。'
    return
  }

  if (rightContent.value.trim() === '') {
    errorMessage.value = '請提供右側 SQL 內容。'
    return
  }

  const leftLineCount = leftContent.value.split('\n').length
  const rightLineCount = rightContent.value.split('\n').length

  if (leftLineCount > MAX_LINES || rightLineCount > MAX_LINES) {
    errorMessage.value = `單個檔案行數不得超過 ${MAX_LINES} 行（目前：左 ${leftLineCount} 行，右 ${rightLineCount} 行）。`
    return
  }

  if (compareMode.value === 'text-compare') {
    const leftLines = toDiffLines(leftContent.value)
    const rightLines = toDiffLines(rightContent.value)

    if (leftLines.length === 0 && rightLines.length === 0) {
      errorMessage.value = '兩側都沒有可比較的文字內容，請確認內容或過濾條件。'
      return
    }

    textDiffResult.value = buildSideBySide(computeLineDiff(leftLines, rightLines))
    lastComparison.value = {
      leftInput: leftContent.value,
      rightInput: rightContent.value,
      leftFileName: leftFileName.value || null,
      rightFileName: rightFileName.value || null,
      compareMode: compareMode.value,
      textCompareMode: textCompareMode.value,
      variableName: variableName.value,
      conditionPattern: conditionPattern.value,
      conditionFlags: conditionFlags.value,
      ignoreCommentLines: ignoreCommentLines.value,
      ignoreCaseOnCompare: ignoreCaseOnCompare.value,
      result: {
        leftUniqueValues: [],
        rightUniqueValues: [],
        missingInRight: [],
        missingInLeft: [],
      },
    }
    return
  }

  let matcher: RegExp
  try {
    matcher = buildMatcher()
  } catch {
    errorMessage.value = compareMode.value === 'custom-regex'
      ? '比較條件 Regex 格式無效，請確認 pattern 與 flags。'
      : '請輸入正確的變數名稱（例如 @docmd）。'
    return
  }

  const leftItems = extractValues(leftContent.value, matcher)
  const rightItems = extractValues(rightContent.value, matcher)

  if (leftItems.length === 0 && rightItems.length === 0) {
    errorMessage.value = compareMode.value === 'custom-regex'
      ? '兩側都未匹配到任何條件，請調整比較條件 Regex。'
      : '兩側都未匹配到任何條件，請確認比較方式或變數名稱。'
    return
  }

  const leftMap = toUniqueMap(leftItems)
  const rightMap = toUniqueMap(rightItems)

  const missingInRight = Array.from(leftMap.entries())
    .filter(([normalized]) => !rightMap.has(normalized))
    .map(([, original]) => original)
    .sort((a, b) => a.localeCompare(b))

  const missingInLeft = Array.from(rightMap.entries())
    .filter(([normalized]) => !leftMap.has(normalized))
    .map(([, original]) => original)
    .sort((a, b) => a.localeCompare(b))

  const result: CompareResult = {
    leftUniqueValues: Array.from(leftMap.values()).sort((a, b) => a.localeCompare(b)),
    rightUniqueValues: Array.from(rightMap.values()).sort((a, b) => a.localeCompare(b)),
    missingInRight,
    missingInLeft,
  }

  compareResult.value = result
  lastComparison.value = {
    leftInput: leftContent.value,
    rightInput: rightContent.value,
    leftFileName: leftFileName.value || null,
    rightFileName: rightFileName.value || null,
    compareMode: compareMode.value,
    textCompareMode: textCompareMode.value,
    variableName: variableName.value,
    conditionPattern: conditionPattern.value,
    conditionFlags: conditionFlags.value,
    ignoreCommentLines: ignoreCommentLines.value,
    ignoreCaseOnCompare: ignoreCaseOnCompare.value,
    result,
  }
}

const handleClear = () => {
  leftContent.value = ''
  rightContent.value = ''
  leftFileName.value = ''
  rightFileName.value = ''
  resetCompareOutputs({ clearError: true })
}

const handleSaveCurrent = () => {
  errorMessage.value = ''

  if (!lastComparison.value || (!compareResult.value && !textDiffResult.value)) {
    errorMessage.value = '尚無可儲存的比較結果，請先執行比較。'
    return
  }

  const textDiffStats = createTextDiffStats(textDiffResult.value)

  historyStore.saveHistoryItem({
    tool: 'sql-compare',
    action: compareMode.value === 'text-compare' ? 'compare-text-diff' : 'compare-missing-list',
    input: lastComparison.value.leftInput,
    output: compareMode.value === 'text-compare'
      ? JSON.stringify(textDiffStats, null, 2)
      : JSON.stringify(lastComparison.value.result, null, 2),
    metadata: {
      leftFileName: lastComparison.value.leftFileName,
      rightFileName: lastComparison.value.rightFileName,
      compareMode: lastComparison.value.compareMode,
      textCompareMode: lastComparison.value.textCompareMode,
      variableName: lastComparison.value.variableName,
      conditionPattern: lastComparison.value.conditionPattern,
      conditionFlags: lastComparison.value.conditionFlags,
      ignoreCommentLines: lastComparison.value.ignoreCommentLines,
      ignoreCaseOnCompare: lastComparison.value.ignoreCaseOnCompare,
      leftUniqueCount: lastComparison.value.result.leftUniqueValues.length,
      rightUniqueCount: lastComparison.value.result.rightUniqueValues.length,
      missingInRightCount: lastComparison.value.result.missingInRight.length,
      missingInLeftCount: lastComparison.value.result.missingInLeft.length,
      deletedLines: textDiffStats?.deleted ?? 0,
      insertedLines: textDiffStats?.inserted ?? 0,
      equalLines: textDiffStats?.equal ?? 0,
    },
  })

  markSavedTransient()
}

const leftUniqueCount = computed(() => compareResult.value?.leftUniqueValues.length ?? 0)
const rightUniqueCount = computed(() => compareResult.value?.rightUniqueValues.length ?? 0)
const missingInRightCount = computed(() => compareResult.value?.missingInRight.length ?? 0)
const missingInLeftCount = computed(() => compareResult.value?.missingInLeft.length ?? 0)
const textDiffStats = computed(() => {
  return createTextDiffStats(textDiffResult.value)
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

const getCompareModeButtonStyle = (mode: CompareMode) => {
  const isActive = compareMode.value === mode
  return {
    '--tool-button-bg': isActive ? '#2e7d32' : '#6b7280',
    opacity: isActive ? '1' : '0.9',
  }
}

const diffPaneStyle: CSSProperties = {
  flex: '1 1 0',
  overflow: 'auto',
  minHeight: 0,
  minWidth: 0,
  cursor: 'grab',
  userSelect: 'none',
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

const stopDragScrolling = () => {
  if (activeDragPane) {
    activeDragPane.style.cursor = 'grab'
  }

  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }

  activeDragPane = null
}

const handleDragMove = (event: MouseEvent) => {
  if (!activeDragPane) {
    return
  }

  const deltaX = event.clientX - dragStartX
  const deltaY = event.clientY - dragStartY

  activeDragPane.scrollLeft = dragStartScrollLeft - deltaX
  activeDragPane.scrollTop = dragStartScrollTop - deltaY
}

const handleDiffPaneMouseDown = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLDivElement | null
  if (!target) {
    return
  }

  activeDragPane = target
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartScrollLeft = target.scrollLeft
  dragStartScrollTop = target.scrollTop
  target.style.cursor = 'grabbing'

  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none'
  }

  event.preventDefault()
}

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', stopDragScrolling)
  window.addEventListener('mouseleave', stopDragScrolling)
}

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }

  if (typeof window === 'undefined') {
    return
  }

  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', stopDragScrolling)
  window.removeEventListener('mouseleave', stopDragScrolling)
})
</script>

<template>
  <div style="display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; padding: 10px; gap: 8px">
    <h2 style="margin: 0; font-size: 1.2em">SQL 比較器</h2>

    <div
      v-if="errorMessage"
      style="color: #D8000C; background-color: #FFD2D2; border: 1px solid #D8000C; padding: 8px; border-radius: 5px; font-size: 0.9em"
    >
      <strong>提示：</strong> {{ errorMessage }}
    </div>

    <div style="display: flex; flex-direction: column; gap: 6px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; background: #fafafa">
      <div style="display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 6px; align-items: center">
        <span style="font-size: 0.85em; color: #444">比較方式</span>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <button
            v-for="option in compareModeOptions"
            :key="option.value"
            @click="compareMode = option.value"
            class="tool-button tool-button--compact"
            :style="getCompareModeButtonStyle(option.value)"
            type="button"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div style="font-size: 0.8em; color: #666; margin-left: 126px">
        <span v-if="compareMode === 'variable-if'">if @變數 = '值'</span>
        <span v-else-if="compareMode === 'text-compare'">逐行比較文字（忽略空行，可排除註解行）</span>
        <span v-else>自訂 Regex 擷取第一個群組做比對</span>
      </div>

      <div
        v-if="compareMode === 'text-compare'"
        style="display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 6px; align-items: center"
      >
        <span style="font-size: 0.85em; color: #444">文字比對</span>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <button
            @click="textCompareMode = 'trim'"
            class="tool-button tool-button--compact"
            :style="{ '--tool-button-bg': textCompareMode === 'trim' ? '#2e7d32' : '#6b7280', opacity: textCompareMode === 'trim' ? '1' : '0.9' }"
            type="button"
          >
            忽略前後空白
          </button>
          <button
            @click="textCompareMode = 'exact'"
            class="tool-button tool-button--compact"
            :style="{ '--tool-button-bg': textCompareMode === 'exact' ? '#2e7d32' : '#6b7280', opacity: textCompareMode === 'exact' ? '1' : '0.9' }"
            type="button"
          >
            完全一致
          </button>
        </div>
      </div>

      <div
        v-if="compareMode === 'variable-if'"
        style="display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 6px; align-items: center"
      >
        <label for="variableName" style="font-size: 0.85em; color: #444">變數名稱</label>
        <input
          id="variableName"
          v-model="variableName"
          type="text"
          style="width: 100%; padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px"
          placeholder="例如: @docmd"
        >
      </div>

      <div
        v-if="compareMode === 'custom-regex'"
        style="display: grid; grid-template-columns: 120px minmax(0, 1fr) 80px 120px; gap: 6px; align-items: center"
      >
        <label for="conditionPattern" style="font-size: 0.85em; color: #444">比較條件 Regex</label>
        <input
          id="conditionPattern"
          v-model="conditionPattern"
          type="text"
          style="width: 100%; padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px"
          placeholder="例如: ^\\s*if\\s+@docmd\\s*=\\s*N?'([^']+)'"
        >
        <label for="conditionFlags" style="font-size: 0.85em; color: #444; text-align: right">Flags</label>
        <input
          id="conditionFlags"
          v-model="conditionFlags"
          type="text"
          style="width: 100%; padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px"
          placeholder="i"
        >
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 12px">
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer">
          <input v-model="ignoreCommentLines" type="checkbox">
          排除註解行（--）
        </label>
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #374151; cursor: pointer">
          <input v-model="ignoreCaseOnCompare" type="checkbox">
          比對忽略大小寫
        </label>
      </div>
    </div>

    <div style="display: flex; gap: 8px; width: 100%; box-sizing: border-box">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em; white-space: nowrap">左側 SQL</span>
          <span
            v-if="leftFileName"
            style="font-size: 0.8em; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px"
            :title="leftFileName"
          >{{ leftFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" accept=".sql,.txt" style="display: none" @change="handleFileUpload('left', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">上傳檔案</span>
          </label>
        </div>

        <textarea
          v-model="leftContent"
          placeholder="貼上左側 SQL 內容，或點擊「上傳檔案」..."
          spellcheck="false"
          style="width: 100%; min-height: 170px; padding: 5px; box-sizing: border-box; font-family: Consolas, monospace; font-size: 12px; line-height: 18px; border: 1px solid #ccc; border-radius: 5px; resize: vertical; overflow: auto; background-color: #ffffff; color: #1f2328"
        />
      </div>

      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px">
          <span style="font-weight: 600; font-size: 0.9em; white-space: nowrap">右側 SQL</span>
          <span
            v-if="rightFileName"
            style="font-size: 0.8em; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px"
            :title="rightFileName"
          >{{ rightFileName }}</span>
          <label style="cursor: pointer; line-height: 1">
            <input type="file" accept=".sql,.txt" style="display: none" @change="handleFileUpload('right', $event)">
            <span class="tool-button tool-button--compact" style="--tool-button-bg: #6b7280; display: inline-block">上傳檔案</span>
          </label>
        </div>

        <textarea
          v-model="rightContent"
          placeholder="貼上右側 SQL 內容，或點擊「上傳檔案」..."
          spellcheck="false"
          style="width: 100%; min-height: 170px; padding: 5px; box-sizing: border-box; font-family: Consolas, monospace; font-size: 12px; line-height: 18px; border: 1px solid #ccc; border-radius: 5px; resize: vertical; overflow: auto; background-color: #ffffff; color: #1f2328"
        />
      </div>
    </div>

    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap">
      <button @click="handleCompare" class="tool-button" style="--tool-button-bg: #4CAF50">
        {{ compareMode === 'text-compare' ? '比較全文差異' : '比較缺少清單' }}
      </button>
      <button @click="handleClear" class="tool-button" style="--tool-button-bg: #f44336">
        清空
      </button>
      <button @click="handleSaveCurrent" class="tool-button" style="--tool-button-bg: #2e7d32">
        儲存此次轉換
      </button>
      <span v-if="saveStatus === 'saved'" style="color: #2e7d32; align-self: center">已儲存</span>

      <template v-if="compareMode === 'text-compare' && textDiffStats">
        <span v-if="!textDiffStats.hasDiff" style="font-size: 0.85em; color: #2e7d32; font-weight: 500">
          ✓ 兩份內容相同（共 {{ textDiffStats.equal }} 行）
        </span>
        <span v-else style="font-size: 0.85em; color: #555">
          相同 {{ textDiffStats.equal }} 行 ／
          <span style="color: #c62828">刪除 {{ textDiffStats.deleted }} 行</span> ／
          <span style="color: #2e7d32">新增 {{ textDiffStats.inserted }} 行</span>
        </span>
      </template>

      <template v-else-if="compareResult">
        <span style="font-size: 0.85em; color: #555">
          左側 {{ leftUniqueCount }} 個 ／ 右側 {{ rightUniqueCount }} 個 ／
          <span style="color: #c62828">左缺 {{ missingInLeftCount }} 個</span> ／
          <span style="color: #2e7d32">右缺 {{ missingInRightCount }} 個</span>
        </span>
      </template>
    </div>

    <div
      v-if="compareMode === 'text-compare' && textDiffResult"
      style="height: min(420px, 55vh); min-height: 280px; flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: hidden; border: 1px solid #e0e0e0; border-radius: 6px; background-color: #fff"
    >
      <div style="display: flex; flex-direction: column; min-width: 0; border-right: 2px solid #bbb">
        <div style="display: grid; grid-template-columns: 44px minmax(0, 1fr); background-color: #f0f0f0; border-bottom: 2px solid #ccc; flex-shrink: 0">
          <div style="padding: 5px 4px; text-align: center; font-size: 11px; color: #555; font-weight: 600; border-right: 1px solid #ccc">#</div>
          <div style="padding: 5px 8px; text-align: left; font-size: 11px; color: #555; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            左側 SQL<span v-if="leftFileName" style="font-weight: 400; color: #888"> — {{ leftFileName }}</span>
          </div>
        </div>

        <div
          ref="leftDiffPane"
          :style="diffPaneStyle"
          @mousedown="handleDiffPaneMouseDown"
          @scroll="handleDiffPaneScroll('left', $event)"
        >
          <table style="width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; font-family: Consolas, monospace; font-size: 12px">
            <tbody>
              <tr v-for="(row, index) in textDiffResult" :key="`sql-left-row-${index}`">
                <td :style="getDiffLineNumberCellStyle(row.leftType)">{{ row.leftLineNum ?? '' }}</td>
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
            右側 SQL<span v-if="rightFileName" style="font-weight: 400; color: #888"> — {{ rightFileName }}</span>
          </div>
        </div>

        <div
          ref="rightDiffPane"
          :style="diffPaneStyle"
          @mousedown="handleDiffPaneMouseDown"
          @scroll="handleDiffPaneScroll('right', $event)"
        >
          <table style="width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; font-family: Consolas, monospace; font-size: 12px">
            <tbody>
              <tr v-for="(row, index) in textDiffResult" :key="`sql-right-row-${index}`">
                <td :style="getDiffLineNumberCellStyle(row.rightType)">{{ row.rightLineNum ?? '' }}</td>
                <td :style="getDiffContentCellStyle(row.rightType)">
                  <span v-if="row.rightType === 'insert'" style="color: #2e7d32; user-select: none; margin-right: 3px">+</span>{{ row.rightContent ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-else-if="compareResult" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-height: 0">
      <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; background: #fff">
        <h3 style="margin: 0 0 6px 0; font-size: 0.95em; color: #2e7d32">右側缺少（左有右無）</h3>
        <pre
          style="margin: 0; max-height: 220px; overflow: auto; background-color: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-word"
        >{{ compareResult.missingInRight.length ? compareResult.missingInRight.join('\n') : '（無）' }}</pre>
      </div>

      <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; background: #fff">
        <h3 style="margin: 0 0 6px 0; font-size: 0.95em; color: #c62828">左側缺少（右有左無）</h3>
        <pre
          style="margin: 0; max-height: 220px; overflow: auto; background-color: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-word"
        >{{ compareResult.missingInLeft.length ? compareResult.missingInLeft.join('\n') : '（無）' }}</pre>
      </div>
    </div>

    <p style="margin: 0; font-size: 0.75em; color: #666">
      * 建議先用「指定變數」或「文字比較」；只有特殊格式才需要切到「進階：自訂 Regex」。
    </p>
  </div>
</template>
