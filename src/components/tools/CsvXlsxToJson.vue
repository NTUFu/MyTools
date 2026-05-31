<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import * as XLSX from 'xlsx'

const selectedFile = ref<File | null>(null)
const selectedFileName = ref('')
const errorMessage = ref('')
const isParsing = ref(false)
const parsedHeaders = ref<string[]>([])
const parsedRows = ref<string[][]>([])
const currentPage = ref(1)
const pageSize = ref(50)
const searchQuery = ref('')
const editMode = ref(false)
const editingRowIndex = ref<number | null>(null)
const editingBuffer = reactive<{ cells: string[] }>({ cells: [] })
const deleteConfirmIndex = ref<number | null>(null)
const txtDelimiter = ref<'tab' | 'comma' | 'pipe' | 'semicolon'>('tab')

const totalRows = computed(() => parsedRows.value.length)
const totalColumns = computed(() => parsedHeaders.value.length)
const trimmedSearchQuery = computed(() => searchQuery.value.trim())
const normalizedSearchQuery = computed(() => trimmedSearchQuery.value.toLowerCase())

const rowViewModels = computed(() => parsedRows.value.map((row, idx) => ({ originalIndex: idx + 1, row })))

const filteredRows = computed(() => {
  if (!normalizedSearchQuery.value) {
    return rowViewModels.value
  }

  return rowViewModels.value.filter(({ row }) => row.some((cell) => cell.toLowerCase().includes(normalizedSearchQuery.value)))
})

const filteredCount = computed(() => filteredRows.value.length)
const deleteConfirmRow = computed(() =>
  deleteConfirmIndex.value !== null ? (parsedRows.value[deleteConfirmIndex.value] ?? []) : [],
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredCount.value / pageSize.value)))

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

const parsedObjects = computed(() => {
  return parsedRows.value.map((row) => {
    const mapped: Record<string, string> = {}

    parsedHeaders.value.forEach((header, columnIndex) => {
      mapped[header] = row[columnIndex] ?? ''
    })

    return mapped
  })
})

const hasParsedData = computed(() => totalRows.value > 0 && totalColumns.value > 0)
const txtDelimiterChar = computed(() => {
  if (txtDelimiter.value === 'comma') {
    return ','
  }

  if (txtDelimiter.value === 'pipe') {
    return '|'
  }

  if (txtDelimiter.value === 'semicolon') {
    return ';'
  }

  return '\t'
})

const sanitizeHeader = (header: unknown, index: number): string => {
  const text = String(header ?? '').trim()
  if (text === '') {
    return `Column_${index + 1}`
  }

  return text
}

const resetParsedState = () => {
  parsedHeaders.value = []
  parsedRows.value = []
  currentPage.value = 1
  searchQuery.value = ''
  editMode.value = false
  editingRowIndex.value = null
  editingBuffer.cells.splice(0)
  deleteConfirmIndex.value = null
}

const handlePageSizeChange = () => {
  currentPage.value = 1
}

const handleSearchChange = () => {
  currentPage.value = 1
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapedSearchRegex = computed(() => {
  if (!trimmedSearchQuery.value) {
    return null
  }

  const escapedQuery = escapeRegex(escapeHtml(trimmedSearchQuery.value))
  return new RegExp(escapedQuery, 'gi')
})

const highlightMatch = (value: string): string => {
  if (!escapedSearchRegex.value) {
    return escapeHtml(value)
  }

  const escapedHtml = escapeHtml(value)
  return escapedHtml.replace(escapedSearchRegex.value, (m) => `<mark style="background:#fff176;padding:0">${m}</mark>`)
}

const resetAllState = () => {
  errorMessage.value = ''
  resetParsedState()
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

const parseFileForBrowsing = async () => {
  resetAllState()

  if (!selectedFile.value) {
    errorMessage.value = '請先選擇 csv 或 xlsx 檔案。'
    return
  }

  isParsing.value = true

  try {
    ensureSupportedFile(selectedFile.value)
    const workbook = await parseWorkbook(selectedFile.value)
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      throw new Error('檔案內容為空，無法解析。')
    }

    const firstSheet = workbook.Sheets[firstSheetName]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: '',
    })

    if (!Array.isArray(matrix) || matrix.length === 0) {
      throw new Error('檔案沒有可解析資料。')
    }

    const [headerRow, ...bodyRows] = matrix
    if (!Array.isArray(headerRow) || headerRow.length === 0) {
      throw new Error('缺少欄位列，請確認第一列為欄位名稱。')
    }

    const headers = headerRow.map((cell, index) => sanitizeHeader(cell, index))
    const rows = bodyRows
      .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => headers.map((_, columnIndex) => String((row as unknown[])[columnIndex] ?? '')))

    if (rows.length === 0) {
      throw new Error('檔案沒有可瀏覽的資料列。')
    }

    parsedHeaders.value = headers
    parsedRows.value = rows
    currentPage.value = 1
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = `解析失敗：${error.message}`
    } else {
      errorMessage.value = '解析失敗：檔案格式不符合或內容無法解析。'
    }
  } finally {
    isParsing.value = false
  }
}

const handleFileChange = (event: Event) => {
  resetAllState()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null

  selectedFile.value = file
  selectedFileName.value = file?.name ?? ''
}

const downloadContent = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

const toSafeFileName = (name: string) => {
  if (name.trim() === '') {
    return 'parsed-data'
  }

  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_\u4e00-\u9fff]/g, '_')
}

const createTimestamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const exportAsJson = () => {
  if (!hasParsedData.value) {
    errorMessage.value = '目前沒有可匯出的資料。'
    return
  }

  errorMessage.value = ''
  const content = JSON.stringify(parsedObjects.value, null, 2)
  const fileName = `${toSafeFileName(selectedFileName.value)}-${createTimestamp()}.json`
  downloadContent(content, fileName, 'application/json;charset=utf-8')
}

const exportAsCsv = () => {
  if (!hasParsedData.value) {
    errorMessage.value = '目前沒有可匯出的資料。'
    return
  }

  errorMessage.value = ''
  const matrix: string[][] = [parsedHeaders.value, ...parsedRows.value]
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: txtDelimiterChar.value })
  const fileName = `${toSafeFileName(selectedFileName.value)}-${createTimestamp()}.csv`
  downloadContent(csv, fileName, 'text/csv;charset=utf-8')
}

const exportAsTxt = () => {
  if (!hasParsedData.value) {
    errorMessage.value = '目前沒有可匯出的資料。'
    return
  }

  errorMessage.value = ''
  const rows = [parsedHeaders.value, ...parsedRows.value]
  const text = rows.map((row) => row.join(txtDelimiterChar.value)).join('\n')
  const fileName = `${toSafeFileName(selectedFileName.value)}-${createTimestamp()}.txt`
  downloadContent(text, fileName, 'text/plain;charset=utf-8')
}

const goToPreviousPage = () => {
  if (currentPage.value <= 1) {
    return
  }

  currentPage.value -= 1
}

const goToNextPage = () => {
  if (currentPage.value >= totalPages.value) {
    return
  }

  currentPage.value += 1
}

const toggleEditMode = () => {
  editMode.value = !editMode.value
  editingRowIndex.value = null
  editingBuffer.cells.splice(0)
  deleteConfirmIndex.value = null
}

const startEdit = (parsedRowIndex: number) => {
  editingRowIndex.value = parsedRowIndex
  const source = parsedRows.value[parsedRowIndex] ?? []
  editingBuffer.cells.splice(0, editingBuffer.cells.length, ...source)
}

const saveEdit = (parsedRowIndex: number) => {
  parsedRows.value[parsedRowIndex] = [...editingBuffer.cells]
  editingRowIndex.value = null
  editingBuffer.cells.splice(0)
}

const cancelEdit = () => {
  editingRowIndex.value = null
  editingBuffer.cells.splice(0)
}

const updateEditingBuffer = (columnIndex: number, value: string) => {
  editingBuffer.cells[columnIndex] = value
}

const requestDelete = (parsedRowIndex: number) => {
  deleteConfirmIndex.value = parsedRowIndex
}

const confirmDelete = () => {
  if (deleteConfirmIndex.value === null) {
    return
  }

  parsedRows.value.splice(deleteConfirmIndex.value, 1)
  deleteConfirmIndex.value = null

  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value)
  }
}

const cancelDelete = () => {
  deleteConfirmIndex.value = null
}
</script>

<template>
  <div style="padding: 20px; width: 100%; box-sizing: border-box">
    <h2>CSV/XLSX Parser</h2>
    <p style="margin-bottom: 15px">上傳 csv 或 xlsx，分頁瀏覽資料表格；支援關鍵字搜尋（符合列黃底標記）、單筆編輯與刪除（含刪除前預覽確認）；可設定分隔符號後匯出 json、csv、txt，匯出以畫面最後呈現資料為準。</p>

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
        :disabled="isParsing"
        @click="parseFileForBrowsing"
      >
        {{ isParsing ? '解析中...' : '解析並瀏覽' }}
      </button>
    </div>

    <div
      style="border: 1px solid #dcdcdc; border-radius: 8px; padding: 12px; margin-bottom: 12px; background-color: #fafbfd"
    >
      <div style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px">匯出設定</div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <label style="display: inline-flex; align-items: center; gap: 8px; color: #444; font-size: 13px">
          匯出分隔符號
          <select
            v-model="txtDelimiter"
            style="height: 32px; border: 1px solid #c8c8c8; border-radius: 6px; padding: 0 8px"
          >
            <option value="tab">Tab</option>
            <option value="comma">Comma (,)</option>
            <option value="pipe">Pipe (|)</option>
            <option value="semicolon">Semicolon (;)</option>
          </select>
        </label>

        <button
          class="tool-button"
          style="--tool-button-bg: #2e7d32"
          @click="exportAsJson"
          :disabled="!hasParsedData"
        >
          匯出 JSON
        </button>
        <button
          class="tool-button"
          style="--tool-button-bg: #ef6c00"
          @click="exportAsCsv"
          :disabled="!hasParsedData"
        >
          匯出 CSV
        </button>
        <button
          class="tool-button"
          style="--tool-button-bg: #6a1b9a"
          @click="exportAsTxt"
          :disabled="!hasParsedData"
        >
          匯出 TXT
        </button>
      </div>

      <div style="margin-top: 8px; font-size: 12px; color: #64748b">
        CSV 與 TXT 會共用同一個分隔符號設定。
      </div>
    </div>

    <p
      v-if="selectedFileName"
      style="margin-top: -4px; margin-bottom: 12px; color: #555; overflow-wrap: anywhere"
    >
      已選擇檔案：{{ selectedFileName }}
    </p>

    <div
      v-if="hasParsedData"
      style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; color: #444; flex-wrap: wrap"
    >
      <span>總欄位：{{ totalColumns }}</span>
      <span>總資料列：{{ totalRows }}</span>
      <span
        v-if="trimmedSearchQuery"
        style="background: #fff9c4; border: 1px solid #f9a825; border-radius: 4px; padding: 2px 8px; color: #e65100; font-size: 12px"
      >搜尋到：{{ filteredCount }} 筆</span>
      <span>目前頁次：{{ currentPage }} / {{ totalPages }}</span>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px">
        搜尋
        <input
          v-model="searchQuery"
          @input="handleSearchChange"
          type="text"
          placeholder="輸入關鍵字..."
          style="height: 28px; border: 1px solid #c8c8c8; border-radius: 6px; padding: 0 8px; font-size: 13px; width: 180px"
        >
      </label>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px">
        每頁顯示
        <select
          v-model.number="pageSize"
          @change="handlePageSizeChange"
          style="height: 28px; border: 1px solid #c8c8c8; border-radius: 6px; padding: 0 6px"
        >
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
          <option :value="500">500</option>
        </select>
        筆
      </label>
      <button
        class="tool-button tool-button--compact"
        style="--tool-button-bg: #455a64"
        @click="goToPreviousPage"
        :disabled="currentPage <= 1"
      >
        上一頁
      </button>
      <button
        class="tool-button tool-button--compact"
        style="--tool-button-bg: #455a64"
        @click="goToNextPage"
        :disabled="currentPage >= totalPages"
      >
        下一頁
      </button>
      <button
        class="tool-button tool-button--compact"
        :style="`--tool-button-bg: ${editMode ? '#b71c1c' : '#37474f'}`"
        @click="toggleEditMode"
      >
        {{ editMode ? '關閉編輯模式' : '開啟編輯模式' }}
      </button>
    </div>

    <div
      style="border: 1px solid #dcdcdc; border-radius: 8px; overflow: auto; max-height: 70vh; background-color: #fff"
    >
      <table style="border-collapse: collapse; min-width: 100%; table-layout: auto">
        <thead>
          <tr>
            <th
              style="position: sticky; top: 0; left: 0; z-index: 3; background: #e8eaf6; border-bottom: 2px solid #9fa8da; border-right: 1px solid #c5cae9; padding: 8px; text-align: center; font-size: 12px; color: #5c6bc0; width: 52px; min-width: 52px"
            >
              #
            </th>
            <th
              v-if="editMode"
              style="position: sticky; top: 0; left: 52px; z-index: 3; background: #fff3e0; border-bottom: 2px solid #ffb74d; border-right: 1px solid #ffe0b2; padding: 8px; text-align: center; font-size: 12px; color: #e65100; width: 116px; min-width: 116px"
            >
              操作
            </th>
            <th
              v-for="(header, headerIndex) in parsedHeaders"
              :key="`header-${headerIndex}`"
              style="position: sticky; top: 0; background: #f5f7fa; border-bottom: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; white-space: nowrap"
            >
              {{ header }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, rowIndex) in pagedRows"
            :key="`row-${item.originalIndex}`"
            :style="editingRowIndex === item.originalIndex - 1 ? 'background:#fffde7' : ''"
          >
            <td
              style="position: sticky; left: 0; z-index: 1; border-top: 1px solid #e8eaf6; background: #f3f4fb; padding: 8px; font-size: 12px; text-align: center; color: #9fa8da; font-variant-numeric: tabular-nums; user-select: none; width: 52px; min-width: 52px; border-right: 1px solid #c5cae9"
            >
              {{ item.originalIndex }}
            </td>
            <td
              v-if="editMode"
              style="position: sticky; left: 52px; z-index: 1; border-top: 1px solid #ffe0b2; background: #fff8f0; padding: 6px 8px; text-align: center; white-space: nowrap; width: 116px; min-width: 116px; border-right: 1px solid #ffe0b2"
            >
              <template v-if="editingRowIndex === item.originalIndex - 1">
                <button
                  class="tool-button tool-button--compact"
                  style="--tool-button-bg: #2e7d32; margin-right: 4px"
                  @click="saveEdit(item.originalIndex - 1)"
                >
                  儲存
                </button>
                <button
                  class="tool-button tool-button--compact"
                  style="--tool-button-bg: #546e7a"
                  @click="cancelEdit()"
                >
                  取消
                </button>
              </template>
              <template v-else>
                <button
                  class="tool-button tool-button--compact"
                  style="--tool-button-bg: #1565c0; margin-right: 4px"
                  @click="startEdit(item.originalIndex - 1)"
                  :disabled="editingRowIndex !== null"
                >
                  編輯
                </button>
                <button
                  class="tool-button tool-button--compact"
                  style="--tool-button-bg: #c62828"
                  @click="requestDelete(item.originalIndex - 1)"
                  :disabled="editingRowIndex !== null"
                >
                  刪除
                </button>
              </template>
            </td>
            <template v-if="editingRowIndex === item.originalIndex - 1">
              <td
                v-for="(value, columnIndex) in item.row"
                :key="`cell-edit-${rowIndex}-${columnIndex}`"
                style="border-top: 1px solid #f0f0f0; padding: 4px 6px; white-space: nowrap"
              >
                <input
                  :value="editingBuffer.cells[columnIndex]"
                  @input="updateEditingBuffer(columnIndex, ($event.target as HTMLInputElement).value)"
                  style="width: 100%; box-sizing: border-box; border: 1px solid #90caf9; border-radius: 4px; padding: 4px 6px; font-size: 12px; background: #fff; color: #1a1a1a"
                >
              </td>
            </template>
            <template v-else>
              <td
                v-for="(value, columnIndex) in item.row"
                :key="`cell-${rowIndex}-${columnIndex}`"
                style="border-top: 1px solid #f0f0f0; padding: 8px; font-size: 12px; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis"
                v-html="highlightMatch(value)"
              />
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="deleteConfirmIndex !== null"
      style="position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center"
      @click.self="cancelDelete"
    >
      <div style="background: #fff; border-radius: 12px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.25)">
        <div style="font-size: 16px; font-weight: 700; color: #b71c1c; margin-bottom: 8px">確認刪除</div>
        <p style="font-size: 13px; color: #555; margin-bottom: 14px">
          確定要刪除第 <strong>{{ (deleteConfirmIndex ?? 0) + 1 }}</strong> 筆資料？此操作無法復原。
        </p>
        <div style="overflow: auto; border: 1px solid #ffcdd2; border-radius: 6px; margin-bottom: 18px">
          <table style="border-collapse: collapse; width: 100%; font-size: 12px">
            <tr v-for="(header, i) in parsedHeaders" :key="`del-preview-${i}`">
              <td style="padding: 6px 10px; background: #fce4ec; color: #b71c1c; font-weight: 600; border-bottom: 1px solid #ffcdd2; white-space: nowrap; width: 40%">{{ header }}</td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #ffcdd2; word-break: break-word">{{ deleteConfirmRow[i] ?? '' }}</td>
            </tr>
          </table>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end">
          <button class="tool-button" style="--tool-button-bg: #546e7a" @click="cancelDelete">取消</button>
          <button class="tool-button" style="--tool-button-bg: #b71c1c" @click="confirmDelete">確認刪除</button>
        </div>
      </div>
    </div>
  </div>
</template>
