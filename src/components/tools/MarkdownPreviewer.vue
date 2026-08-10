<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useHistoryStore } from '../../stores/history'

import type { default as TurndownClass } from 'turndown'
import type * as MammothModule from 'mammoth'
import type { gfm as GfmPlugin } from 'turndown-plugin-gfm'
import type * as XlsxModule from 'xlsx'

let markedLib: ((value: string) => string | Promise<string>) | null = null
let mammothLib: typeof MammothModule | null = null
let turndownServiceCtor: typeof TurndownClass | null = null
let gfmPlugin: typeof GfmPlugin | null = null
let xlsxLib: typeof XlsxModule | null = null
type PrettierFormatOptions = {
  parser: 'markdown'
  plugins: unknown[]
  proseWrap: 'preserve'
  printWidth: number
  tabWidth: number
  useTabs: boolean
}
type MarkdownPrettierFormatter = (source: string, options: PrettierFormatOptions) => string | Promise<string>
let prettierFormat: MarkdownPrettierFormatter | null = null
let prettierMarkdownPlugin: unknown = null

const loadMarkdownDependencies = async () => {
  if (markedLib && mammothLib && turndownServiceCtor && gfmPlugin && xlsxLib) {
    return { markedLib, mammothLib, turndownServiceCtor, gfmPlugin, xlsxLib }
  }

  const [markedModule, mammothModule, turndownModule, xlsxModule] = await Promise.all([
    import('marked'),
    import('mammoth'),
    import('turndown'),
    import('xlsx'),
  ])

  const gfmModule = await import('turndown-plugin-gfm')

  markedLib = markedModule.marked
  mammothLib = mammothModule
  turndownServiceCtor = turndownModule.default
  gfmPlugin = gfmModule.gfm
  xlsxLib = xlsxModule

  return { markedLib, mammothLib, turndownServiceCtor, gfmPlugin, xlsxLib }
}

const historyStore = useHistoryStore()

const markdownInput = ref('')
const saveStatus = ref<'none' | 'saved'>('none')
const isFormattingMarkdown = ref(false)
const errorMessage = ref('')
const isFullscreen = ref(false)
const selectedFileName = ref('')
const isParsingFile = ref(false)
const parseStatus = ref('')
const usePythonApi = ref(true)
const pythonApiError = ref('')
const pythonApiAvailable = ref<boolean | null>(null)
const isLocalRuntime = computed(() => {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
})

const turndown = ref<TurndownClass | null>(null)

const markItDownSupportedTypes = [
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.xls',
  '.csv',
  '.html',
  '.htm',
  '.xml',
  '.json',
  '.txt',
  '.md',
  '.jpg/.jpeg/.png',
  '.wav/.mp3',
]

const browserParsedTypes = ['.md', '.markdown', '.txt', '.html', '.htm', '.json', '.xml', '.yaml', '.yml', '.csv', '.xlsx', '.xls', '.docx']
const pythonApiPreferredTypes = ['.pdf', '.pptx', '.docx', '.xlsx', '.xls', '.csv', '.html', '.htm', '.xml', '.json', '.txt', '.md', '.jpg', '.jpeg', '.png', '.wav', '.mp3', '.zip', '.epub']

let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

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

const handleInputChange = () => {
  saveStatus.value = 'none'
  errorMessage.value = ''
}

const ensureTurndownService = async () => {
  if (turndown.value) {
    return turndown.value
  }

  const { turndownServiceCtor, gfmPlugin } = await loadMarkdownDependencies()
  const service = new turndownServiceCtor({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  service.use(gfmPlugin)
  turndown.value = service
  return service
}

const ensureMarkdownFormatter = async (): Promise<{ prettierFormat: MarkdownPrettierFormatter; prettierMarkdownPlugin: unknown }> => {
  if (prettierFormat && prettierMarkdownPlugin) {
    return { prettierFormat, prettierMarkdownPlugin }
  }

  const [prettierStandaloneModule, prettierMarkdownModule] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/markdown'),
  ])

  const loadedPrettierFormat = prettierStandaloneModule.format as MarkdownPrettierFormatter
  const loadedPrettierMarkdownPlugin = prettierMarkdownModule.default ?? prettierMarkdownModule

  prettierFormat = loadedPrettierFormat
  prettierMarkdownPlugin = loadedPrettierMarkdownPlugin

  return { prettierFormat: loadedPrettierFormat, prettierMarkdownPlugin: loadedPrettierMarkdownPlugin }
}

const handleMarkdownPaste = async (event: ClipboardEvent) => {
  const clipboard = event.clipboardData
  if (!clipboard) {
    return
  }

  const service = await ensureTurndownService()
  if (!clipboard) {
    return
  }

  const html = clipboard.getData('text/html').trim()
  if (html === '' || !/<table[\s>]/i.test(html)) {
    return
  }

  const converted = normalizeMarkdownTables(service.turndown(html)).trim()
  if (converted === '') {
    return
  }

  event.preventDefault()

  const target = event.target as HTMLTextAreaElement | null
  if (!target) {
    markdownInput.value = markdownInput.value.trim() === '' ? converted : `${markdownInput.value}\n\n${converted}`
  } else {
    const start = target.selectionStart
    const end = target.selectionEnd
    markdownInput.value = `${markdownInput.value.slice(0, start)}${converted}${markdownInput.value.slice(end)}`
  }

  saveStatus.value = 'none'
  errorMessage.value = ''
  parseStatus.value = '已偵測貼上內容含表格，已自動轉為 Markdown 表格。'
}

const parseUploadedFileViaPythonApi = async (file: File): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/convert', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { detail?: string }
      if (typeof payload.detail === 'string' && payload.detail.trim() !== '') {
        detail = payload.detail
      }
    } catch {
      // Keep default HTTP error text.
    }

    throw new Error(detail)
  }

  const payload = (await response.json()) as { markdown?: string }
  if (typeof payload.markdown !== 'string') {
    throw new Error('API 回傳格式不正確。')
  }

  return payload.markdown
}

const checkPythonApiAvailability = async () => {
  try {
    const response = await fetch('/api/health')
    pythonApiAvailable.value = response.ok
    if (!response.ok) {
      pythonApiError.value = '本地 Python API 未啟動，將使用前端解析。'
    }
  } catch {
    pythonApiAvailable.value = false
    pythonApiError.value = '本地 Python API 未啟動，將使用前端解析。'
  }
}

const getFileExtension = (name: string): string => {
  const idx = name.lastIndexOf('.')
  if (idx < 0) {
    return ''
  }

  return name.slice(idx).toLowerCase()
}

const buildMarkdownTable = (rows: string[][]): string => {
  if (rows.length === 0) {
    return ''
  }

  const maxColumns = Math.max(...rows.map((row) => row.length))
  const normalizedRows = rows.map((row) => Array.from({ length: maxColumns }, (_, idx) => String(row[idx] ?? '').trim()))
  const [headerRow, ...bodyRows] = normalizedRows
  const safeHeader = headerRow.map((cell, idx) => (cell === '' ? `Column ${idx + 1}` : cell))
  const separator = safeHeader.map(() => '---')
  const markdownRows = [safeHeader, separator, ...bodyRows]

  return markdownRows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')
}

const extractRowsFromHtmlTable = (tableHtml: string): string[][] => {
  if (typeof window === 'undefined') {
    return []
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(tableHtml, 'text/html')
  const table = doc.querySelector('table')

  if (!table) {
    return []
  }

  return Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()))
    .filter((row) => row.length > 0)
}

const convertHtmlTableToMarkdown = (tableHtml: string): string => {
  const rows = extractRowsFromHtmlTable(tableHtml)
  if (rows.length === 0) {
    return tableHtml
  }

  return buildMarkdownTable(rows)
}

const normalizeMarkdownTables = (markdown: string): string => {
  return markdown.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => convertHtmlTableToMarkdown(tableHtml))
}

const parseCsvAsMarkdown = async (file: File): Promise<string> => {
  const { xlsxLib: xlsx } = await loadMarkdownDependencies()
  const text = await file.text()
  const workbook = xlsx.read(text, { type: 'string', raw: false })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('CSV 內容為空。')
  }

  const matrix = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    blankrows: false,
    raw: false,
    defval: '',
  })

  const rows = matrix.map((row: unknown[]) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
  if (rows.length === 0) {
    throw new Error('CSV 沒有可轉換內容。')
  }

  return buildMarkdownTable(rows)
}

const parseXlsxAsMarkdown = async (file: File): Promise<string> => {
  const { xlsxLib: xlsx } = await loadMarkdownDependencies()
  const buffer = await file.arrayBuffer()
  const workbook = xlsx.read(buffer, { type: 'array', raw: false })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('Excel 內容為空。')
  }

  const matrix = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    blankrows: false,
    raw: false,
    defval: '',
  })

  const rows = matrix.map((row: unknown[]) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
  if (rows.length === 0) {
    throw new Error('Excel 沒有可轉換內容。')
  }

  return buildMarkdownTable(rows)
}

const parseDocxAsMarkdown = async (file: File): Promise<string> => {
  const { mammothLib, turndownServiceCtor, gfmPlugin } = await loadMarkdownDependencies()
  const buffer = await file.arrayBuffer()
  const { value: html } = await mammothLib.convertToHtml({ arrayBuffer: buffer })
  const service = new turndownServiceCtor({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  service.use(gfmPlugin)
  return normalizeMarkdownTables(service.turndown(html))
}

const parseUploadedFileToMarkdown = async (file: File): Promise<string> => {
  const ext = getFileExtension(file.name)

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    return await file.text()
  }

  if (ext === '.html' || ext === '.htm') {
    const html = await file.text()
    const service = await ensureTurndownService()
    return normalizeMarkdownTables(service.turndown(html))
  }

  if (ext === '.json') {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text)
      return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``
    } catch {
      return `\`\`\`json\n${text}\n\`\`\``
    }
  }

  if (ext === '.xml' || ext === '.yaml' || ext === '.yml') {
    const text = await file.text()
    const lang = ext === '.xml' ? 'xml' : 'yaml'
    return `\`\`\`${lang}\n${text}\n\`\`\``
  }

  if (ext === '.csv') {
    return await parseCsvAsMarkdown(file)
  }

  if (ext === '.xlsx' || ext === '.xls') {
    return await parseXlsxAsMarkdown(file)
  }

  if (ext === '.docx') {
    return await parseDocxAsMarkdown(file)
  }

  throw new Error(`目前前端版本尚未支援 ${ext || '此'} 檔案型別。`)
}

const handleUploadFile = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null

  parseStatus.value = ''
  errorMessage.value = ''
  pythonApiError.value = ''
  selectedFileName.value = file?.name ?? ''

  if (!file) {
    return
  }

  isParsingFile.value = true

  try {
    if (usePythonApi.value) {
      try {
        markdownInput.value = normalizeMarkdownTables(await parseUploadedFileViaPythonApi(file))
        parseStatus.value = `已由 Python API 解析：${file.name}`
        saveStatus.value = 'none'
        return
      } catch (apiError) {
        pythonApiAvailable.value = false
        if (apiError instanceof Error) {
          pythonApiError.value = `Python API 解析失敗，改用前端解析：${apiError.message}`
        } else {
          pythonApiError.value = 'Python API 解析失敗，改用前端解析。'
        }
      }
    }

    markdownInput.value = normalizeMarkdownTables(await parseUploadedFileToMarkdown(file))
    saveStatus.value = 'none'
    parseStatus.value = `已完成前端解析：${file.name}`
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = `檔案解析失敗：${error.message}`
    } else {
      errorMessage.value = '檔案解析失敗：未知錯誤。'
    }
  } finally {
    isParsingFile.value = false
  }
}

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const placeholderText =
  '請輸入 Markdown 文本，例如：\n# 這是標題一\n\n這是一段 **粗體** 和 *斜體* 的文本。\n\n* 列表項目一\n* 列表項目二\n\n```javascript\n// 這是程式碼區塊\nconsole.log("Hello world");\n```\n\n[Google 連結](https://www.google.com)'

const htmlOutput = ref('')

const updateHtmlOutput = async () => {
  try {
    const { markedLib: activeMarked } = await loadMarkdownDependencies()
    if (!activeMarked) {
      htmlOutput.value = ''
      return
    }

    const parsed = await activeMarked(markdownInput.value)
    htmlOutput.value = typeof parsed === 'string' ? parsed : ''
  } catch {
    htmlOutput.value = ''
  }
}

watch(markdownInput, () => {
  void updateHtmlOutput()
})

const handleSaveCurrent = () => {
  errorMessage.value = ''

  if (markdownInput.value.trim() === '') {
    errorMessage.value = '尚無可儲存資料，請先輸入 Markdown。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'markdown-previewer',
    action: 'render',
    input: markdownInput.value,
    output: htmlOutput.value,
  })

  markSavedTransient()
}

const handleConvertInlineHtmlTables = () => {
  const converted = normalizeMarkdownTables(markdownInput.value)

  if (converted === markdownInput.value) {
    parseStatus.value = '未偵測到可轉換的 HTML table。'
    return
  }

  markdownInput.value = converted
  saveStatus.value = 'none'
  errorMessage.value = ''
  parseStatus.value = '已將輸入內容中的 HTML table 轉為 Markdown 表格。'
}

const handleFormatMarkdown = async () => {
  errorMessage.value = ''
  parseStatus.value = ''

  if (markdownInput.value.trim() === '') {
    errorMessage.value = '尚無可格式化內容，請先輸入 Markdown。'
    return
  }

  isFormattingMarkdown.value = true

  try {
    const { prettierFormat, prettierMarkdownPlugin } = await ensureMarkdownFormatter()
    const formatted = await prettierFormat(markdownInput.value, {
      parser: 'markdown',
      plugins: [prettierMarkdownPlugin],
      proseWrap: 'preserve',
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
    })

    if (formatted === markdownInput.value) {
      parseStatus.value = '內容已符合格式。'
      return
    }

    markdownInput.value = formatted
    saveStatus.value = 'none'
    parseStatus.value = '已完成 Markdown 格式化。'
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = `Markdown 格式化失敗：${error.message}`
    } else {
      errorMessage.value = 'Markdown 格式化失敗：未知錯誤。'
    }
  } finally {
    isFormattingMarkdown.value = false
  }
}

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
})

onMounted(() => {
  void updateHtmlOutput()
  void ensureTurndownService()

  if (isLocalRuntime.value) {
    usePythonApi.value = true
    void checkPythonApiAvailability()
    return
  }

  usePythonApi.value = false
  pythonApiAvailable.value = false
  pythonApiError.value = '目前為靜態部署環境，已停用本地 Python API。'
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; min-height: 80vh; font-family: Inter, sans-serif">
    <h1>Markdown 實時預覽器</h1>
    <p style="color: #666; margin-bottom: 15px">在左側輸入 Markdown 文本。</p>

    <div style="border: 1px solid #dbeafe; background: #f8fbff; border-radius: 8px; padding: 12px">
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap">
        <strong>MarkItDown 參考：</strong>
        <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noopener noreferrer">
          microsoft/markitdown
        </a>
      </div>
      <p style="margin: 8px 0 6px 0; color: #444">官方支援類型（依專案說明）：{{ markItDownSupportedTypes.join('、') }}</p>
      <p style="margin: 0; color: #666">目前此頁面前端可直接解析：{{ browserParsedTypes.join('、') }}。其中 HTML 會自動轉成 Markdown。</p>
      <p style="margin: 6px 0 0 0; color: #666">本地 Python API 優先支援類型：{{ pythonApiPreferredTypes.join('、') }}</p>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px">
      <template v-if="isLocalRuntime">
        <label style="display: flex; align-items: center; gap: 6px; color: #444">
          <input v-model="usePythonApi" type="checkbox">
          優先使用本地 Python 轉換 API（MarkItDown）
        </label>
        <p v-if="pythonApiAvailable === true" style="margin: 0; color: #2e7d32">本地 Python API 狀態：可連線</p>
        <p v-else-if="pythonApiAvailable === false" style="margin: 0; color: #ed6c02">本地 Python API 狀態：不可用，會自動改用前端解析</p>
      </template>
      <p v-else style="margin: 0; color: #ed6c02">目前為靜態部署環境，固定使用前端解析。</p>
      <p v-if="pythonApiError" style="margin: 0; color: #ed6c02">{{ pythonApiError }}</p>

      <label for="markdownUpload" style="font-weight: bold">上傳檔案（解析為 Markdown）</label>
      <input
        id="markdownUpload"
        type="file"
        :disabled="isParsingFile"
        @change="handleUploadFile"
      />
      <p v-if="selectedFileName" style="margin: 0; color: #555">已選擇：{{ selectedFileName }}</p>
      <p v-if="isParsingFile" style="margin: 0; color: #1976d2">解析中，請稍候...</p>
      <p v-if="parseStatus" style="margin: 0; color: #2e7d32">{{ parseStatus }}</p>
    </div>

    <p
      v-if="errorMessage"
      style="color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px; margin: 0"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 10px; align-items: center">
      <button
        @click="handleFormatMarkdown"
        class="tool-button"
        style="--tool-button-bg: #6a1b9a"
        :disabled="isFormattingMarkdown"
      >
        {{ isFormattingMarkdown ? '格式化中...' : '格式化 Markdown' }}
      </button>

      <button
        @click="handleConvertInlineHtmlTables"
        class="tool-button"
        style="--tool-button-bg: #1565c0"
      >
        轉換輸入中的 HTML 表格
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

    <div style="flex-grow: 1; display: flex; flex-direction: row; gap: 20px">
      <div style="flex: 1; position: relative; min-width: 0; display: flex; flex-direction: column">
        <label for="markdownInput" style="font-weight: bold; margin-bottom: 8px">Markdown 輸入 (原始碼)</label>
        <textarea
          id="markdownInput"
          v-model="markdownInput"
          rows="15"
          :placeholder="placeholderText"
          style="width: 100%; padding: 10px; box-sizing: border-box; font-family: Consolas, monospace; font-size: 14px; flex-grow: 1; min-height: 300px; border-radius: 5px; border: 1px solid #ccc"
          @input="handleInputChange"
          @paste="handleMarkdownPaste"
        />
      </div>

      <div style="flex: 1; position: relative; min-width: 0; display: flex; flex-direction: column">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
          <label style="font-weight: bold; margin: 0">HTML 預覽 (渲染結果)</label>
          <button
            @click="toggleFullscreen"
            class="tool-button"
            style="--tool-button-bg: #1976d2; padding: 4px 12px; font-size: 12px"
            title="全屏顯示"
          >
            ⛶
          </button>
        </div>
        <div
          style="border: 1px solid #ccc; padding: 15px; border-radius: 5px; flex-grow: 1; min-height: 300px; overflow-y: auto; line-height: 1.6; font-size: 1em"
          v-html="htmlOutput"
        />
      </div>
    </div>

    <!-- 全屏預覽模態框 -->
    <div
      v-if="isFullscreen"
      style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: white;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        padding: 20px;
        box-sizing: border-box;
      "
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px">
        <h3 style="margin: 0">HTML 預覽 - 全屏模式</h3>
        <button
          @click="toggleFullscreen"
          class="tool-button"
          style="--tool-button-bg: #d32f2f; padding: 8px 16px"
          title="關閉全屏"
        >
          ✕
        </button>
      </div>
      <div
        style="flex: 1; border: 1px solid #ccc; padding: 15px; border-radius: 5px; overflow-y: auto; line-height: 1.6; font-size: 1em; background-color: white"
        v-html="htmlOutput"
      />
    </div>
  </div>
</template>
