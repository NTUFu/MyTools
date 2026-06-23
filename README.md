# MyTools - 開發者實用工具箱

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vue](https://img.shields.io/badge/Vue-42B883?style=for-the-badge&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

這是一個以 Vue 3 + TypeScript + Vite 建置的工具型 SPA，整合常用的開發與資料處理小工具。

目前版本：`5.1.0`

## 🆕 近期更新（5.1.0）

- Planner Gantt 新增更完整的檢視資訊：已逾期 / 即將到期統計、優先順序標示（緊急/重要/中/低）、人員與 bucket 分布摘要。
- Planner Gantt 的「已選擇任務」資訊卡強化缺漏提示規則，快速辨識未填欄位與待完成檢查清單。
- 多個工具頁已進行程式碼優化（狀態重置與計時器邏輯整併、重複計算降低），在不改變使用流程下提升可維護性。

---

## ✨ 專案特色

- 類似 Gemini 的簡潔介面與可收合側邊欄。
- `vue-router` 路由切換，工具頁面可獨立存取。
- `Pinia` 管理 UI 狀態與轉換歷史，資料持久化於 `localStorage`。
- 模組化元件設計，方便持續新增工具。
- 支援本地開發、正式打包與靜態站預覽。
- HTML 預覽器內建 CodeMirror 編輯器，提供行號與 HTML syntax highlighting，支援全屏預覽。
- Markdown 預覽器支援檔案上傳解析（含 HTML 自動轉 Markdown）、即時渲染與全屏預覽。
- CSV/XLSX Parser 支援檔案解析、關鍵字篩選、單筆編輯刪除與 JSON/CSV/TXT 匯出。
- Planner Gantt 支援匯入 Microsoft Planner XLSX，產生可互動甘特圖與統計摘要。
- 各工具可手動儲存「此次轉換 raw data」，並集中在存檔歷史檢視與刪除。

---

## 🗺️ 未來規劃 (Roadmap)

根據 `todo.md`，以下為規劃中或正在開發的功能：

### 高優先級

- **URL Encoder / Decoder**: 包含 `encodeURIComponent` 的完整支援。
- **Unix Timestamp Converter**: 秒、毫秒與 ISO 時間格式互轉。
- **UUID / ULID Generator**: 支援批次產生。
- **Hash / HMAC Generator**: 支援 MD5, SHA-1, SHA-256。
- **Regex Tester**: 即時測試表達式、預覽取代結果與捕獲組。
- **Diff Compare**: 比較兩段文字的差異。

### 次優先級

- **JSON Schema Validator**: 驗證 JSON 是否符合指定的 Schema。
- **Cron Expression Helper**: 提供人類可讀的描述與下次觸發時間。
- **SQL Formatter**: 支援 SQL 的格式化與壓縮。
- **JWT Decoder 強化**: 加入簽章與 Claim 驗證功能。

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
啟動後可用健康檢查確認：`GET http://127.0.0.1:8000/api/health`

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

| 工具 | 路由 | 主要功能 |
| :--- | :--- | :--- |
| Base64 編解碼 | `/tools/base64` | UTF-8 / ASCII 轉換、雙向編解碼、錯誤提示、儲存此次轉換 |
| JWT Decoder | `/tools/jwt-decoder` | 解析 JWT Header/Payload、exp/iat/nbf 時間欄位轉換、儲存此次轉換 |
| JSON Formatter | `/tools/json-formatter` | Format / Minify、語法校驗、複製結果、可搜尋的格式化預覽、儲存此次轉換 |
| HTML Previewer | `/tools/html-previewer` | CodeMirror HTML 編輯器（行號、syntax highlighting）、即時預覽、格式化 HTML、全屏預覽、儲存此次轉換 |
| Markdown Previewer | `/tools/markdown-previewer` | 即時渲染、`marked` 解析、上傳檔案轉 Markdown（含 HTML 自動轉換）、可勾選優先使用本地 Python MarkItDown API（不可用時自動 fallback 前端解析）、顯示 MarkItDown 支援類型說明、HTML 渲染結果全屏預覽、儲存此次轉換 |
| CSV/XLSX Parser | `/tools/csv-xlsx-to-json` | 上傳 .csv / .xlsx 分頁瀏覽表格；關鍵字搜尋（符合列黃底標記、僅顯示符合列）；單筆編輯（儲存後即時反映）、單筆刪除（含資料預覽確認 Modal）；可設定分隔符號匯出 JSON / CSV / TXT，匯出以畫面最後呈現資料為準；行號欄凍結，編輯模式同時凍結操作欄 |
| QRCode Previewer | `/tools/qrious` | 即時產生 QR Code、上傳圖片解碼、儲存此次轉換（編碼/解碼） |
| XSLT 比較器 | `/tools/xslt-diff` | 上傳或貼上兩份 XSLT / XML，逐行比較並以左右分割視圖高亮差異、儲存此次轉換 |
| SQL 比較器 | `/tools/sql-compare` | 上傳或貼上兩份 SQL，自訂 Regex 比較條件，列出左右缺少清單並可儲存結果 |
| SQL Practice | `/tools/sql-practice` | 預設家具訂單假資料、線上設定 master/detail schema、下載 JSON 範本、匯入資料並在前端執行 SQL 查詢 |
| Planner Gantt | `/tools/planner-gantt` | 匯入 Microsoft Planner XLSX，依 bucket 與日期產生甘特圖；提供已逾期/即將到期、優先順序、人員與 bucket 分布等檢視摘要，並支援圖片匯出 |
| 存檔歷史 | `/history` | 顯示所有已儲存 raw data（input/output）、可單筆刪除 |

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
