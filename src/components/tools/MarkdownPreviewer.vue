<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { marked } from 'marked'
import { useHistoryStore } from '../../stores/history'

const historyStore = useHistoryStore()

const markdownInput = ref('')
const saveStatus = ref<'none' | 'saved'>('none')
const errorMessage = ref('')
const isFullscreen = ref(false)

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

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const placeholderText =
  '請輸入 Markdown 文本，例如：\n# 這是標題一\n\n這是一段 **粗體** 和 *斜體* 的文本。\n\n* 列表項目一\n* 列表項目二\n\n```javascript\n// 這是程式碼區塊\nconsole.log("Hello world");\n```\n\n[Google 連結](https://www.google.com)'

const htmlOutput = computed(() => {
  const parsed = marked(markdownInput.value)
  return typeof parsed === 'string' ? parsed : ''
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

onBeforeUnmount(() => {
  if (saveStatusTimer) {
    clearTimeout(saveStatusTimer)
    saveStatusTimer = null
  }
})
</script>

<template>
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; min-height: 80vh; font-family: Inter, sans-serif">
    <h1>Markdown 實時預覽器</h1>
    <p style="color: #666; margin-bottom: 15px">在左側輸入 Markdown 文本。</p>

    <p
      v-if="errorMessage"
      style="color: #d32f2f; border: 1px solid #d32f2f; padding: 8px; border-radius: 5px; margin: 0"
    >
      {{ errorMessage }}
    </p>

    <div style="display: flex; gap: 10px; align-items: center">
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
