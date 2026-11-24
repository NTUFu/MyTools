export type SqlPracticeColumnType = 'INTEGER' | 'REAL' | 'TEXT' | 'BOOLEAN' | 'DATE' | 'DATETIME'
export type SqlPracticeTableKind = 'master' | 'detail'

export interface SqlPracticeColumnSchema {
  name: string
  type: SqlPracticeColumnType
  nullable: boolean
  primaryKey: boolean
  foreignKeyTable?: string
  foreignKeyColumn?: string
}

export interface SqlPracticeTableSchema {
  tableName: string
  columns: SqlPracticeColumnSchema[]
}

export interface SqlPracticeSchema {
  master: SqlPracticeTableSchema
  detail: SqlPracticeTableSchema
}

export interface SqlPracticeImportMeta {
  version: number
  masterTable: string
  detailTable: string
}

export interface SqlPracticeImportPayload {
  meta: SqlPracticeImportMeta
  masterRows: SqlPracticeRow[]
  detailRows: SqlPracticeRow[]
}

export interface SqlPracticeImportError {
  section: 'meta' | 'masterRows' | 'detailRows' | 'schema'
  rowIndex: number | null
  field: string | null
  message: string
}

export interface SqlPracticeValidationResult {
  ok: boolean
  errors: SqlPracticeImportError[]
  data: SqlPracticeImportPayload | null
}

export interface SqlPracticeQuestion {
  id: string
  title: string
  prompt: string
  exampleSql: string
}

export type SqlPracticePrimitive = string | number | boolean | null
export type SqlPracticeRow = Record<string, SqlPracticePrimitive>

export const SQL_PRACTICE_COLUMN_TYPES: SqlPracticeColumnType[] = [
  'INTEGER',
  'REAL',
  'TEXT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
]

const DEFAULT_MASTER_COLUMNS: SqlPracticeColumnSchema[] = [
  { name: 'order_id', type: 'INTEGER', nullable: false, primaryKey: true },
  { name: 'customer_name', type: 'TEXT', nullable: false, primaryKey: false },
  { name: 'city', type: 'TEXT', nullable: false, primaryKey: false },
  { name: 'order_date', type: 'DATE', nullable: false, primaryKey: false },
  { name: 'salesperson', type: 'TEXT', nullable: false, primaryKey: false },
  { name: 'status', type: 'TEXT', nullable: false, primaryKey: false },
]

const DEFAULT_DETAIL_COLUMNS: SqlPracticeColumnSchema[] = [
  { name: 'item_id', type: 'INTEGER', nullable: false, primaryKey: true },
  {
    name: 'order_id',
    type: 'INTEGER',
    nullable: false,
    primaryKey: false,
    foreignKeyTable: 'orders',
    foreignKeyColumn: 'order_id',
  },
  { name: 'product_name', type: 'TEXT', nullable: false, primaryKey: false },
  { name: 'category', type: 'TEXT', nullable: false, primaryKey: false },
  { name: 'qty', type: 'INTEGER', nullable: false, primaryKey: false },
  { name: 'unit_price', type: 'REAL', nullable: false, primaryKey: false },
  { name: 'amount', type: 'REAL', nullable: false, primaryKey: false },
]

const DEFAULT_MASTER_ROWS: SqlPracticeRow[] = [
  { order_id: 1001, customer_name: '王小明', city: '台北', order_date: '2026-03-01', salesperson: 'Ivy', status: 'paid' },
  { order_id: 1002, customer_name: '陳怡君', city: '新竹', order_date: '2026-03-02', salesperson: 'Leo', status: 'shipped' },
  { order_id: 1003, customer_name: '林冠廷', city: '台中', order_date: '2026-03-03', salesperson: 'Amy', status: 'completed' },
  { order_id: 1004, customer_name: '黃詩涵', city: '高雄', order_date: '2026-03-04', salesperson: 'Ivy', status: 'pending' },
  { order_id: 1005, customer_name: '張哲維', city: '桃園', order_date: '2026-03-05', salesperson: 'Mia', status: 'paid' },
  { order_id: 1006, customer_name: '李佳穎', city: '台南', order_date: '2026-03-06', salesperson: 'Leo', status: 'completed' },
  { order_id: 1007, customer_name: '吳承翰', city: '台北', order_date: '2026-03-07', salesperson: 'Amy', status: 'shipped' },
  { order_id: 1008, customer_name: '許庭瑜', city: '新北', order_date: '2026-03-08', salesperson: 'Mia', status: 'paid' },
  { order_id: 1009, customer_name: '蔡佩珊', city: '台中', order_date: '2026-03-09', salesperson: 'Ivy', status: 'completed' },
  { order_id: 1010, customer_name: '鄭博文', city: '高雄', order_date: '2026-03-10', salesperson: 'Leo', status: 'pending' },
]

const DEFAULT_DETAIL_ROWS: SqlPracticeRow[] = [
  { item_id: 1, order_id: 1001, product_name: '北歐雙人沙發', category: '客廳', qty: 1, unit_price: 18500, amount: 18500 },
  { item_id: 2, order_id: 1001, product_name: '橡木茶几', category: '客廳', qty: 1, unit_price: 5600, amount: 5600 },
  { item_id: 3, order_id: 1002, product_name: '六人餐桌', category: '餐廳', qty: 1, unit_price: 13200, amount: 13200 },
  { item_id: 4, order_id: 1002, product_name: '餐椅', category: '餐廳', qty: 4, unit_price: 2200, amount: 8800 },
  { item_id: 5, order_id: 1003, product_name: '升降書桌', category: '書房', qty: 1, unit_price: 9800, amount: 9800 },
  { item_id: 6, order_id: 1003, product_name: '人體工學椅', category: '辦公', qty: 1, unit_price: 7600, amount: 7600 },
  { item_id: 7, order_id: 1004, product_name: '五尺床架', category: '臥室', qty: 1, unit_price: 14800, amount: 14800 },
  { item_id: 8, order_id: 1004, product_name: '床頭櫃', category: '臥室', qty: 2, unit_price: 2800, amount: 5600 },
  { item_id: 9, order_id: 1005, product_name: '推門衣櫃', category: '臥室', qty: 1, unit_price: 17200, amount: 17200 },
  { item_id: 10, order_id: 1005, product_name: '全身鏡', category: '臥室', qty: 1, unit_price: 3200, amount: 3200 },
  { item_id: 11, order_id: 1006, product_name: '電視櫃', category: '客廳', qty: 1, unit_price: 8400, amount: 8400 },
  { item_id: 12, order_id: 1006, product_name: '展示櫃', category: '客廳', qty: 1, unit_price: 9100, amount: 9100 },
  { item_id: 13, order_id: 1007, product_name: 'L 型沙發', category: '客廳', qty: 1, unit_price: 23800, amount: 23800 },
  { item_id: 14, order_id: 1007, product_name: '邊几', category: '客廳', qty: 2, unit_price: 1900, amount: 3800 },
  { item_id: 15, order_id: 1008, product_name: '兒童書桌', category: '書房', qty: 1, unit_price: 6200, amount: 6200 },
  { item_id: 16, order_id: 1008, product_name: '書櫃', category: '書房', qty: 1, unit_price: 7300, amount: 7300 },
  { item_id: 17, order_id: 1008, product_name: '收納櫃', category: '書房', qty: 1, unit_price: 4200, amount: 4200 },
  { item_id: 18, order_id: 1009, product_name: '岩板餐桌', category: '餐廳', qty: 1, unit_price: 16800, amount: 16800 },
  { item_id: 19, order_id: 1009, product_name: '餐椅', category: '餐廳', qty: 6, unit_price: 2200, amount: 13200 },
  { item_id: 20, order_id: 1010, product_name: '單人沙發', category: '客廳', qty: 2, unit_price: 6800, amount: 13600 },
  { item_id: 21, order_id: 1010, product_name: '落地燈', category: '客廳', qty: 1, unit_price: 2600, amount: 2600 },
  { item_id: 22, order_id: 1010, product_name: '鞋櫃', category: '玄關', qty: 1, unit_price: 5900, amount: 5900 },
]

export const DEFAULT_SQL_PRACTICE_QUERY = `SELECT
  o.order_id,
  o.customer_name,
  o.city,
  SUM(i.amount) AS order_total
FROM orders AS o
JOIN order_items AS i ON o.order_id = i.order_id
GROUP BY o.order_id, o.customer_name, o.city
ORDER BY order_total DESC;`

export const DEFAULT_SQL_PRACTICE_QUESTIONS: SqlPracticeQuestion[] = [
  {
    id: 'question-1',
    title: '查詢所有訂單總額',
    prompt: '列出每張訂單的訂單編號、客戶名稱與總金額，並依總金額由高到低排序。',
    exampleSql: DEFAULT_SQL_PRACTICE_QUERY,
  },
  {
    id: 'question-2',
    title: '找出已付款訂單',
    prompt: '查出 status 為 paid 的訂單及其客戶名稱、城市、日期。',
    exampleSql: `SELECT order_id, customer_name, city, order_date\nFROM orders\nWHERE status = 'paid'\nORDER BY order_date DESC;`,
  },
  {
    id: 'question-3',
    title: '統計家具類別銷售額',
    prompt: '依 category 分組，計算每個家具類別的銷售總額與銷售件數。',
    exampleSql: `SELECT category, SUM(amount) AS total_amount, SUM(qty) AS total_qty\nFROM order_items\nGROUP BY category\nORDER BY total_amount DESC;`,
  },
  {
    id: 'question-4',
    title: '找出高價訂單',
    prompt: '列出總金額超過 20000 的訂單編號與客戶名稱。',
    exampleSql: `SELECT o.order_id, o.customer_name, SUM(i.amount) AS total_amount\nFROM orders o\nJOIN order_items i ON o.order_id = i.order_id\nGROUP BY o.order_id, o.customer_name\nHAVING SUM(i.amount) > 20000\nORDER BY total_amount DESC;`,
  },
  {
    id: 'question-5',
    title: '查詢各業務員接單量',
    prompt: '統計每位 salesperson 的訂單數與平均訂單金額。',
    exampleSql: `SELECT o.salesperson, COUNT(DISTINCT o.order_id) AS order_count, ROUND(AVG(t.total_amount), 2) AS avg_order_total\nFROM orders o\nJOIN (\n  SELECT order_id, SUM(amount) AS total_amount\n  FROM order_items\n  GROUP BY order_id\n) t ON o.order_id = t.order_id\nGROUP BY o.salesperson\nORDER BY avg_order_total DESC;`,
  },
]

const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeDate = (value: string): string | null => {
  if (!DATE_PATTERN.test(value)) {
    return null
  }

  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return value
}

const normalizeDateTime = (value: string): string | null => {
  if (!DATETIME_PATTERN.test(value)) {
    return null
  }

  const normalized = value.replace('T', ' ')
  const [datePart, timePart] = normalized.split(' ')
  const validDate = normalizeDate(datePart)
  if (!validDate) {
    return null
  }

  const [hours, minutes, seconds] = timePart.split(':').map((part) => Number.parseInt(part, 10))
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null
  }

  return normalized
}

const normalizeValue = (
  column: SqlPracticeColumnSchema,
  rawValue: unknown,
): { ok: true; value: SqlPracticePrimitive } | { ok: false; message: string } => {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    if (column.nullable) {
      return { ok: true, value: null }
    }

    return { ok: false, message: '必填欄位不可為空' }
  }

  if (column.type === 'INTEGER') {
    const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    if (!Number.isInteger(parsed)) {
      return { ok: false, message: '欄位型態需為 INTEGER' }
    }
    return { ok: true, value: parsed }
  }

  if (column.type === 'REAL') {
    const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    if (!Number.isFinite(parsed)) {
      return { ok: false, message: '欄位型態需為 REAL' }
    }
    return { ok: true, value: parsed }
  }

  if (column.type === 'BOOLEAN') {
    if (typeof rawValue === 'boolean') {
      return { ok: true, value: rawValue }
    }
    if (rawValue === 1 || rawValue === '1' || rawValue === 'true') {
      return { ok: true, value: true }
    }
    if (rawValue === 0 || rawValue === '0' || rawValue === 'false') {
      return { ok: true, value: false }
    }
    return { ok: false, message: '欄位型態需為 BOOLEAN' }
  }

  if (column.type === 'DATE') {
    const normalized = normalizeDate(String(rawValue))
    if (!normalized) {
      return { ok: false, message: '欄位型態需為 DATE，格式為 YYYY-MM-DD' }
    }
    return { ok: true, value: normalized }
  }

  if (column.type === 'DATETIME') {
    const normalized = normalizeDateTime(String(rawValue))
    if (!normalized) {
      return { ok: false, message: '欄位型態需為 DATETIME，格式為 YYYY-MM-DD HH:mm:ss' }
    }
    return { ok: true, value: normalized }
  }

  if (typeof rawValue === 'string') {
    return { ok: true, value: rawValue }
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return { ok: true, value: String(rawValue) }
  }

  return { ok: false, message: '欄位型態需為 TEXT' }
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`

const getPrimaryKeyColumn = (table: SqlPracticeTableSchema) =>
  table.columns.find((column) => column.primaryKey) ?? null

export const getDefaultValueForColumn = (column: SqlPracticeColumnSchema): SqlPracticePrimitive => {
  if (column.nullable) {
    return null
  }

  if (column.type === 'INTEGER' || column.type === 'REAL') {
    return 0
  }
  if (column.type === 'BOOLEAN') {
    return false
  }
  if (column.type === 'DATE') {
    return '2026-03-20'
  }
  if (column.type === 'DATETIME') {
    return '2026-03-20 09:00:00'
  }
  return ''
}

const buildBlankRow = (table: SqlPracticeTableSchema): SqlPracticeRow =>
  Object.fromEntries(table.columns.map((column) => [column.name, getDefaultValueForColumn(column)]))

export const createDefaultSqlPracticeSchema = (): SqlPracticeSchema => ({
  master: {
    tableName: 'orders',
    columns: clone(DEFAULT_MASTER_COLUMNS),
  },
  detail: {
    tableName: 'order_items',
    columns: clone(DEFAULT_DETAIL_COLUMNS),
  },
})

export const createDefaultSqlPracticePayload = (): SqlPracticeImportPayload => ({
  meta: {
    version: 1,
    masterTable: 'orders',
    detailTable: 'order_items',
  },
  masterRows: clone(DEFAULT_MASTER_ROWS),
  detailRows: clone(DEFAULT_DETAIL_ROWS),
})

export const createSqlPracticeTemplate = (schema: SqlPracticeSchema): SqlPracticeImportPayload => ({
  meta: {
    version: 1,
    masterTable: schema.master.tableName,
    detailTable: schema.detail.tableName,
  },
  masterRows: [buildBlankRow(schema.master)],
  detailRows: [buildBlankRow(schema.detail)],
})

export const reconcileSqlPracticePayload = (
  schema: SqlPracticeSchema,
  payload: SqlPracticeImportPayload,
): SqlPracticeImportPayload => {
  const reconcileRows = (table: SqlPracticeTableSchema, rows: SqlPracticeRow[]): SqlPracticeRow[] =>
    rows.map((row) =>
      Object.fromEntries(
        table.columns.map((column) => {
          const normalizedValue = normalizeValue(column, row[column.name])
          if (normalizedValue.ok) {
            return [column.name, normalizedValue.value]
          }

          return [column.name, getDefaultValueForColumn(column)]
        }),
      ),
    )

  return {
    meta: {
      version: payload.meta.version,
      masterTable: schema.master.tableName,
      detailTable: schema.detail.tableName,
    },
    masterRows: reconcileRows(schema.master, payload.masterRows),
    detailRows: reconcileRows(schema.detail, payload.detailRows),
  }
}

export const validateSqlPracticeSchema = (schema: SqlPracticeSchema): SqlPracticeImportError[] => {
  const errors: SqlPracticeImportError[] = []
  const tableNames = [schema.master.tableName, schema.detail.tableName]

  if (!schema.master.tableName.trim()) {
    errors.push({ section: 'schema', rowIndex: null, field: 'master.tableName', message: 'Master table 名稱不可空白' })
  }
  if (!schema.detail.tableName.trim()) {
    errors.push({ section: 'schema', rowIndex: null, field: 'detail.tableName', message: 'Detail table 名稱不可空白' })
  }

  tableNames.forEach((tableName, index) => {
    if (tableName.trim() && !TABLE_NAME_PATTERN.test(tableName)) {
      errors.push({
        section: 'schema',
        rowIndex: null,
        field: index === 0 ? 'master.tableName' : 'detail.tableName',
        message: '資料表名稱僅可使用英文、數字與底線，且需以英文或底線開頭',
      })
    }
  })

  if (schema.master.tableName === schema.detail.tableName && schema.master.tableName.trim()) {
    errors.push({ section: 'schema', rowIndex: null, field: 'detail.tableName', message: 'Master 與 Detail table 名稱不可相同' })
  }

  ;(['master', 'detail'] as SqlPracticeTableKind[]).forEach((kind) => {
    const table = schema[kind]
    const seen = new Set<string>()
    const primaryKeyCount = table.columns.filter((column) => column.primaryKey).length

    if (table.columns.length === 0) {
      errors.push({ section: 'schema', rowIndex: null, field: `${kind}.columns`, message: `${kind === 'master' ? 'Master' : 'Detail'} table 至少需要一個欄位` })
    }

    if (primaryKeyCount !== 1) {
      errors.push({ section: 'schema', rowIndex: null, field: `${kind}.primaryKey`, message: `${kind === 'master' ? 'Master' : 'Detail'} table 需且僅需一個 primary key` })
    }

    table.columns.forEach((column, index) => {
      const fieldPath = `${kind}.columns.${index}.name`
      if (!column.name.trim()) {
        errors.push({ section: 'schema', rowIndex: null, field: fieldPath, message: '欄位名稱不可空白' })
        return
      }
      if (!TABLE_NAME_PATTERN.test(column.name)) {
        errors.push({ section: 'schema', rowIndex: null, field: fieldPath, message: '欄位名稱格式不正確' })
      }
      if (seen.has(column.name)) {
        errors.push({ section: 'schema', rowIndex: null, field: fieldPath, message: '同一資料表內欄位名稱不可重複' })
      }
      seen.add(column.name)
    })
  })

  const masterColumnNames = new Set(schema.master.columns.map((column) => column.name))
  schema.detail.columns.forEach((column, index) => {
    if (!column.foreignKeyColumn) {
      return
    }

    if (!masterColumnNames.has(column.foreignKeyColumn)) {
      errors.push({
        section: 'schema',
        rowIndex: null,
        field: `detail.columns.${index}.foreignKeyColumn`,
        message: 'Detail foreign key 必須指向 master 現有欄位',
      })
    }
  })

  return errors
}

const normalizeRows = (
  section: 'masterRows' | 'detailRows',
  rows: unknown,
  table: SqlPracticeTableSchema,
): { rows: SqlPracticeRow[]; errors: SqlPracticeImportError[] } => {
  if (!Array.isArray(rows)) {
    return {
      rows: [],
      errors: [{ section, rowIndex: null, field: null, message: `${section} 必須為陣列格式` }],
    }
  }

  const errors: SqlPracticeImportError[] = []
  const normalizedRows: SqlPracticeRow[] = []

  rows.forEach((row, rowIndex) => {
    if (!isPlainObject(row)) {
      errors.push({ section, rowIndex, field: null, message: '每筆資料都必須為 JSON object' })
      return
    }

    const normalizedRow: SqlPracticeRow = {}
    const rawKeys = new Set(Object.keys(row))

    table.columns.forEach((column) => {
      const normalizedValue = normalizeValue(column, row[column.name])
      if (!normalizedValue.ok) {
        errors.push({ section, rowIndex, field: column.name, message: normalizedValue.message })
        return
      }
      normalizedRow[column.name] = normalizedValue.value
      rawKeys.delete(column.name)
    })

    rawKeys.forEach((extraKey) => {
      errors.push({ section, rowIndex, field: extraKey, message: '存在 schema 未定義的欄位' })
    })

    normalizedRows.push(normalizedRow)
  })

  return { rows: normalizedRows, errors }
}

export const validateSqlPracticeImport = (
  schema: SqlPracticeSchema,
  payload: unknown,
): SqlPracticeValidationResult => {
  const schemaErrors = validateSqlPracticeSchema(schema)
  if (schemaErrors.length > 0) {
    return { ok: false, errors: schemaErrors, data: null }
  }

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: [{ section: 'meta', rowIndex: null, field: null, message: '匯入內容必須為 JSON object' }],
      data: null,
    }
  }

  const errors: SqlPracticeImportError[] = []
  const meta = payload.meta
  const metaRecord = isPlainObject(meta) ? meta : null
  if (!isPlainObject(meta)) {
    errors.push({ section: 'meta', rowIndex: null, field: null, message: '缺少 meta 設定' })
  } else {
    if (meta.masterTable !== schema.master.tableName) {
      errors.push({ section: 'meta', rowIndex: null, field: 'masterTable', message: 'meta.masterTable 與目前 master schema 不一致' })
    }
    if (meta.detailTable !== schema.detail.tableName) {
      errors.push({ section: 'meta', rowIndex: null, field: 'detailTable', message: 'meta.detailTable 與目前 detail schema 不一致' })
    }
  }

  const normalizedMaster = normalizeRows('masterRows', payload.masterRows, schema.master)
  const normalizedDetail = normalizeRows('detailRows', payload.detailRows, schema.detail)
  errors.push(...normalizedMaster.errors, ...normalizedDetail.errors)

  const masterPrimaryKey = getPrimaryKeyColumn(schema.master)
  const detailPrimaryKey = getPrimaryKeyColumn(schema.detail)

  if (masterPrimaryKey) {
    const seenMasterPrimaryKeys = new Set<string>()
    normalizedMaster.rows.forEach((row, rowIndex) => {
      const value = row[masterPrimaryKey.name]
      const key = JSON.stringify(value)
      if (seenMasterPrimaryKeys.has(key)) {
        errors.push({ section: 'masterRows', rowIndex, field: masterPrimaryKey.name, message: 'Master primary key 不可重複' })
      }
      seenMasterPrimaryKeys.add(key)
    })
  }

  if (detailPrimaryKey) {
    const seenDetailPrimaryKeys = new Set<string>()
    normalizedDetail.rows.forEach((row, rowIndex) => {
      const value = row[detailPrimaryKey.name]
      const key = JSON.stringify(value)
      if (seenDetailPrimaryKeys.has(key)) {
        errors.push({ section: 'detailRows', rowIndex, field: detailPrimaryKey.name, message: 'Detail primary key 不可重複' })
      }
      seenDetailPrimaryKeys.add(key)
    })
  }

  const masterPrimaryKeyValues = new Set<string>()
  if (masterPrimaryKey) {
    normalizedMaster.rows.forEach((row) => {
      masterPrimaryKeyValues.add(JSON.stringify(row[masterPrimaryKey.name]))
    })
  }

  schema.detail.columns.forEach((column) => {
    if (!column.foreignKeyColumn) {
      return
    }

    normalizedDetail.rows.forEach((row, rowIndex) => {
      const value = row[column.name]
      if (!masterPrimaryKeyValues.has(JSON.stringify(value))) {
        errors.push({ section: 'detailRows', rowIndex, field: column.name, message: 'Detail foreign key 找不到對應的 master 資料' })
      }
    })
  })

  if (errors.length > 0) {
    return { ok: false, errors, data: null }
  }

  return {
    ok: true,
    errors: [],
    data: {
      meta: {
        version: Number(metaRecord?.version ?? 1),
        masterTable: schema.master.tableName,
        detailTable: schema.detail.tableName,
      },
      masterRows: normalizedMaster.rows,
      detailRows: normalizedDetail.rows,
    },
  }
}

export const toSqlValue = (value: SqlPracticePrimitive): string | number | null => {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return value
}

export const createPracticeTableSql = (schema: SqlPracticeSchema): string[] => {
  const buildTableSql = (table: SqlPracticeTableSchema) => {
    const columnDefinitions = table.columns.map((column) => {
      const parts = [quoteIdentifier(column.name), column.type === 'BOOLEAN' ? 'INTEGER' : column.type === 'DATE' || column.type === 'DATETIME' ? 'TEXT' : column.type]
      if (!column.nullable) {
        parts.push('NOT NULL')
      }
      if (column.primaryKey) {
        parts.push('PRIMARY KEY')
      }
      if (column.foreignKeyColumn) {
        parts.push(`REFERENCES ${quoteIdentifier(schema.master.tableName)}(${quoteIdentifier(column.foreignKeyColumn)})`)
      }
      return parts.join(' ')
    })

    return `CREATE TABLE ${quoteIdentifier(table.tableName)} (${columnDefinitions.join(', ')});`
  }

  return [buildTableSql(schema.master), buildTableSql(schema.detail)]
}

export const createInsertSql = (table: SqlPracticeTableSchema) => {
  const columnSql = table.columns.map((column) => quoteIdentifier(column.name)).join(', ')
  const placeholderSql = table.columns.map(() => '?').join(', ')
  return `INSERT INTO ${quoteIdentifier(table.tableName)} (${columnSql}) VALUES (${placeholderSql});`
}

export const createEmptySqlPracticePayload = (schema: SqlPracticeSchema): SqlPracticeImportPayload => ({
  meta: {
    version: 1,
    masterTable: schema.master.tableName,
    detailTable: schema.detail.tableName,
  },
  masterRows: [],
  detailRows: [],
})
