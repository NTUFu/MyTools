# MyTools - 開發者實用工具箱

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vue](https://img.shields.io/badge/Vue-42B883?style=for-the-badge&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

這是一個以 Vue 3 + TypeScript + Vite 建置的工具型 SPA，整合常用的開發與資料處理小工具。

目前版本：`7.2.0`（以 [package.json](./package.json) 為準）

## 🆕 目前版本重點（7.2.0）

- 共 28 個工具頁，使用路由獨立載入，支援直接開啟工具 URL。
- 首頁提供工具名稱、描述與分類搜尋。
- 支援 Git 產生器、API Request Builder、工作區、OpenAPI Viewer 與 PWA 離線快取。
- API Request Builder 內建可收闔的常用 Headers 範本，並支援複製 cURL、回應 Headers、Body 與完整回應。
- 重型套件採按需載入，包含 PDF、XLSX、Markdown、CodeMirror、QR Code 與 SQL.js。
- 提供瀏覽器本機處理的編碼、格式化、比較、預覽、資料處理與專案管理工具。
- 可選擇啟用僅限本機的 Python MarkItDown API 與 AI 輔助功能。

---

## ✨ 專案特色

- 類似 Gemini 的簡潔介面與可收合側邊欄。
- `vue-router` 路由切換，工具頁面可獨立存取。
- `Pinia` 管理 UI 狀態與轉換歷史，資料持久化於 `localStorage`。
- 模組化元件設計，方便持續新增工具。
- 支援本地開發、正式打包與靜態站預覽。
- HTML 預覽器內建 CodeMirror 編輯器，提供行號與 HTML syntax highlighting，支援全屏預覽。
- Markdown 預覽器支援檔案上傳解析（含 HTML 自動轉 Markdown）、即時渲染與全屏預覽。
- PDF 工具箱支援本機瀏覽未加密 PDF、多檔合併與指定頁碼範圍擷取，不會上傳檔案。
- CSV/XLSX Parser 支援自訂表頭列、關鍵字篩選、單筆編輯刪除，並可做主表/明細分組 JSON 匯出。
- Planner Gantt 支援匯入 Microsoft Planner XLSX，產生可互動甘特圖與統計摘要。
- Pomodoro Timer 支援自訂專注/休息參數、循環規則與無印良品風格專注計時介面。
- API Request Builder 支援 GET/POST/PUT/PATCH/DELETE、JSON Body、可收闔常用 Headers、cURL 匯出，以及 Response Status/Headers/Body 檢視與複製。
- 工作區可將文字片段儲存於瀏覽器 `localStorage`，並傳遞至 JSON Formatter；不會自動上傳內容。
- OpenAPI Viewer 支援貼上 YAML 文件、瀏覽 API paths 與產生基本 cURL 指令。
- PWA 支援在正式環境安裝至桌面，並快取已載入的靜態資源以利離線開啟。
- 各工具可手動儲存「此次轉換 raw data」，並集中在存檔歷史檢視與刪除。

---

## 🗺️ 未來規劃 (Roadmap)

目前已完成第一、二階段的工具擴充。後續可再補充更完整的 API schema 產生、跨裝置同步與進階離線更新策略。

`todo.md` 中原先列出的 URL、Timestamp、UUID/ULID、Hash、Regex、Diff 與 JSON Schema 工具均已完成，請以本 README 的「已實作工具」為準。

---

## � 目錄結構（重要）

本倉庫為單層前端專案，以下為精簡後的重要結構：

```text
MyTools/
├─ .github/workflows/
├─ .husky/
├─ README.md
├─ package.json
├─ src/
├─ public/
├─ localfile/
├─ material/
└─ start_server.bat
```

---

## 🚀 快速啟動

### 前置條件

- Node.js 18+
- npm 9+

### 在專案根目錄執行

```bash
npm install
npm run dev
```

開發站預設啟動於 <http://localhost:5173/>。

若要一鍵同時啟動前端與本地 Python API（會自動檢查/建立 `python_api/.venv`）：

```bash
npm run dev:local
```

注意：`dev:local` 需要 Python 3.10+（MarkItDown 要求）。
若目前版本過舊，`dev:local` 會先詢問是否自動安裝（macOS + Homebrew 環境）。

### （可選）啟動本地 Python 轉換 API（MarkItDown）

若要讓 Markdown Previewer 使用完整 MarkItDown 轉換能力（例如 PDF / PPTX / ZIP 等），可在本機啟動 Python API：

```bash
cd python_api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

前端開發環境已透過 Vite Proxy 對接 `/api/*` 到 `http://127.0.0.1:8000`。

API 端點：

- `GET /api/health`：確認 API 是否運作。
- `GET /api/supported-types`：列出 MarkItDown 可處理的副檔名。
- `POST /api/convert`：以 multipart 欄位 `file` 上傳檔案並取得 Markdown。
- `POST /api/ai/test`：測試 AI Provider 連線（僅 loopback）。
- `GET /api/ai/status`：取得本機 AI 功能狀態（僅 loopback）。
- `POST /api/ai/generate`：執行 AI 輔助產生文字（僅 loopback）。
- `GET /api/ai/usage`：查看本機 AI 用量摘要（僅 loopback）。
- `DELETE /api/ai/usage`：清除本機 AI 用量（僅 loopback）。

AI 端點要求請求 Host、Client 與 Origin 均為 loopback；非本機 HTTP Endpoint 也必須使用 HTTPS。

---

## 🤖 本機 AI 功能

AI 功能是可選的本機擴充，不影響各工具原有功能。請在專案根目錄執行 `npm run dev:local`，再由側邊欄開啟「AI 設定」並啟用 AI。AI 設定與 API 僅限 `localhost`、`127.0.0.1` 等 loopback 位址；GitHub Pages 與其他主機不會顯示設定，FastAPI 也會拒絕非本機請求。

### Provider 設定

可選 Gemini、OpenAI、Anthropic 或自訂 OpenAI-compatible API，設定 Model、API Key 與 Endpoint，並測試連線。API Key 只保留在目前瀏覽器分頁的記憶體中，不存入 `localStorage`；關閉或重新載入分頁後需重新輸入。連線測試與 AI 操作會實際呼叫所選模型，可能產生供應商費用。

### 目前支援的工具

- **Regex Tester**：依文字描述產生 Regex、解釋 Regex、建議測試案例。只傳需求描述或 Pattern／Flags，不傳測試文字或上傳檔案內容；產生結果需先通過 Regex 語法檢查，再由使用者手動套用。
- **SQL Practice**：依目前 Schema 與需求產生唯讀 SQL 草稿，或解釋目前 SQL。不傳匯入資料列；SQL 草稿需手動套用，再由使用者按「執行 SQL」交給瀏覽器內的 sql.js 執行。

所有 AI 操作都需使用者明確點擊才會送出資料。AI 回覆是建議草稿，不會自動執行或取代原有工具結果。

### 用量與隱私

本機用量統計記錄請求數、Token、工具與操作類型等 metadata，保存在 `python_api/mytools_ai_usage.sqlite3`；不記錄 Prompt、工具資料或 API Key。資料庫檔案不納入 Git。費用僅在使用者填入每百萬 Token 費率且 Provider 有回傳 Token 用量時估算，實際費用以供應商帳單為準。

---

## 🧪 常用指令

請在專案根目錄執行：

```bash
npm run dev      # 啟動開發伺服器
npm run dev:local # 一鍵啟動前端 + 本地 Python API（MarkItDown）
npm run build    # TypeScript 檢查 + 生產打包
npm run preview  # 預覽打包結果
npm run lint     # ESLint 檢查
npm run prepare  # 安裝/更新 husky hooks
npm run lint:commit  # 檢查最近一段 commit 訊息格式
```

---

## ✅ Commit 訊息規範（Conventional Commits v1.0.0）

本專案採用 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)。

### 格式

```text
<type>[optional scope]: <description>
```

### 支援的 type（標準）

- `feat`: 新功能
- `fix`: 修正 bug
- `docs`: 文件調整
- `style`: 不影響邏輯的格式調整（例如空白、分號）
- `refactor`: 重構（非 bug 修正、非新功能）
- `perf`: 效能優化
- `test`: 測試相關
- `build`: 建置系統或外部依賴
- `ci`: CI 設定調整
- `chore`: 其他雜項維護
- `revert`: 回滾提交

### BREAKING CHANGE 寫法

- 可在 type 後加 `!`：`feat!: remove legacy API`
- 或在 commit body/footer 加上 `BREAKING CHANGE: ...`

### 範例

合法：

```text
feat(html-previewer): add codemirror editor input
fix(history): prevent duplicate entries
docs(readme): add commit convention section
chore(ci): add commitlint workflow
```

不合法：

```text
update stuff
fix bug
feature: new page
```

### 檢查機制（本機 + CI）

- 本機：`git commit` 時會觸發 `husky` 的 `commit-msg` hook，使用 `commitlint` 檢查訊息格式。
- CI：GitHub Actions 的 `commitlint` workflow 會在 `push` / `pull_request` 再次檢查，避免 `--no-verify` 略過本機驗證。

### 失敗時如何修正

若最後一次 commit 訊息不符規範，可執行：

```bash
git commit --amend -m "feat(scope): your message"
```

若是更早之前的 commit，需要使用互動式 rebase：

```bash
git rebase -i HEAD~N
```

把要修改的 commit 標記為 `reword`，再依規範更新訊息。

### 版本升級（建議指令）

由於本專案使用 commitlint，建議使用下列指令升版，避免預設訊息不符合 Conventional Commits：

```bash
# 先確認工作目錄乾淨
git status
```

若有未提交變更，請先 commit 或 stash，再執行升版：

```bash
npm version patch -m "chore(release): %s"
```

常用變體：

```bash
npm version minor -m "chore(release): %s"
npm version major -m "chore(release): %s"
```

補充：

- `%s` 會被 npm 自動替換為版本號（例如 `1.0.1`）。
- 若只想更新版本號、不自動建立 commit/tag：

```bash
npm version patch --no-git-tag-version
```

---

## 🛠️ 已實作工具

所有工具均在瀏覽器中執行；除非特別標示，檔案不會上傳。工具頁可由側邊欄或路由直接開啟。

| 類別 | 工具與路由 | 實際功能與限制 |
| :--- | :--- | :--- |
| 編碼轉換 | **Base64** (`/tools/base64`) | UTF-8 / ASCII 雙向編解碼、複製明文或 Base64、錯誤提示與歷史儲存。 |
| 編碼轉換 | [QRCode Previewer](/tools/qrious) | 即時產生 QR Code；接受圖片上傳並以瀏覽器解碼；支援編碼與解碼歷史儲存。 |
| 編碼轉換 | [JWT Decoder](/tools/jwt-decoder) | 解析 `header.payload[.signature]` 與 Bearer 前綴，顯示 Header/Payload/Signature、`exp`/`iat`/`nbf` 時間與過期狀態；不驗證簽章。 |
| 編碼轉換 | [Hash Generator](/tools/hash-generator) | 文字或最多 2 MB 的文字檔計算 MD5、SHA-1、SHA-256、SHA-512，支援複製與歷史儲存。 |
| 編碼轉換 | [URL Toolkit](/tools/url-toolkit) | 解析含協定的 URL、編輯 Query 參數、`encodeURIComponent` / `decodeURIComponent`、讀取文字檔第一個非空行。 |
| 編碼轉換 | [Timestamp Converter](/tools/timestamp-converter) | 自動或指定解析 Unix 秒、毫秒、ISO/日期字串，輸出秒、毫秒、UTC ISO 與本地時間，可帶入現在時間。 |
| 編碼轉換 | [UUID / ULID Generator](/tools/uuid-ulid-generator) | 產生 UUID v4、時間排序的 UUID v7 或 ULID；批次 1–200 筆，可加 prefix/suffix。 |
| JSON / 資料 | [JSON Formatter](/tools/json-formatter) | JSON 語法校驗、錯誤行列定位、Format / Minify、樹狀搜尋與展開、JSON 檔案匯入、複製與歷史儲存。 |
| JSON / 資料 | [JSON Schema Validator](/tools/json-schema-validator) | 使用 Ajv 驗證 JSON Schema，列出 instance path、keyword、message，支援複製結果與歷史儲存。 |
| JSON / 資料 | [CSV/XLSX Parser](/tools/csv-xlsx-to-json) | 匯入 `.csv` / `.xlsx` 第一個工作表；可指定表頭/資料起始列、搜尋、分頁、編輯、刪除、欄位分組，並匯出 JSON/CSV/TXT。 |
| JSON / 資料 | [SQL Practice](/tools/sql-practice) | 預設家具訂單資料、master/detail Schema 編輯、JSON 範本下載與匯入，使用瀏覽器內 sql.js 執行 SQLite 查詢；AI 草稿限唯讀 SQL。 |
| 文字比較 | [Text Diff](/tools/text-diff) | 兩段文字或最多 2 MB 的文字檔逐行比較，支援忽略空白/大小寫、左右同步捲動、差異統計與歷史儲存；每側最多 3,000 行。 |
| 文字比較 | [XSLT 比較器](/tools/xslt-diff) | 貼上或匯入 `.xsl` / `.xslt` / `.xml`，逐行左右比較，支援忽略空白/縮排與差異統計；每側最多 3,000 行。 |
| 文字比較 | [SQL 比較器](/tools/sql-compare) | 貼上或匯入 `.sql` / `.txt`，以指定變數、文字或自訂 Regex 擷取值，列出左右缺少項目；可忽略註解/大小寫並儲存結果。 |
| 文字檢視 | [Hidden Characters](/tools/hidden-characters) | 即時標示空白、換行、Tab、Unicode 空白、控制/格式/零寬字元，列出位置、行欄與 Unicode code point。 |
| 預覽 | [HTML Previewer](/tools/html-previewer) | CodeMirror HTML/CSS 編輯器、語法高亮、即時 iframe 預覽、HTML 格式化與全屏預覽；內容只在瀏覽器渲染。 |
| 預覽 | [Markdown Previewer](/tools/markdown-previewer) | `marked` 即時渲染、Markdown 格式化、HTML/表格轉 Markdown、檔案匯入與全屏預覽；可選本機 MarkItDown 轉換。 |
| 預覽 | [PDF 工具箱](/tools/pdf-toolkit) | 瀏覽未加密 PDF、頁碼/縮放控制、多檔排序合併、指定頁碼範圍擷取與下載；檔案只在瀏覽器處理。 |
| 專案管理 | [Planner Gantt](/tools/planner-gantt) | 匯入 Microsoft Planner `.xlsx`，依 bucket、日期、部門篩選與排序顯示互動甘特圖，可拖曳調整日期，查看完成度/優先順序統計並匯出圖片。 |
| 專案管理 | [Pomodoro Timer](/tools/pomodoro-timer) | 自訂專注、短休息、長休息（1–180 分鐘）、循環次數、自動開始、桌面通知、音效與標籤；設定儲存在瀏覽器。 |
| 系統 | [存檔歷史](/history) | 顯示支援工具手動儲存的 tool/action、Input/Output raw data、時間與 metadata，可單筆刪除。 |

---

## 🗂️ 轉換紀錄（Raw Data）說明

### 使用流程

1. 在支援「儲存此次轉換」的工具完成一次轉換（例如 Base64 encode、JSON format、Markdown render 等）
2. 點擊該工具中的「儲存此次轉換」
3. 前往 `/history` 查看歷史紀錄
4. 可在歷史頁對單筆紀錄按「刪除」

### 儲存內容

- 工具名稱（tool）
- 轉換動作（action）
- Input raw data
- Output raw data
- 建立時間（createdAt）
- 額外資訊（metadata，例如 encoding、解碼來源檔名）

### 儲存規則

- 儲存位置：瀏覽器 `localStorage`
- Key：`mytools:conversion-history`
- 最多保留最新 100 筆紀錄（超過會自動淘汰最舊資料）
- 不會自動上傳雲端，也不會跨裝置同步

---

## 💻 打包後本地預覽（BAT）

`start_server.bat` 會使用 `serve` 啟動 `dist` 內容。

### 1) 安裝 `serve`

```bash
npm install -g serve
```

### 2) 打包

```bash
npm run build
```

### 3) 啟動靜態站

雙擊 `start_server.bat`，預設在 <http://localhost:3000/>。

---

## 🌐 GitHub Pages 部署

本專案已支援透過 GitHub Actions 自動部署到 GitHub Pages。

### 1) 確認已提交以下檔案

- `vite.config.ts`（已設定 Pages 用 `base`）
- `src/router/index.ts`（已設定 `vue-router` 與路由相容轉址）
- `.github/workflows/pages.yml`（自動建置與部署）
- `.github/workflows/commitlint.yml`（commit 訊息格式檢查）

### 2) 推送到 `main`

```bash
git add .
git commit -m "chore: setup github pages deployment"
git push origin main
```

### 3) 啟用 GitHub Pages

到 GitHub 專案頁面：

- `Settings` → `Pages`
- `Build and deployment` 的 `Source` 選擇 `GitHub Actions`

### 4) 查看部署結果

- 到 `Actions` 分頁確認 `Deploy MyTools to GitHub Pages` 成功
- 網址格式：`https://<github-username>.github.io/<repository-name>/`
- 目前為乾淨網址（不含 `#`），例如：`https://fujimmy.github.io/MyTools/`

---

## ❗常見問題

### `npm ERR! enoent Could not read package.json`

代表你目前終端機所在目錄沒有 `package.json`。

請確認目前在專案根目錄後再執行：

```bash
npm run build
```

### `Get Pages site failed. Error: Not Found`（GitHub Actions）

如果在 `actions/configure-pages` 出現這個錯誤，請確認：

1. 進入 `Settings` → `Pages`
2. `Build and deployment` 的 `Source` 已選擇 `GitHub Actions`
3. 倉庫有權限啟用 Pages（若為 Organization，需管理員允許）

本專案 workflow 已設定：

- `.github/workflows/pages.yml` 使用 `actions/configure-pages@v5`
- 並加上 `enablement: true` 以支援首次自動啟用
- 另外會自動建立 `404.html`（SPA fallback）以支援 `BrowserRouter`
