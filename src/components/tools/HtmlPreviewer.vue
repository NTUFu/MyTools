<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { html as htmlBeautify } from 'js-beautify'
import { useHistoryStore } from '../../stores/history'
import { EditorView, basicSetup } from 'codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { EditorState } from '@codemirror/state'

const beautifyOptions = {
  indent_size: 2,
  space_in_empty_paren: true,
  preserve_newlines: true,
  max_preserve_newlines: 1,
  end_with_newline: true,
}

const historyStore = useHistoryStore()

const htmlInput = ref('<h1>Hello, MyTools!</h1>\n<p style="color: blue;">在這裡輸入你的 HTML 和 CSS 代碼。</p>')
const saveStatus = ref<'none' | 'saved'>('none')
const errorMessage = ref('')
const iframeRef = ref<HTMLIFrameElement | null>(null)
const fullscreenIframeRef = ref<HTMLIFrameElement | null>(null)
const editorContainer = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
let editorView: EditorView | null = null

// Flag to avoid recursive watch ↔ editor sync
let updatingFromOutside = false

const formatHtmlContent = (content: string): string => {
  if (content.trim() === '') return content
  return htmlBeautify(content, beautifyOptions)
}

const buildPreviewHtml = (content: string): string => `<!DOCTYPE html>
<html>
  <head>
    <title>HTML 預覽</title>
    <style>body { margin: 10px; font-family: sans-serif; }</style>
  </head>
  <body>
    ${content}
  </body>
</html>`

const writePreviewToIframe = (iframe: HTMLIFrameElement | null) => {
  if (!iframe) return
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) return
  iframeDoc.open()
  iframeDoc.write(buildPreviewHtml(htmlInput.value))
  iframeDoc.close()
}

const updatePreview = () => {
  writePreviewToIframe(iframeRef.value)
  writePreviewToIframe(fullscreenIframeRef.value)
}

const handleSaveCurrent = () => {
  errorMessage.value = ''
  if (htmlInput.value.trim() === '') {
    errorMessage.value = '尚無可儲存資料，請先輸入 HTML。'
    return
  }
  historyStore.saveHistoryItem({
    tool: 'html-previewer',
    action: 'preview',
    input: htmlInput.value,
    output: buildPreviewHtml(htmlInput.value),
  })
  saveStatus.value = 'saved'
  setTimeout(() => { saveStatus.value = 'none' }, 2000)
}

const handleFormat = () => {
  saveStatus.value = 'none'
  errorMessage.value = ''
  if (htmlInput.value.trim() === '') return
  try {
    htmlInput.value = formatHtmlContent(htmlInput.value)
  } catch {
    errorMessage.value = 'HTML 格式化失敗，請檢查代碼是否有嚴重錯誤。'
  }
}

const toggleFullscreen = async () => {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) {
    // Wait until fullscreen iframe is mounted before writing preview content
    await nextTick()
    writePreviewToIframe(fullscreenIframeRef.value)
  }
}

// When htmlInput is changed externally (e.g. format button), push to editor
watch(htmlInput, (newVal) => {
  errorMessage.value = ''
  saveStatus.value = 'none'
  updatePreview()
  if (editorView && !updatingFromOutside) {
    const current = editorView.state.doc.toString()
    if (current !== newVal) {
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: newVal },
      })
    }
  }
})

onMounted(() => {
  if (editorContainer.value) {
    editorView = new EditorView({
      state: EditorState.create({
        doc: htmlInput.value,
        extensions: [
          basicSetup,
          htmlLang(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updatingFromOutside = true
              htmlInput.value = update.state.doc.toString()
              updatingFromOutside = false
            }
          }),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { height: '100%', fontSize: '14px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, monospace' },
          }),
        ],
      }),
      parent: editorContainer.value,
    })
  }
  updatePreview()
})

onUnmounted(() => {
  editorView?.destroy()
})
</script>

<template>
  <div style="padding: 20px; width: 100%; box-sizing: border-box">
    <h2>HTML 預覽器</h2>
    <p style="margin-bottom: 15px">在左側輸入 HTML/CSS 代碼，右側即時查看渲染結果。</p>

    <p
      v-if="errorMessage"
      style="color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center">
      <button
        @click="handleSaveCurrent"
        class="tool-button"
        style="--tool-button-bg: #2e7d32"
      >
        儲存此次轉換
      </button>

      <button
        @click="handleFormat"
        class="tool-button"
        style="--tool-button-bg: #1565c0"
      >
        格式化 HTML
      </button>

      <span v-if="saveStatus === 'saved'" style="color: #2e7d32">✅ 已儲存</span>
    </div>

    <div style="display: flex; gap: 20px; height: 600px; width: 100%; min-width: 0; overflow: hidden">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">
        <label style="margin-bottom: 5px">HTML/CSS 代碼輸入區:</label>
        <div
          ref="editorContainer"
          style="flex: 1; min-width: 0; border: 1px solid #ccc; border-radius: 5px; overflow: hidden"
        />
      </div>

      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px">
          <label style="margin: 0">預覽結果:</label>
          <button
            @click="toggleFullscreen"
            class="tool-button"
            style="--tool-button-bg: #1976d2; padding: 4px 12px; font-size: 12px"
            title="全屏顯示"
          >
            ⛶
          </button>
        </div>
        <iframe
          ref="iframeRef"
          title="HTML Preview"
          style="flex: 1; width: 100%; border: 1px solid #ccc; background-color: white; box-sizing: border-box"
          sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
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
        background-color: #f5f5f5;
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
      <iframe
        ref="fullscreenIframeRef"
        title="HTML Fullscreen Preview"
        style="
          flex: 1;
          width: 100%;
          border: 1px solid #ccc;
          background-color: white;
          box-sizing: border-box;
          border-radius: 5px;
        "
        sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
      />
    </div>
  </div>
</template>
