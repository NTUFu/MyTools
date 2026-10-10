<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowUpIcon,
  ArrowUpTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  EyeIcon,
  MinusIcon,
  PlusIcon,
  ScissorsIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfMode = 'view' | 'merge' | 'split'

interface PdfFileEntry {
  id: number
  file: File
  pageCount: number
}

let pdfjsModule: typeof import('pdfjs-dist') | null = null
let nextFileId = 1
let renderRequestId = 0
let viewerDocument: import('pdfjs-dist').PDFDocumentProxy | null = null
let viewerFileId: number | null = null
let renderTask: import('pdfjs-dist').RenderTask | null = null

const fileInput = ref<HTMLInputElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const files = ref<PdfFileEntry[]>([])
const activeFileId = ref<number | null>(null)
const mode = ref<PdfMode>('view')
const pageNumber = ref(1)
const isViewerExpanded = ref(false)
const isFilePanelCollapsed = ref(false)
const zoom = ref(1)
const splitStart = ref(1)
const splitEnd = ref(1)
const isDragging = ref(false)
const isLoadingFiles = ref(false)
const isProcessing = ref(false)
const isRendering = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const activeFile = computed(() => files.value.find((entry) => entry.id === activeFileId.value) ?? null)
const pageInput = computed({
  get: () => pageNumber.value,
  set: (value: number) => {
    if (!activeFile.value || !Number.isFinite(value)) return
    pageNumber.value = Math.min(activeFile.value.pageCount, Math.max(1, Math.trunc(value)))
  },
})
const canSplit = computed(() => {
  const entry = activeFile.value
  return Boolean(
    entry &&
      Number.isInteger(splitStart.value) &&
      Number.isInteger(splitEnd.value) &&
      splitStart.value >= 1 &&
      splitEnd.value >= splitStart.value &&
      splitEnd.value <= entry.pageCount,
  )
})

const loadPdfJs = async () => {
  if (!pdfjsModule) {
    pdfjsModule = await import('pdfjs-dist')
    pdfjsModule.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }

  return pdfjsModule
}

const describePdfError = (error: unknown) => {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (/password|encrypted/i.test(message)) {
    return '此工具只支援未加密 PDF，請選擇未加密的檔案。'
  }

  return 'PDF 無法讀取，請確認檔案完整且格式有效。'
}

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const clearMessages = () => {
  errorMessage.value = ''
  successMessage.value = ''
}

const releaseViewerDocument = async () => {
  renderTask?.cancel()
  renderTask = null
  const document = viewerDocument
  viewerDocument = null
  viewerFileId = null
  if (document) {
    await document.destroy()
  }
}

const loadPageCount = async (file: File) => {
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageCount = document.numPages
  await document.destroy()
  return pageCount
}

const addFiles = async (incomingFiles: File[]) => {
  clearMessages()
  const pdfFiles = incomingFiles.filter((file) => file.name.toLowerCase().endsWith('.pdf'))

  if (pdfFiles.length !== incomingFiles.length) {
    errorMessage.value = '只接受 .pdf 檔案。'
  }
  if (pdfFiles.length === 0) {
    return
  }

  isLoadingFiles.value = true
  let firstAddedId: number | null = null
  const rejectedFiles: { name: string; error: unknown }[] = []

  try {
    for (const file of pdfFiles) {
      try {
        const pageCount = await loadPageCount(file)
        const entry = { id: nextFileId++, file, pageCount }
        files.value.push(entry)
        firstAddedId ??= entry.id
      } catch (error) {
        rejectedFiles.push({ name: file.name, error })
      }
    }

    if (firstAddedId !== null) {
      activeFileId.value = firstAddedId
      pageNumber.value = 1
      splitStart.value = 1
      splitEnd.value = files.value.find((entry) => entry.id === firstAddedId)?.pageCount ?? 1
    }

    if (rejectedFiles.length > 0) {
      const hasEncryptedFile = rejectedFiles.some(({ error }) => {
        const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
        return /password|encrypted/i.test(message)
      })
      const rejectedNames = rejectedFiles.map(({ name }) => name).join('、')
      errorMessage.value = hasEncryptedFile
        ? `${rejectedNames} 無法讀取。此工具只支援未加密 PDF。`
        : `${rejectedNames} 無法讀取。請確認檔案完整且格式有效。`
    }
  } finally {
    isLoadingFiles.value = false
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

const handleFileSelection = (event: Event) => {
  const input = event.target as HTMLInputElement
  void addFiles(Array.from(input.files ?? []))
}

const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  void addFiles(Array.from(event.dataTransfer?.files ?? []))
}

const selectFile = (entry: PdfFileEntry) => {
  activeFileId.value = entry.id
  pageNumber.value = 1
  splitStart.value = 1
  splitEnd.value = entry.pageCount
  clearMessages()
}

const removeFile = async (id: number) => {
  const index = files.value.findIndex((entry) => entry.id === id)
  if (index < 0) return

  files.value.splice(index, 1)
  if (viewerFileId === id) {
    renderRequestId += 1
    await releaseViewerDocument()
  }

  if (activeFileId.value === id) {
    const nextEntry = files.value[Math.min(index, files.value.length - 1)] ?? null
    activeFileId.value = nextEntry?.id ?? null
    pageNumber.value = 1
    splitStart.value = 1
    splitEnd.value = nextEntry?.pageCount ?? 1
  }
  clearMessages()
}

const moveFile = (index: number, offset: -1 | 1) => {
  const destination = index + offset
  if (destination < 0 || destination >= files.value.length) return
  const [entry] = files.value.splice(index, 1)
  files.value.splice(destination, 0, entry)
}

const clearFiles = async () => {
  renderRequestId += 1
  await releaseViewerDocument()
  files.value = []
  activeFileId.value = null
  pageNumber.value = 1
  splitStart.value = 1
  splitEnd.value = 1
  clearMessages()
}

const ensureViewerDocument = async (entry: PdfFileEntry, requestId: number) => {
  if (viewerDocument && viewerFileId === entry.id) {
    return viewerDocument
  }

  await releaseViewerDocument()
  const pdfjs = await loadPdfJs()
  const document = await pdfjs.getDocument({ data: await entry.file.arrayBuffer() }).promise
  if (requestId !== renderRequestId) {
    await document.destroy()
    return null
  }

  viewerDocument = document
  viewerFileId = entry.id
  return document
}

const renderCurrentPage = async () => {
  const requestId = ++renderRequestId
  renderTask?.cancel()
  const entry = activeFile.value
  if (!entry || mode.value !== 'view') {
    isRendering.value = false
    return
  }

  isRendering.value = true
  try {
    const document = await ensureViewerDocument(entry, requestId)
    if (!document || requestId !== renderRequestId) return

    const page = await document.getPage(pageNumber.value)
    if (requestId !== renderRequestId || !canvas.value) return

    const viewport = page.getViewport({ scale: zoom.value })
    const context = canvas.value.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')

    canvas.value.width = Math.ceil(viewport.width)
    canvas.value.height = Math.ceil(viewport.height)
    const task = page.render({ canvasContext: context, viewport })
    renderTask = task
    await task.promise
  } catch (error) {
    if (error instanceof Error && error.name === 'RenderingCancelledException') return
    if (requestId === renderRequestId) {
      errorMessage.value = describePdfError(error)
    }
  } finally {
    if (requestId === renderRequestId) {
      isRendering.value = false
    }
  }
}

watch(() => [activeFileId.value, pageNumber.value, mode.value, zoom.value] as const, () => {
  void renderCurrentPage()
})

const setMode = (nextMode: PdfMode) => {
  mode.value = nextMode
  clearMessages()
}

const downloadPdf = (bytes: Uint8Array, filename: string) => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const handleMerge = async () => {
  if (files.value.length < 2 || isProcessing.value) return
  clearMessages()
  isProcessing.value = true

  try {
    const { PDFDocument } = await import('pdf-lib')
    const mergedPdf = await PDFDocument.create()

    for (const entry of files.value) {
      const sourcePdf = await PDFDocument.load(await entry.file.arrayBuffer())
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
      pages.forEach((page) => mergedPdf.addPage(page))
    }

    downloadPdf(await mergedPdf.save(), '合併結果.pdf')
    successMessage.value = `已合併 ${files.value.length} 份 PDF。`
  } catch (error) {
    errorMessage.value = describePdfError(error)
  } finally {
    isProcessing.value = false
  }
}

const handleSplit = async () => {
  const entry = activeFile.value
  if (!entry || !canSplit.value || isProcessing.value) return
  clearMessages()
  isProcessing.value = true

  try {
    const { PDFDocument } = await import('pdf-lib')
    const sourcePdf = await PDFDocument.load(await entry.file.arrayBuffer())
    const outputPdf = await PDFDocument.create()
    const pageIndices = Array.from(
      { length: splitEnd.value - splitStart.value + 1 },
      (_, index) => splitStart.value - 1 + index,
    )
    const pages = await outputPdf.copyPages(sourcePdf, pageIndices)
    pages.forEach((page) => outputPdf.addPage(page))

    const filename = `${entry.file.name.replace(/\.pdf$/i, '')}_第${splitStart.value}-${splitEnd.value}頁.pdf`
    downloadPdf(await outputPdf.save(), filename)
    successMessage.value = `已匯出第 ${splitStart.value} 至 ${splitEnd.value} 頁。`
  } catch (error) {
    errorMessage.value = describePdfError(error)
  } finally {
    isProcessing.value = false
  }
}

const changeZoom = (amount: number) => {
  zoom.value = Math.min(2, Math.max(0.5, Math.round((zoom.value + amount) * 100) / 100))
}

onUnmounted(() => {
  renderRequestId += 1
  renderTask?.cancel()
  void viewerDocument?.destroy()
  viewerDocument = null
  viewerFileId = null
})
</script>

<template>
  <div
    class="pdf-tool"
    :class="{ 'is-dragging': isDragging, 'viewer-expanded': isViewerExpanded }"
    @keydown.esc="isViewerExpanded = false"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <header class="pdf-heading">
      <div>
        <h2>PDF 工具箱</h2>
        <p class="pdf-subtitle">瀏覽、合併與擷取頁面，檔案只在此瀏覽器中處理。</p>
      </div>
    </header>

    <div class="pdf-layout" :class="{ 'files-collapsed': isFilePanelCollapsed }">
      <aside class="pdf-files-panel" aria-label="PDF 檔案清單">
        <div class="panel-heading">
          <div>
            <h2>檔案</h2>
            <span>{{ files.length }} 份 PDF</span>
          </div>
          <button
            v-if="files.length"
            class="icon-button subtle"
            type="button"
            title="清除全部檔案"
            aria-label="清除全部檔案"
            @click="clearFiles"
          >
            <TrashIcon />
          </button>
        </div>

        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          @change="handleFileSelection"
        />
        <button class="tool-button add-files-button" style="--tool-button-bg: #1a73e8" type="button" :disabled="isLoadingFiles" @click="fileInput?.click()">
          <ArrowUpTrayIcon />
          {{ isLoadingFiles ? '正在讀取…' : '加入 PDF' }}
        </button>

        <div v-if="files.length === 0" class="drop-prompt">
          <DocumentTextIcon />
          <strong>將 PDF 拖放到此處</strong>
          <span>或使用上方按鈕選取檔案</span>
        </div>

        <ol v-else class="pdf-file-list">
          <li
            v-for="(entry, index) in files"
            :key="entry.id"
            class="pdf-file-item"
            :class="{ selected: activeFileId === entry.id }"
          >
            <button class="file-main" type="button" @click="selectFile(entry)">
              <span class="file-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="file-copy">
                <strong :title="entry.file.name">{{ entry.file.name }}</strong>
                <span>{{ entry.pageCount }} 頁 · {{ formatFileSize(entry.file.size) }}</span>
              </span>
            </button>
            <div class="file-actions">
              <button
                class="icon-button"
                type="button"
                title="上移"
                :aria-label="`將 ${entry.file.name} 上移`"
                :disabled="index === 0"
                @click="moveFile(index, -1)"
              >
                <ArrowUpIcon />
              </button>
              <button
                class="icon-button"
                type="button"
                title="下移"
                :aria-label="`將 ${entry.file.name} 下移`"
                :disabled="index === files.length - 1"
                @click="moveFile(index, 1)"
              >
                <ArrowDownIcon />
              </button>
              <button
                class="icon-button remove-file"
                type="button"
                title="移除"
                :aria-label="`移除 ${entry.file.name}`"
                @click="removeFile(entry.id)"
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        </ol>

        <p class="privacy-note">檔案不會上傳，也不會儲存至轉換紀錄。</p>
      </aside>

      <main class="pdf-workspace">
        <div class="workspace-toolbar">
          <nav class="mode-tabs" aria-label="PDF 操作模式" role="tablist">
            <button :class="{ active: mode === 'view' }" role="tab" :aria-selected="mode === 'view'" @click="setMode('view')">
              <EyeIcon />瀏覽
            </button>
            <button :class="{ active: mode === 'merge' }" role="tab" :aria-selected="mode === 'merge'" @click="setMode('merge')">
              <DocumentDuplicateIcon />合併
            </button>
            <button :class="{ active: mode === 'split' }" role="tab" :aria-selected="mode === 'split'" @click="setMode('split')">
              <ScissorsIcon />分割
            </button>
          </nav>
          <button
            class="icon-button file-panel-toggle"
            type="button"
            :title="isFilePanelCollapsed ? '顯示 PDF 檔案欄' : '收合 PDF 檔案欄'"
            :aria-label="isFilePanelCollapsed ? '顯示 PDF 檔案欄' : '收合 PDF 檔案欄'"
            :aria-expanded="!isFilePanelCollapsed"
            @click="isFilePanelCollapsed = !isFilePanelCollapsed"
          >
            <ChevronRightIcon v-if="isFilePanelCollapsed" />
            <ChevronLeftIcon v-else />
          </button>
        </div>

        <p v-if="errorMessage" class="notice error-notice" role="alert">{{ errorMessage }}</p>
        <p v-if="successMessage" class="notice success-notice" role="status">{{ successMessage }}</p>

        <section v-if="mode === 'view'" class="viewer-panel" aria-label="PDF 預覽">
          <template v-if="activeFile">
            <div class="viewer-toolbar">
              <div class="viewer-file-name" :title="activeFile.file.name">{{ activeFile.file.name }}</div>
              <div class="viewer-controls">
                <button class="icon-button" type="button" title="縮小" aria-label="縮小" :disabled="zoom <= 0.5" @click="changeZoom(-0.1)">
                  <MinusIcon />
                </button>
                <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
                <button class="icon-button" type="button" title="放大" aria-label="放大" :disabled="zoom >= 2" @click="changeZoom(0.1)">
                  <PlusIcon />
                </button>
                <span class="toolbar-divider" />
                <button class="icon-button" type="button" title="上一頁" aria-label="上一頁" :disabled="pageNumber <= 1" @click="pageNumber -= 1">
                  <ChevronLeftIcon />
                </button>
                <label class="page-input-label">
                  <input v-model.number="pageInput" type="number" min="1" :max="activeFile.pageCount" aria-label="頁碼" />
                  <span>/ {{ activeFile.pageCount }}</span>
                </label>
                <button class="icon-button" type="button" title="下一頁" aria-label="下一頁" :disabled="pageNumber >= activeFile.pageCount" @click="pageNumber += 1">
                  <ChevronRightIcon />
                </button>
                <span class="toolbar-divider" />
                <button
                  class="icon-button expand-view-button"
                  type="button"
                  :title="isViewerExpanded ? '還原閱讀視窗' : '展開閱讀視窗'"
                  :aria-label="isViewerExpanded ? '還原閱讀視窗' : '展開閱讀視窗'"
                  @click="isViewerExpanded = !isViewerExpanded"
                >
                  <ArrowsPointingInIcon v-if="isViewerExpanded" />
                  <ArrowsPointingOutIcon v-else />
                </button>
              </div>
            </div>
            <div class="page-stage">
              <div v-if="isRendering" class="render-status">正在繪製頁面…</div>
              <canvas ref="canvas" :aria-label="`第 ${pageNumber} 頁`" />
            </div>
          </template>
          <div v-else class="empty-workspace">
            <DocumentTextIcon />
            <strong>選取 PDF 開始瀏覽</strong>
            <span>支援未加密的 PDF 檔案</span>
          </div>
        </section>

        <section v-else-if="mode === 'merge'" class="operation-panel">
          <div class="operation-icon merge-icon"><DocumentDuplicateIcon /></div>
          <h2>合併 PDF</h2>
          <p class="operation-description">依左側清單順序合併所有檔案；使用上移、下移調整頁面順序。</p>
          <div class="operation-summary">
            <span>待合併檔案</span>
            <strong>{{ files.length }} 份</strong>
            <span>總頁數</span>
            <strong>{{ files.reduce((total, entry) => total + entry.pageCount, 0) }} 頁</strong>
          </div>
          <button class="tool-button primary-action" style="--tool-button-bg: #1a73e8" type="button" :disabled="files.length < 2 || isProcessing" @click="handleMerge">
            <ArrowDownTrayIcon />{{ isProcessing ? '正在合併…' : '合併並下載' }}
          </button>
          <span v-if="files.length < 2" class="action-hint">至少加入兩份 PDF 才能合併</span>
        </section>

        <section v-else class="operation-panel split-panel">
          <div class="operation-icon split-icon"><ScissorsIcon /></div>
          <h2>擷取頁面</h2>
          <p class="operation-description">從左側選取來源 PDF，指定頁碼範圍並匯出成一份新檔案。</p>
          <template v-if="activeFile">
            <div class="selected-document">
              <DocumentTextIcon />
              <span :title="activeFile.file.name">{{ activeFile.file.name }}</span>
              <small>{{ activeFile.pageCount }} 頁</small>
            </div>
            <div class="range-controls">
              <label>
                <span>起始頁</span>
                <input v-model.number="splitStart" type="number" min="1" :max="activeFile.pageCount" />
              </label>
              <span class="range-separator">至</span>
              <label>
                <span>結束頁</span>
                <input v-model.number="splitEnd" type="number" min="1" :max="activeFile.pageCount" />
              </label>
              <span class="range-total">/ {{ activeFile.pageCount }} 頁</span>
            </div>
            <p v-if="!canSplit" class="range-error">請輸入 1 至 {{ activeFile.pageCount }} 之間的有效頁碼範圍。</p>
            <button class="tool-button primary-action" style="--tool-button-bg: #1a73e8" type="button" :disabled="!canSplit || isProcessing" @click="handleSplit">
              <ArrowDownTrayIcon />{{ isProcessing ? '正在擷取…' : '擷取並下載 PDF' }}
            </button>
          </template>
          <span v-else class="action-hint">先加入並選取一份 PDF</span>
        </section>

        <footer class="workspace-footer">
          <span>PDF.js · pdf-lib</span>
          <span>僅支援未加密 PDF</span>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.pdf-tool {
  --ink: #3c4043;
  --muted: #666;
  --line: #d6d9de;
  --paper: #fff;
  --accent: #1a73e8;
  --accent-dark: #1558b0;
  --teal: #546e7a;
  box-sizing: border-box;
  min-height: 100vh;
  padding: 20px;
  color: var(--ink);
  background: #fff;
  font-family: inherit;
}

.pdf-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  max-width: 1480px;
  margin: 0 auto 12px;
}

.pdf-heading h2 {
  margin: 0;
  font-size: 1.5em;
  font-weight: 600;
}

.pdf-subtitle {
  margin: 6px 0 0;
  color: #666;
}

.pdf-layout {
  display: grid;
  grid-template-columns: minmax(240px, 310px) minmax(0, 1fr);
  max-width: 1480px;
  min-height: min(700px, calc(100vh - 150px));
  gap: 12px;
  margin: 0 auto;
  background: transparent;
}

.pdf-layout.files-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.files-collapsed .pdf-files-panel {
  display: none;
}

.pdf-files-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 18px 14px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fafafa;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 2px 14px;
}

.panel-heading h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
}

.panel-heading span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

.add-files-button svg,
.primary-action svg {
  width: 17px;
  height: 17px;
}

.add-files-button {
  width: 100%;
  margin-bottom: 0;
}

.primary-action {
  min-width: 180px;
}

.drop-prompt {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 12px;
  border: 1px dashed #c9d2d4;
  color: var(--muted);
  text-align: center;
}

.drop-prompt svg {
  width: 28px;
  height: 28px;
  margin-bottom: 4px;
  color: var(--teal);
}

.drop-prompt strong {
  color: var(--ink);
  font-size: 12px;
}

.drop-prompt span {
  font-size: 11px;
}

.pdf-file-list {
  display: grid;
  gap: 6px;
  max-height: 480px;
  overflow-y: auto;
  margin: 12px -4px 0;
  padding: 0 4px;
  list-style: none;
}

.pdf-file-item {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: #f5f5f5;
}

.pdf-file-item.selected {
  border-color: #d9a093;
  background: #fff7f4;
}

.file-main {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 10px 9px 5px;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.file-index {
  display: grid;
  width: 28px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #d6ddda;
  color: var(--accent);
  background: #fff;
  font-size: 10px;
  font-weight: 750;
}

.file-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.file-copy strong,
.selected-document span {
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-copy > span {
  color: var(--muted);
  font-size: 10px;
}

.file-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  padding: 0 5px 5px;
}

.icon-button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #53616c;
  background: transparent;
  cursor: pointer;
}

.icon-button:hover:not(:disabled) {
  border-color: #d7dfdb;
  background: #fff;
}

.icon-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-button svg {
  width: 16px;
  height: 16px;
}

.icon-button.subtle {
  color: var(--muted);
}

.remove-file:hover:not(:disabled) {
  color: #c62828;
}

.privacy-note {
  margin: auto 2px 0;
  padding-top: 18px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.pdf-workspace {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 0 20px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
}

.workspace-toolbar {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
}

.mode-tabs {
  display: flex;
  min-height: 54px;
  flex: 1;
  gap: 22px;
}

.mode-tabs button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 4px;
  border: 0;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.mode-tabs button::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: transparent;
  content: '';
}

.mode-tabs button.active {
  color: var(--accent);
}

.mode-tabs button.active::after {
  background: var(--accent);
}

.mode-tabs svg {
  width: 16px;
  height: 16px;
}

.file-panel-toggle {
  margin-left: 12px;
}

.notice {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-left: 3px solid;
  font-size: 12px;
}

.error-notice {
  border-color: #bd4b39;
  color: #8c3328;
  background: #fff3f0;
}

.success-notice {
  border-color: #3f8563;
  color: #2e654b;
  background: #eff7f1;
}

.viewer-panel {
  display: flex;
  min-height: 420px;
  flex: 1;
  flex-direction: column;
}

.viewer-toolbar {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #edf0ee;
}

.viewer-file-name {
  overflow: hidden;
  color: #44515c;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
}

.zoom-value {
  min-width: 39px;
  color: #56636d;
  font-size: 10px;
  text-align: center;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  margin: 0 5px;
  background: var(--line);
}

.page-input-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
}

.page-input-label input,
.range-controls input {
  box-sizing: border-box;
  height: 32px;
  border: 1px solid #cbd3d4;
  border-radius: 2px;
  color: var(--ink);
  background: #fff;
  font: inherit;
}

.page-input-label input {
  width: 48px;
  padding: 0 5px;
  text-align: center;
}

.page-stage {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: auto;
  padding: 22px;
  background-color: #f1f3f4;
}

.page-stage canvas {
  display: block;
  height: auto;
  margin-inline: auto;
  background: #fff;
  box-shadow: 0 3px 14px rgba(25, 39, 42, 0.18);
}

.pdf-tool.viewer-expanded {
  position: fixed;
  z-index: 10000;
  inset: 0;
  overflow: hidden;
  padding: 0;
}

.viewer-expanded .pdf-heading,
.viewer-expanded .pdf-files-panel,
.viewer-expanded .workspace-toolbar,
.viewer-expanded .workspace-footer {
  display: none;
}

.viewer-expanded .pdf-layout {
  display: block;
  width: 100%;
  max-width: none;
  height: 100dvh;
  min-height: 0;
  margin: 0;
  border: 0;
}

.viewer-expanded .pdf-workspace {
  height: 100%;
  padding: 0 20px 12px;
}

.viewer-expanded .viewer-panel {
  min-height: 0;
}

.render-status {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 1;
  padding: 4px 8px;
  color: #fff;
  background: rgba(32, 42, 53, 0.78);
  font-size: 10px;
  transform: translateX(-50%);
}

.empty-workspace {
  display: flex;
  min-height: 420px;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--muted);
}

.empty-workspace svg {
  width: 38px;
  height: 38px;
  margin-bottom: 5px;
  color: var(--teal);
}

.empty-workspace strong {
  color: var(--ink);
  font-size: 14px;
}

.empty-workspace span {
  font-size: 12px;
}

.operation-panel {
  display: flex;
  width: min(100%, 520px);
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  align-self: center;
  padding: 36px 20px;
}

.operation-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  margin-bottom: 22px;
  border: 1px solid #ead1ca;
  color: var(--accent);
  background: #eef4fc;
}

.operation-icon svg {
  width: 23px;
  height: 23px;
}

.split-icon {
  border-color: #d6d9de;
  color: #546e7a;
  background: #f5f5f5;
}

.operation-panel h2 {
  margin: 0;
  font-size: 22px;
}

.operation-description {
  max-width: 460px;
  margin: 10px 0 22px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.operation-summary {
  display: grid;
  width: min(100%, 360px);
  grid-template-columns: 1fr auto;
  gap: 10px 18px;
  margin-bottom: 22px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}

.operation-summary strong {
  color: var(--ink);
  text-align: right;
}

.primary-action {
  padding: 0 16px;
}

.action-hint {
  margin-top: 9px;
  color: var(--muted);
  font-size: 11px;
}

.selected-document {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 11px 0;
  border-top: 1px solid var(--line);
}

.selected-document svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--teal);
}

.selected-document span {
  flex: 1;
}

.selected-document small {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 10px;
}

.range-controls {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin: 12px 0 8px;
}

.range-controls label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 10px;
}

.range-controls input {
  width: 92px;
  height: 38px;
  padding: 0 9px;
  font-size: 14px;
}

.range-separator,
.range-total {
  padding-bottom: 10px;
  color: var(--muted);
  font-size: 11px;
}

.range-error {
  margin: 3px 0 12px;
  color: #d32f2f;
  font-size: 11px;
}

.split-panel .primary-action {
  margin-top: 14px;
}

.workspace-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #edf0ee;
  color: #7d888e;
  font-size: 10px;
}

.pdf-tool.is-dragging::after {
  position: fixed;
  z-index: 20;
  border: 3px dashed var(--accent);
  background: rgba(255, 250, 247, 0.76);
  content: '';
  inset: 8px;
  pointer-events: none;
}

@media (max-width: 760px) {
  .pdf-tool {
    padding: 20px 12px;
  }

  .viewer-expanded.pdf-tool {
    padding: 0;
  }

  .pdf-heading {
    align-items: flex-start;
  }

  .pdf-subtitle {
    line-height: 1.5;
  }

  .pdf-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .pdf-files-panel {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .pdf-file-list {
    max-height: 220px;
  }

  .privacy-note {
    margin-top: 12px;
  }

  .pdf-workspace {
    min-height: 480px;
    padding: 0 12px 12px;
  }

  .viewer-expanded .pdf-workspace {
    min-height: 0;
    padding: 0 8px 8px;
  }

  .workspace-toolbar {
    gap: 4px;
  }

  .mode-tabs {
    justify-content: space-around;
    gap: 10px;
  }

  .file-panel-toggle {
    margin-left: 0;
  }

  .viewer-toolbar {
    align-items: flex-start;
    flex-direction: column;
    padding: 9px 0;
  }

  .viewer-file-name {
    max-width: 100%;
  }

  .viewer-controls {
    width: 100%;
    justify-content: center;
  }

  .page-stage {
    min-height: 360px;
    padding: 12px 6px;
  }

  .operation-panel {
    padding: 30px 6px;
  }
}

@media (max-width: 390px) {
  .range-controls {
    gap: 6px;
  }

  .range-controls input {
    width: 72px;
  }

  .range-total {
    font-size: 10px;
  }
}
</style>