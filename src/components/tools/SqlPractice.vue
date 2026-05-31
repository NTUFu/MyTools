<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { Database, QueryExecResult, SqlJsStatic } from 'sql.js'
import { useHistoryStore } from '../../stores/history'
import {
  createDefaultSqlPracticePayload,
  createDefaultSqlPracticeSchema,
  createInsertSql,
  createPracticeTableSql,
  reconcileSqlPracticePayload,
  createSqlPracticeTemplate,
  DEFAULT_SQL_PRACTICE_QUERY,
  DEFAULT_SQL_PRACTICE_QUESTIONS,
  SQL_PRACTICE_COLUMN_TYPES,
  toSqlValue,
  validateSqlPracticeImport,
  validateSqlPracticeSchema,
  type SqlPracticeColumnSchema,
  type SqlPracticeImportError,
  type SqlPracticeImportPayload,
  type SqlPracticeSchema,
  type SqlPracticeTableKind,
} from '../../utils/sqlPractice'

const historyStore = useHistoryStore()

let sqlJsPromise: Promise<SqlJsStatic> | null = null

const cloneImportPayload = (payload: SqlPracticeImportPayload): SqlPracticeImportPayload => {
  if (typeof structuredClone === 'function') {
    return structuredClone(payload)
  }

  return JSON.parse(JSON.stringify(payload)) as SqlPracticeImportPayload
}

const getSqlJs = () => {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: () => sqlWasmUrl,
    })
  }

  return sqlJsPromise
}

const createInitialState = () => ({
  schema: createDefaultSqlPracticeSchema(),
  data: createDefaultSqlPracticePayload(),
  sql: DEFAULT_SQL_PRACTICE_QUERY,
})

const initialState = createInitialState()

const schema = ref<SqlPracticeSchema>(initialState.schema)
const importPayload = ref<SqlPracticeImportPayload>(initialState.data)
const basePayload = ref<SqlPracticeImportPayload>(cloneImportPayload(initialState.data))
const sqlQuery = ref(initialState.sql)
const queryColumns = ref<string[]>([])
const queryRows = ref<Array<Record<string, string | number | null>>>([])
const queryError = ref('')
const queryInfo = ref('')
const importErrors = ref<SqlPracticeImportError[]>([])
const importStatus = ref('已載入預設家具訂單資料，可直接開始練習 SQL。')
const schemaStatus = ref('')
const saveStatus = ref<'none' | 'saved'>('none')
const isRunningQuery = ref(false)
const isImporting = ref(false)
const isSqlReady = ref(false)

const resetQueryResult = () => {
  queryColumns.value = []
  queryRows.value = []
}

const resetQueryFeedback = () => {
  queryError.value = ''
  queryInfo.value = ''
}

const resetQueryState = () => {
  resetQueryResult()
  resetQueryFeedback()
}

const masterPrimaryKeyOptions = computed(() =>
  schema.value.master.columns.map((column) => ({ label: column.name, value: column.name })),
)

const totalOrderAmount = computed(() =>
  importPayload.value.detailRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
)

const resultSummary = computed(() => {
  if (queryError.value) {
    return '查詢失敗'
  }
  if (queryInfo.value) {
    return queryInfo.value
  }
  if (queryRows.value.length === 0) {
    return '查詢完成，沒有資料列'
  }
  return `查詢完成，共 ${queryRows.value.length} 筆結果`
})

const ensureSqlReady = async () => {
  if (isSqlReady.value) {
    return
  }

  await getSqlJs()
  isSqlReady.value = true
}

const syncCurrentDataWithSchema = (message = 'Schema 已更新，已盡量保留既有資料。') => {
  const reconciledPayload = reconcileSqlPracticePayload(schema.value, importPayload.value)
  const validation = validateSqlPracticeImport(schema.value, reconciledPayload)

  importPayload.value = reconciledPayload
  importErrors.value = validation.ok ? [] : validation.errors
  importStatus.value = validation.ok ? message : `${message} 請檢查下方資料錯誤。`
  resetQueryState()
  saveStatus.value = 'none'
}

watch(
  () => schema.value.master.tableName,
  (newName) => {
    schema.value.detail.columns = schema.value.detail.columns.map((column) => {
      if (!column.foreignKeyColumn) {
        return column
      }
      return {
        ...column,
        foreignKeyTable: newName,
      }
    })
  },
)

const addColumn = (tableKind: SqlPracticeTableKind) => {
  const nextIndex = schema.value[tableKind].columns.length + 1
  const newColumn: SqlPracticeColumnSchema = {
    name: `${tableKind}_field_${nextIndex}`,
    type: 'TEXT',
    nullable: true,
    primaryKey: false,
  }

  schema.value[tableKind].columns.push(newColumn)
  syncCurrentDataWithSchema('欄位已新增，既有資料已保留。')
}

const removeColumn = (tableKind: SqlPracticeTableKind, index: number) => {
  schema.value[tableKind].columns.splice(index, 1)
  syncCurrentDataWithSchema('欄位已刪除，其餘資料已保留。')
}

const setPrimaryKey = (tableKind: SqlPracticeTableKind, index: number) => {
  schema.value[tableKind].columns = schema.value[tableKind].columns.map((column, columnIndex) => ({
    ...column,
    primaryKey: columnIndex === index,
  }))
  syncCurrentDataWithSchema('Primary key 已更新，既有資料已盡量保留。')
}

const setForeignKey = (index: number, foreignKeyColumn: string) => {
  const column = schema.value.detail.columns[index]
  if (!column) {
    return
  }

  if (!foreignKeyColumn) {
    schema.value.detail.columns[index] = {
      ...column,
      foreignKeyColumn: undefined,
      foreignKeyTable: undefined,
    }
  } else {
    schema.value.detail.columns[index] = {
      ...column,
      foreignKeyColumn,
      foreignKeyTable: schema.value.master.tableName,
    }
  }

  syncCurrentDataWithSchema('Foreign key 已更新，既有資料已盡量保留。')
}

const validateCurrentData = () => {
  const validation = validateSqlPracticeImport(schema.value, importPayload.value)
  importErrors.value = validation.ok ? [] : validation.errors
  return validation
}

const validateCurrentSchema = () => {
  const errors = validateSqlPracticeSchema(schema.value)
  schemaStatus.value = errors.length > 0 ? errors[0].message : ''
  return errors
}

const handleResetDefaults = () => {
  const nextState = createInitialState()
  schema.value = nextState.schema
  importPayload.value = nextState.data
  basePayload.value = cloneImportPayload(nextState.data)
  sqlQuery.value = nextState.sql
  importErrors.value = []
  importStatus.value = '已重新載入預設家具訂單資料。'
  schemaStatus.value = ''
  resetQueryState()
  saveStatus.value = 'none'
}

const handleDownloadTemplate = () => {
  const schemaErrors = validateCurrentSchema()
  if (schemaErrors.length > 0) {
    importErrors.value = schemaErrors
    return
  }

  const template = createSqlPracticeTemplate(schema.value)
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${schema.value.master.tableName}-${schema.value.detail.tableName}-template.json`
  link.click()
  URL.revokeObjectURL(url)
  importStatus.value = '已下載 JSON 匯入範本。'
}

const handleDownloadSample = () => {
  const schemaErrors = validateCurrentSchema()
  if (schemaErrors.length > 0) {
    importErrors.value = schemaErrors
    return
  }

  const currentData = reconcileSqlPracticePayload(schema.value, importPayload.value)
  const validation = validateSqlPracticeImport(schema.value, currentData)
  importErrors.value = validation.ok ? [] : validation.errors

  const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${schema.value.master.tableName}-${schema.value.detail.tableName}-data.json`
  link.click()
  URL.revokeObjectURL(url)
  importStatus.value = validation.ok
    ? '已下載目前 schema 對應的資料 JSON。'
    : '已下載目前資料 JSON，但仍有欄位錯誤，請檢查下方訊息。'
}

const handleFileImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  isImporting.value = true
  importErrors.value = []
  resetQueryState()

  try {
    const fileContent = await file.text()
    const parsed = JSON.parse(fileContent) as unknown
    const validation = validateSqlPracticeImport(schema.value, parsed)

    if (!validation.ok || !validation.data) {
      importErrors.value = validation.errors
      importStatus.value = '匯入失敗，請修正 JSON 後再試。'
      return
    }

    importPayload.value = validation.data
    basePayload.value = cloneImportPayload(validation.data)
    importStatus.value = `匯入成功：Master ${validation.data.masterRows.length} 筆、Detail ${validation.data.detailRows.length} 筆。`
  } catch {
    importErrors.value = [{ section: 'meta', rowIndex: null, field: null, message: 'JSON 解析失敗，請確認檔案格式正確。' }]
    importStatus.value = '匯入失敗，檔案不是合法 JSON。'
  } finally {
    isImporting.value = false
    input.value = ''
  }
}

const isAllowedQuery = (sql: string): boolean => {
  const trimmed = sql.trim()
  if (!trimmed) return false
  const statements = trimmed.split(/;/).map(s => s.trim()).filter(s => s.length > 0)
  return statements.every(stmt => /^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(stmt))
}

const syncDbToPayload = (db: Database) => {
  const fromSqlValue = (value: string | number | null, colType: string): string | number | boolean | null => {
    if (value === null) return null
    if (colType === 'BOOLEAN') return value !== 0 && value !== '0'
    return value
  }

  const readTable = (tableName: string, columns: typeof schema.value.master.columns) => {
    const results = db.exec(`SELECT * FROM "${ tableName }"`)
    const result = results[0]
    if (!result) return []
    return result.values.map(row =>
      Object.fromEntries(
        result.columns.map((col, i) => {
          const colDef = columns.find(c => c.name === col)
          return [col, fromSqlValue(row[i] ?? null, colDef?.type ?? 'TEXT')]
        })
      )
    )
  }

  importPayload.value = {
    ...importPayload.value,
    masterRows: readTable(schema.value.master.tableName, schema.value.master.columns),
    detailRows: readTable(schema.value.detail.tableName, schema.value.detail.columns),
  }
}

const runQuery = async () => {
  const schemaErrors = validateCurrentSchema()
  if (schemaErrors.length > 0) {
    importErrors.value = schemaErrors
    queryError.value = schemaErrors[0].message
    return
  }

  const currentDataValidation = validateCurrentData()
  if (!currentDataValidation.ok) {
    queryError.value = currentDataValidation.errors[0]?.message ?? '目前資料不符合 schema，請先修正。'
    return
  }

  if (importPayload.value.masterRows.length === 0 || importPayload.value.detailRows.length === 0) {
    queryError.value = '請先載入資料後再執行 SQL。'
    return
  }

  if (!isAllowedQuery(sqlQuery.value)) {
    queryError.value = '僅允許 SELECT / INSERT / UPDATE / DELETE，不支援 DDL（CREATE、DROP、ALTER）。'
    return
  }

  isRunningQuery.value = true
  queryError.value = ''
  queryInfo.value = ''

  try {
    await ensureSqlReady()
    const SQL = await getSqlJs()
    const db = new SQL.Database()

    try {
      db.run('PRAGMA foreign_keys = ON;')
      createPracticeTableSql(schema.value).forEach((statement) => db.run(statement))

      const insertMaster = db.prepare(createInsertSql(schema.value.master))
      importPayload.value.masterRows.forEach((row) => {
        insertMaster.run(schema.value.master.columns.map((column) => toSqlValue(row[column.name] ?? null)))
      })
      insertMaster.free()

      const insertDetail = db.prepare(createInsertSql(schema.value.detail))
      importPayload.value.detailRows.forEach((row) => {
        insertDetail.run(schema.value.detail.columns.map((column) => toSqlValue(row[column.name] ?? null)))
      })
      insertDetail.free()

      const result = db.exec(sqlQuery.value)
      const rowsModified = db.getRowsModified()

      syncDbToPayload(db)

      const lastResult: QueryExecResult | undefined = result[result.length - 1]

      if (!lastResult) {
        queryColumns.value = []
        queryRows.value = []
        queryInfo.value = rowsModified > 0
          ? `執行成功，影響 ${rowsModified} 筆資料。`
          : '執行成功，無列受影響。'
      } else {
        queryColumns.value = lastResult.columns
        queryRows.value = lastResult.values.map((valueRow) =>
          Object.fromEntries(lastResult.columns.map((column, index) => [column, valueRow[index] ?? null])),
        )
      }
    } finally {
      db.close()
    }
  } catch (error) {
    queryColumns.value = []
    queryRows.value = []
    queryError.value = error instanceof Error ? error.message : 'SQL 執行失敗'
  } finally {
    isRunningQuery.value = false
  }
}

const handleUseExampleSql = (sql: string) => {
  sqlQuery.value = sql
  saveStatus.value = 'none'
}

const handleSaveCurrent = () => {
  if (!sqlQuery.value.trim()) {
    queryError.value = '請先輸入 SQL 再儲存。'
    return
  }

  historyStore.saveHistoryItem({
    tool: 'sql-practice',
    action: 'run-query',
    input: sqlQuery.value,
    output: JSON.stringify(queryRows.value, null, 2),
    metadata: {
      masterRows: importPayload.value.masterRows.length,
      detailRows: importPayload.value.detailRows.length,
      resultRows: queryRows.value.length,
      hasError: Boolean(queryError.value),
    },
  })

  saveStatus.value = 'saved'
  setTimeout(() => {
    saveStatus.value = 'none'
  }, 2000)
}

const handleResetToBase = () => {
  importPayload.value = cloneImportPayload(basePayload.value)
  importErrors.value = []
  importStatus.value = '已還原至最後一次載入的資料。'
  resetQueryState()
  saveStatus.value = 'none'
}
</script>

<template>
  <div class="sql-practice-page">
    <section class="hero-panel">
      <div class="hero-header">
        <p class="eyebrow">SQL Practice</p>
        <h2>SQL 練習</h2>
        <p class="hero-copy">
          線上設定 master/detail schema、下載 JSON 範本、匯入資料後直接在前端執行 SQL。
        </p>
      </div>
      <div class="hero-metrics">
        <div class="metric-card">
          <span class="metric-label">Master</span>
          <strong>{{ importPayload.masterRows.length }}</strong>
          <span>{{ schema.master.tableName }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Detail</span>
          <strong>{{ importPayload.detailRows.length }}</strong>
          <span>{{ schema.detail.tableName }}</span>
        </div>
        <div class="metric-card accent">
          <span class="metric-label">總銷售額</span>
          <strong>{{ totalOrderAmount.toLocaleString('zh-TW') }}</strong>
          <span>家具示範資料</span>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <div class="panel schema-panel">
        <div class="panel-header">
          <div>
            <h3>1. 設定 Schema</h3>
            <p>編輯 master / detail 欄位，系統會依 schema 產生匯入範本。</p>
          </div>
          <div class="button-row wrap">
            <button class="tool-button" @click="handleResetDefaults">載入預設資料</button>
          </div>
        </div>

        <p v-if="schemaStatus" class="status-message error">{{ schemaStatus }}</p>

        <div class="schema-columns">
          <div class="schema-card">
            <div class="schema-card-header">
              <h4>Master Table</h4>
              <button class="tool-button tool-button--compact" @click="addColumn('master')">新增欄位</button>
            </div>
            <label class="field-label">
              Table Name
              <input v-model="schema.master.tableName" class="text-input" @input="syncCurrentDataWithSchema()">
            </label>

            <div class="column-list">
              <div v-for="(column, index) in schema.master.columns" :key="`master-${index}`" class="column-row">
                <input v-model="column.name" class="text-input" placeholder="欄位名稱" @input="syncCurrentDataWithSchema()">
                <select v-model="column.type" class="select-input" @change="syncCurrentDataWithSchema()">
                  <option v-for="columnType in SQL_PRACTICE_COLUMN_TYPES" :key="columnType" :value="columnType">
                    {{ columnType }}
                  </option>
                </select>
                <label class="checkbox-label">
                  <input :checked="column.primaryKey" type="checkbox" @change="setPrimaryKey('master', index)">
                  PK
                </label>
                <label class="checkbox-label">
                  <input v-model="column.nullable" type="checkbox" @change="syncCurrentDataWithSchema()">
                  Nullable
                </label>
                <button class="tool-button tool-button--compact danger" @click="removeColumn('master', index)">刪除</button>
              </div>
            </div>
          </div>

          <div class="schema-card">
            <div class="schema-card-header">
              <h4>Detail Table</h4>
              <button class="tool-button tool-button--compact" @click="addColumn('detail')">新增欄位</button>
            </div>
            <label class="field-label">
              Table Name
              <input v-model="schema.detail.tableName" class="text-input" @input="syncCurrentDataWithSchema()">
            </label>

            <div class="column-list">
              <div v-for="(column, index) in schema.detail.columns" :key="`detail-${index}`" class="column-row detail">
                <input v-model="column.name" class="text-input" placeholder="欄位名稱" @input="syncCurrentDataWithSchema()">
                <select v-model="column.type" class="select-input" @change="syncCurrentDataWithSchema()">
                  <option v-for="columnType in SQL_PRACTICE_COLUMN_TYPES" :key="columnType" :value="columnType">
                    {{ columnType }}
                  </option>
                </select>
                <select
                  class="select-input"
                  :value="column.foreignKeyColumn || ''"
                  @change="setForeignKey(index, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">無 FK</option>
                  <option v-for="option in masterPrimaryKeyOptions" :key="option.value" :value="option.value">
                    FK -> {{ option.label }}
                  </option>
                </select>
                <label class="checkbox-label">
                  <input :checked="column.primaryKey" type="checkbox" @change="setPrimaryKey('detail', index)">
                  PK
                </label>
                <label class="checkbox-label">
                  <input v-model="column.nullable" type="checkbox" @change="syncCurrentDataWithSchema()">
                  Nullable
                </label>
                <button class="tool-button tool-button--compact danger" @click="removeColumn('detail', index)">刪除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel import-panel">
        <div class="panel-header">
          <div>
            <h3>2. 匯入資料</h3>
            <p>下載 JSON 範本離線填寫，再匯入 master/detail 資料。</p>
          </div>
          <div class="button-row wrap">
            <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleDownloadTemplate">
              下載空白 JSON
            </button>
            <button class="tool-button" style="--tool-button-bg: #455a64" @click="handleDownloadSample">
              下載目前資料 JSON
            </button>
            <label class="upload-button">
              <input type="file" accept=".json,application/json" @change="handleFileImport">
              {{ isImporting ? '匯入中...' : '匯入 JSON' }}
            </label>
          </div>
        </div>

        <p class="status-message">{{ importStatus }}</p>

        <div v-if="importErrors.length > 0" class="error-list">
          <strong>匯入錯誤</strong>
          <ul>
            <li v-for="(error, index) in importErrors" :key="`${error.section}-${error.field}-${index}`">
              {{ error.section }}
              <span v-if="error.rowIndex !== null">[{{ error.rowIndex + 1 }}]</span>
              <span v-if="error.field"> / {{ error.field }}</span>
              : {{ error.message }}
            </li>
          </ul>
        </div>

        <div class="preview-grid">
          <div class="preview-card">
            <div class="preview-card-header">
              <h4>{{ schema.master.tableName }}</h4>
              <span>{{ importPayload.masterRows.length }} 筆</span>
            </div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th v-for="column in schema.master.columns" :key="column.name">{{ column.name }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in importPayload.masterRows" :key="`master-row-${rowIndex}`">
                    <td v-for="column in schema.master.columns" :key="`${rowIndex}-${column.name}`">{{ row[column.name] }}</td>
                  </tr>
                  <tr v-if="importPayload.masterRows.length === 0">
                    <td :colspan="schema.master.columns.length">尚無 master 資料</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="preview-card">
            <div class="preview-card-header">
              <h4>{{ schema.detail.tableName }}</h4>
              <span>{{ importPayload.detailRows.length }} 筆</span>
            </div>
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th v-for="column in schema.detail.columns" :key="column.name">{{ column.name }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in importPayload.detailRows" :key="`detail-row-${rowIndex}`">
                    <td v-for="column in schema.detail.columns" :key="`${rowIndex}-${column.name}`">{{ row[column.name] }}</td>
                  </tr>
                  <tr v-if="importPayload.detailRows.length === 0">
                    <td :colspan="schema.detail.columns.length">尚無 detail 資料</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="panel question-panel">
        <div class="panel-header">
          <div>
            <h3>3. 練習題</h3>
            <p>以下題目預設套用家具訂單假資料，可一鍵帶入範例 SQL。</p>
          </div>
        </div>

        <div class="question-list">
          <article v-for="question in DEFAULT_SQL_PRACTICE_QUESTIONS" :key="question.id" class="question-card">
            <div>
              <h4>{{ question.title }}</h4>
              <p>{{ question.prompt }}</p>
            </div>
            <button class="tool-button tool-button--compact question-apply-button" @click="handleUseExampleSql(question.exampleSql)">
              帶入 SQL
            </button>
          </article>
        </div>
      </div>

      <div class="panel query-panel">
        <div class="panel-header">
          <div>
            <h3>4. SQL Playground</h3>
            <p>支援 SELECT / INSERT / UPDATE / DELETE，資料庫在瀏覽器內執行；DML 執行後資料會即時同步。</p>
          </div>
          <div class="button-row wrap">
            <button class="tool-button" style="--tool-button-bg: #1a73e8" @click="runQuery">
              {{ isRunningQuery ? '執行中...' : '執行 SQL' }}
            </button>
            <button class="tool-button" style="--tool-button-bg: #2e7d32" @click="handleSaveCurrent">
              儲存此次查詢
            </button>
            <button class="tool-button" style="--tool-button-bg: #c62828" @click="handleResetToBase">
              還原資料
            </button>
            <span v-if="saveStatus === 'saved'" class="saved-text">已儲存</span>
          </div>
        </div>

        <textarea v-model="sqlQuery" class="sql-editor" spellcheck="false" placeholder="輸入 SQL（SELECT / INSERT / UPDATE / DELETE）"></textarea>

        <p v-if="queryError" class="status-message error">{{ queryError }}</p>
        <p v-else class="status-message">{{ resultSummary }}</p>

        <div class="data-table-wrap result-wrap">
          <table v-if="queryColumns.length > 0" class="data-table result-table">
            <thead>
              <tr>
                <th v-for="column in queryColumns" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in queryRows" :key="`result-row-${rowIndex}`">
                <td v-for="column in queryColumns" :key="`${rowIndex}-${column}`">{{ row[column] }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-result">尚未有查詢結果。</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sql-practice-page {
  padding: 24px;
  background: #ffffff;
  min-height: 100%;
  box-sizing: border-box;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr);
  gap: 18px;
  margin-bottom: 18px;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.hero-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
  background: #f1f5f9;
}

.hero-panel h2 {
  margin: 0;
  font-size: 24px;
  color: #1f2937;
}

.hero-copy {
  margin: 0;
  max-width: 720px;
  color: #64748b;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-self: start;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-height: 108px;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.metric-card strong {
  font-size: 24px;
  color: #0f172a;
}

.metric-card.accent {
  background: #fff8eb;
  border-color: #f0dfc7;
}

.metric-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.workspace-grid {
  display: grid;
  gap: 18px;
}

.panel {
  padding: 20px;
  border: 1px solid rgba(21, 52, 72, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 28px rgba(21, 52, 72, 0.08);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-header h3,
.panel-header h4,
.schema-card-header h4,
.preview-card-header h4,
.question-card h4 {
  margin: 0;
}

.panel-header p,
.question-card p {
  margin: 6px 0 0;
  color: #5f6c76;
}

.button-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.button-row.wrap {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.schema-columns,
.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.schema-card,
.preview-card {
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.schema-card-header,
.preview-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.column-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.column-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) 120px 74px 110px 72px;
  gap: 8px;
  align-items: center;
}

.column-row.detail {
  grid-template-columns: minmax(0, 1.1fr) 110px 140px 74px 110px 72px;
}

.text-input,
.select-input,
.sql-editor {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  box-sizing: border-box;
  font-size: 13px;
  color: #0f172a;
  background: #ffffff;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.danger {
  --tool-button-bg: #d32f2f;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  background: #ffb703;
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16);
  cursor: pointer;
}

.upload-button input {
  display: none;
}

.status-message {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eef6ff;
  color: #1d4f91;
}

.status-message.error,
.error-list {
  background: #fff1f2;
  color: #b42318;
}

.error-list {
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 14px;
}

.error-list ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.data-table-wrap {
  overflow: auto;
  border-radius: 12px;
  border: 1px solid #dbe3ec;
  background: #ffffff;
}

.data-table {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
  white-space: nowrap;
}

.data-table th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  color: #334155;
  z-index: 1;
}

.question-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.question-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.question-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.question-card h4 {
  color: #1f2937;
}

.question-card p {
  color: #64748b;
  line-height: 1.6;
}

.question-apply-button {
  --tool-button-bg: #455a64;
  flex-shrink: 0;
}

.sql-editor {
  min-height: 220px;
  resize: vertical;
  margin-bottom: 14px;
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  line-height: 1.55;
}

.result-wrap {
  min-height: 220px;
}

.empty-result {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #64748b;
}

.saved-text {
  color: #2e7d32;
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1200px) {
  .hero-panel,
  .schema-columns,
  .preview-grid,
  .question-list {
    grid-template-columns: 1fr;
  }

  .hero-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .sql-practice-page {
    padding: 16px;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .panel-header,
  .question-card {
    flex-direction: column;
  }

  .column-row,
  .column-row.detail {
    grid-template-columns: 1fr;
  }
}
</style>