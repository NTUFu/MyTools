<script setup lang="ts">
import { computed, ref } from 'vue'

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
    id: 'json-schema-validator',
    name: 'JSON Schema Validator',
    path: '/tools/json-schema-validator',
    description: '驗證 JSON 是否符合 Schema 並列出錯誤路徑',
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
    id: 'hidden-characters',
    name: '隱藏字元檢視',
    path: '/tools/hidden-characters',
    description: '標示空白、換行、Tab 與 Unicode 零寬字元',
    category: '數據格式化',
  },
  {
    id: 'cron-helper',
    name: 'Cron Expression Helper',
    path: '/tools/cron-helper',
    description: '解析 Cron 表達式並計算下次執行時間',
    category: '專案管理',
  },
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    path: '/tools/sql-formatter',
    description: 'SQL 格式化、壓縮與關鍵字大小寫調整',
    category: '資料與 SQL',
  },
  {
    id: 'data-format-converter',
    name: 'JSON / YAML / TOML',
    path: '/tools/data-format-converter',
    description: 'JSON、YAML 與 TOML 格式互轉',
    category: '數據格式化',
  },
  {
    id: 'git-generators',
    name: 'Git Generators',
    path: '/tools/git-generators',
    description: '產生 .gitignore 與 Conventional Commit 訊息',
    category: '開發輔助',
  },
  {
    id: 'api-request-builder',
    name: 'API Request Builder',
    path: '/tools/api-request-builder',
    description: '建立 HTTP 請求並檢視回應',
    category: '開發輔助',
  },
  {
    id: 'workspace',
    name: '工作區',
    path: '/tools/workspace',
    description: '儲存文字片段並在工具間傳遞資料',
    category: '開發輔助',
  },
  {
    id: 'openapi-viewer',
    name: 'OpenAPI Viewer',
    path: '/tools/openapi-viewer',
    description: '解析 OpenAPI/Swagger 文件並產生 cURL',
    category: '開發輔助',
  },
  {
    id: 'timestamp-converter',
    name: 'Timestamp Converter',
    path: '/tools/timestamp-converter',
    description: 'Unix 秒/毫秒、ISO 與本地時間互轉',
    category: '編碼轉換',
  },
  {
    id: 'uuid-ulid-generator',
    name: 'UUID / ULID Generator',
    path: '/tools/uuid-ulid-generator',
    description: '批次產生 UUID v4 / v7 與 ULID',
    category: '編碼轉換',
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
    id: 'pdf-toolkit',
    name: 'PDF 工具箱',
    path: '/tools/pdf-toolkit',
    description: '本機瀏覽 PDF、合併檔案與擷取頁碼範圍',
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
  {
    id: 'pomodoro-timer',
    name: 'Pomodoro Timer',
    path: '/tools/pomodoro-timer',
    description: '可自訂參數的蕃茄鐘，支援專注與休息循環',
    category: '專案管理',
  },
]

const categories = ['編碼轉換', '數據格式化', '內容預覽', 'XML / XSLT', '資料與 SQL', '專案管理', '開發輔助']
const searchQuery = ref('')

const filteredToolCards = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) {
    return toolCards
  }

  return toolCards.filter((tool) =>
    [tool.name, tool.description, tool.category].some((value) =>
      value.toLocaleLowerCase().includes(query),
    ),
  )
})

const toolCardsByCategory = computed<Record<string, ToolCard[]>>(() => {
  const grouped: Record<string, ToolCard[]> = Object.fromEntries(categories.map((category) => [category, []]))

  for (const tool of filteredToolCards.value) {
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
      <label class="tool-search" for="tool-search-input">
        <span>搜尋工具</span>
        <input
          id="tool-search-input"
          v-model="searchQuery"
          type="search"
          placeholder="輸入工具名稱、描述或分類"
          autocomplete="off"
        />
      </label>
      <p v-if="searchQuery.trim() && filteredToolCards.length === 0" class="tool-search-empty">
        找不到符合的工具。
      </p>
      <div v-for="category in categories" :key="category" class="category-section">
        <h2 class="category-title">{{ category }}</h2>
        <div v-if="toolCardsByCategory[category].length > 0" class="tools-grid">
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
