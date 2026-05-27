# GitHub Copilot Workspace Instructions (MyTools)

你在此工作區產生程式碼與回覆時，請遵守以下規範。

## 1) 回覆與溝通

- 回覆語言使用繁體中文。
- 回覆方式先給結論，再給可執行步驟。
- 內容保持精簡、明確，避免不必要延伸。

## 2) 專案技術棧（Source of Truth）

- 前端框架：Vue 3（Composition API）+ TypeScript。
- 建置工具：Vite（`rolldown-vite`）。
- 狀態管理：Pinia。
- 路由：vue-router（history mode）。
- 主要入口與路由：
	- `src/main.ts`
	- `src/router/index.ts`
- `package.json` 為 scripts 與依賴版本唯一依據，不從資料夾名稱猜測技術版本。

## 3) 工作原則

- 只做本次需求必要的最小修改。
- 優先維持現有架構與命名，不做未被要求的重構。
- 需求不明但不阻塞時，採安全且最小假設直接完成，並簡短註明假設。
- 只有在無法正確實作時才提出釐清問題。

## 4) 程式風格與一致性

- 優先遵循檔案既有風格（縮排、命名、排序、註解習慣）。
- Vue 元件以現有慣例為主：`<script setup lang="ts">` + Composition API。
- 不任意更名既有路由、localStorage key、資料欄位、對外顯示文字。
- 非必要不引入新套件；若需新增，需有明確效益並維持相容性。

## 5) MyTools 專案專屬約束

- 掛載節點沿用 `#root`（見 `src/main.ts`），不要擅自改為 `#app`。
- 轉換紀錄儲存規格需維持相容：
	- localStorage key：`mytools:conversion-history`
	- 最多 100 筆（先新後舊）
	- 既有欄位結構不可任意破壞
- 路由使用 `createWebHistory(import.meta.env.BASE_URL)`，需保留 GitHub Pages 相容性。
- `vite.config.ts` 已處理 GitHub Actions 的 `base`，不要任意改動部署路徑邏輯。
- 側邊欄版本顯示使用 `__APP_VERSION__`，需保持可用。

## 6) 新增工具時的必要同步

若新增一個工具頁，至少同步檢查以下檔案：

- `src/router/index.ts`：新增 route 與必要 redirect。
- `src/components/Content.vue`：新增首頁工具卡。
- `src/components/Sidebar.vue`：新增側邊欄入口。
- 若該工具要寫入歷史紀錄：
	- `src/utils/historyStore.ts` 的 `ToolType`
	- 使用 `src/stores/history.ts` 的儲存流程
- `README.md`：更新工具列表與使用說明。

## 7) 檔案修改邊界

- 僅修改與需求直接相關檔案，避免連帶改動無關區塊。
- 不主動清理既有無關警告、格式或 dead code（除非需求要求）。
- 未經要求，不修改以下內容：
	- `node_modules/`
	- `dist/`
	- 第三方產物或自動生成內容

## 8) 驗證與命令

可行時，修改後至少執行對應驗證：

- 開發：`npm run dev`
- Lint：`npm run lint`
- Build：`npm run build`
- Commit 訊息檢查：`npm run lint:commit`

若無法執行驗證，要明確說明原因；若有錯誤，需區分「本次改動引入」或「既有問題」。

## 9) Commit 與版本規範

- 使用 Conventional Commits。
- 常見類型：`feat`、`fix`、`docs`、`refactor`、`chore`。
- 版本升級指令建議：
	- `npm version patch -m "chore(release): %s"`
	- `npm version minor -m "chore(release): %s"`
	- `npm version major -m "chore(release): %s"`

## 10) 安全與設定

- 不新增或暴露任何密鑰、Token、私密設定。
- 不任意更動現有環境變數命名與設定鍵。
- 以向後相容為優先，避免破壞既有使用者流程與資料。