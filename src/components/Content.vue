<script setup lang="ts">
import { computed } from 'vue'

interface ToolCard {
  id: string
  name: string
  path: string
  description: string
  category: string
}

const toolCards: ToolCard[] = [
  {
    id: 'base64',
    name: 'Base64',
    path: '/tools/base64',
    description: '文本與 Base64 互相轉換',
    category: '編碼轉換',
  },
  {
    id: 'qrcode',
    name: 'QRCode',
    path: '/tools/qrious',
    description: '生成與解析二維碼',
    category: '編碼轉換',
  },
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder',
    path: '/tools/jwt-decoder',
    description: '解析 JWT Header/Payload 與時間欄位',
    category: '編碼轉換',
  },
  {
    id: 'hash-generator',
    name: 'Hash Generator',
    path: '/tools/hash-generator',
    description: '產生 MD5/SHA-1/SHA-256/SHA-512 雜湊值',
    category: '編碼轉換',
  },
  {
    id: 'url-toolkit',
    name: 'URL Toolkit',
    path: '/tools/url-toolkit',
    description: '解析網址、編輯 Query 參數與 URL 編解碼',
    category: '編碼轉換',
  },
  {
    id: 'json',
    name: 'JSON Formatter',
    path: '/tools/json-formatter',
    description: 'JSON 格式化與壓縮',
    category: '數據格式化',
  },
  {
    id: 'csv-xlsx-json',
    name: 'CSV/XLSX Parser',
    path: '/tools/csv-xlsx-to-json',
    description: '上傳 CSV 或 XLSX，瀏覽表格並匯出 JSON/CSV/TXT',
    category: '數據格式化',
  },
  {
    id: 'text-diff',
    name: 'Text Diff',
    path: '/tools/text-diff',
    description: '比較兩段文字差異，支援忽略空白與大小寫',
    category: '數據格式化',
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    path: '/tools/regex-tester',
    description: '測試正則表達式、檢視群組與替換預覽',
    category: '數據格式化',
  },
  {
    id: 'html',
    name: 'HTML Previewer',
    path: '/tools/html-previewer',
    description: '即時預覽 HTML 代碼',
    category: '內容預覽',
  },
  {
    id: 'markdown',
    name: 'Markdown Previewer',
    path: '/tools/markdown-previewer',
    description: 'Markdown 即時預覽',
    category: '內容預覽',
  },
  {
    id: 'xslt-diff',
    name: 'XSLT 比較器',
    path: '/tools/xslt-diff',
    description: '上傳或貼上兩份 XSLT，逐行比較差異',
    category: 'XML / XSLT',
  },
  {
    id: 'sql-compare',
    name: 'SQL 比較器',
    path: '/tools/sql-compare',
    description: '自訂條件擷取關鍵值並列出左右缺少清單',
    category: '資料與 SQL',
  },
  {
    id: 'sql-practice',
    name: 'SQL Practice',
    path: '/tools/sql-practice',
    description: '預設家具訂單資料、Schema 設定、JSON 匯入與 SQL 練習',
    category: '資料與 SQL',
  },
  {
    id: 'planner-gantt',
    name: 'Planner Gantt',
    path: '/tools/planner-gantt',
    description: '匯入 Microsoft Planner XLSX 並生成可互動甘特圖',
    category: '專案管理',
  },
]

const categories = ['編碼轉換', '數據格式化', '內容預覽', 'XML / XSLT', '資料與 SQL', '專案管理']

const toolCardsByCategory = computed<Record<string, ToolCard[]>>(() => {
  const grouped: Record<string, ToolCard[]> = Object.fromEntries(categories.map((category) => [category, []]))

  for (const tool of toolCards) {
    if (!grouped[tool.category]) {
      grouped[tool.category] = []
    }

    grouped[tool.category].push(tool)
  }

  return grouped
})
</script>

<template>
  <div class="content-inner">
    <div class="tools-container">
      <div v-for="category in categories" :key="category" class="category-section">
        <h2 class="category-title">{{ category }}</h2>
        <div class="tools-grid">
          <RouterLink
            v-for="tool in toolCardsByCategory[category]"
            :key="tool.id"
            :to="tool.path"
            class="tool-card"
            :data-testid="`tool-card-${tool.id}`"
          >
            <div class="tool-name">{{ tool.name }}</div>
            <div class="tool-description">{{ tool.description }}</div>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
