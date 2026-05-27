<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as XLSX from 'xlsx'
import { toPng } from 'html-to-image'

interface PlannerTask {
  id: string
  name: string
  bucketId: string
  bucketName: string
  departments: string[]
  status: string
  priority: string
  assigneeId: string
  assignee: string
  createdById: string
  createdBy: string
  notes: string
  startDate: Date | null
  dueDate: Date | null
  completedDate: Date | null
  createdDate: Date | null
  checklistItems: PlannerChecklistItem[]
}

interface PlannerChecklistItem {
  id: string
  title: string
  completed: boolean
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  taskId: string
  mode: DragMode
  anchorX: number
  originalStart: Date
  originalEnd: Date
}

interface BucketOverviewRow {
  name: string
  totalDays: number
  minStart: Date
  maxFinish: Date
  leftPct: number
  widthPct: number
}

interface BucketCompletionStat {
  name: string
  taskCount: number
  completedCount: number
  avgProgressPct: number
}

interface TaskContributionStat {
  id: string
  name: string
  bucketName: string
  progressPct: number
  contributionPct: number
}

const isParsing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const overviewMessage = ref('')
const sourceFileName = ref('')
const overviewRef = ref<HTMLElement | null>(null)
const ganttCaptureRef = ref<HTMLElement | null>(null)

const tasks = ref<PlannerTask[]>([])
const collapsedBuckets = ref<Record<string, boolean>>({})
const selectedDepartmentTags = ref<string[]>([])
const bucketSortOrder = ref<Record<string, number>>({})

const dayWidth = ref(28)
const now = new Date()
const TASK_LABEL_WIDTH = 270
const OVERVIEW_BUCKET_COL_WIDTH = 180
const OVERVIEW_DAYS_COL_WIDTH = 80
const OVERVIEW_DATE_COL_WIDTH = 120

const activeDrag = ref<DragState | null>(null)
const selectedTaskId = ref('')
const isOverviewCollapsed = ref(false)
const isStatsCollapsed = ref(false)

const normalizeText = (value: unknown) => String(value ?? '').trim()

const createTaskId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const safeDate = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return safeDate(next)
}

const dayDiff = (a: Date, b: Date) => {
  const ms = safeDate(b).getTime() - safeDate(a).getTime()
  return Math.round(ms / 86400000)
}

const formatDate = (value: Date | null) => {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

const formatDateIso = (value: Date | null) => {
  if (!value) {
    return ''
  }

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateCell = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return safeDate(value)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return safeDate(new Date(parsed.y, parsed.m - 1, parsed.d))
    }
  }

  const text = normalizeText(value)
  if (text === '') {
    return null
  }

  const normalized = text.replace(/\./g, '-').replace(/\//g, '-')
  const parsedDate = new Date(normalized)
  if (!Number.isNaN(parsedDate.getTime())) {
    return safeDate(parsedDate)
  }

  return null
}

const parseChecklistCompleted = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  const text = normalizeText(value).toLowerCase()
  if (text === '') {
    return false
  }

  return ['true', 'yes', 'y', '1', 'done', 'complete', '已完成', '完成', '是'].some((keyword) => text.includes(keyword))
}

const splitChecklistText = (value: string) => {
  return value
    .split(/\r?\n|;|；|、/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

const splitDepartmentText = (value: string) => {
  return value
    .split(/\r?\n|;|；|、|,|，|\||\//)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

const splitUserText = (value: string) => {
  return value
    .split(/\r?\n|;|；|、|,|，|\||\//)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

const dedupeTexts = (values: string[]) => Array.from(new Set(values.map((item) => item.trim()).filter((item) => item !== '')))

const canonicalUserKey = (value: string) => value.replace(/[{}]/g, '').trim()

const addUserNameMapping = (map: Map<string, string>, id: string, name: string) => {
  const normalizedId = normalizeText(id)
  const normalizedName = normalizeText(name)

  if (!normalizedId || !normalizedName) {
    return
  }

  map.set(normalizedId, normalizedName)

  const canonicalId = canonicalUserKey(normalizedId)
  if (canonicalId) {
    map.set(canonicalId, normalizedName)
  }
}

const resolveUserDisplayName = (raw: string, userNameMap: Map<string, string>) => {
  const tokens = splitUserText(raw)
  if (tokens.length === 0) {
    return normalizeText(raw)
  }

  const names = tokens.map((token) => {
    const normalized = normalizeText(token)
    return userNameMap.get(normalized) ?? userNameMap.get(canonicalUserKey(normalized)) ?? normalized
  })

  return dedupeTexts(names).join('、')
}

const isDepartmentHeader = (header: unknown) => {
  const normalized = normalizeText(header).toLowerCase().replace(/\s+/g, '')
  if (!normalized) {
    return false
  }

  return /標籤|标签|部門|部门|歸屬部門|所属部门|department|tag|label/.test(normalized)
}

const getDepartmentColumnIndexes = (headerRow: unknown[]) => {
  const indexes: number[] = []

  headerRow.forEach((header, index) => {
    if (isDepartmentHeader(header)) {
      indexes.push(index)
    }
  })

  return indexes
}

const parseDepartmentTagsFromRow = (row: unknown[], headerMap: Map<string, number>, departmentColumnIndexes: number[]) => {
  const values: string[] = []

  for (const index of departmentColumnIndexes) {
    values.push(...splitDepartmentText(normalizeText(row[index] ?? '')))
  }

  if (values.length === 0) {
    const fallback = [
      '部門標籤',
      '標籤',
      'Tag',
      'Tags',
      'Label',
      'Labels',
      '部門',
      '歸屬部門',
      'Department',
      'Departments',
    ]

    values.push(...splitDepartmentText(normalizeText(readCellByCandidates(row, headerMap, fallback))))
  }

  return dedupeTexts(values)
}

const normalizeStatus = (status: string) => status.replace(/\s+/g, '')

const getTaskStart = (task: PlannerTask): Date => {
  if (task.startDate) {
    return task.startDate
  }

  if (task.dueDate) {
    return addDays(task.dueDate, -1)
  }

  if (task.completedDate) {
    return task.completedDate
  }

  if (task.createdDate) {
    return task.createdDate
  }

  return safeDate(now)
}

const getTaskEnd = (task: PlannerTask): Date => {
  if (task.completedDate) {
    return task.completedDate
  }

  if (task.dueDate) {
    return task.dueDate
  }

  if (task.startDate) {
    return task.startDate
  }

  if (task.createdDate) {
    return task.createdDate
  }

  return safeDate(now)
}

const getTaskFinish = (task: PlannerTask): Date => {
  if (task.completedDate) {
    return task.completedDate
  }

  return getTaskEnd(task)
}

const ensureTaskDates = (task: PlannerTask) => {
  const start = getTaskStart(task)
  const end = getTaskEnd(task)
  if (dayDiff(start, end) >= 0) {
    return { start, end }
  }

  return { start, end: start }
}

const toHeaderIndex = (headerRow: unknown[]) => {
  const indexMap = new Map<string, number>()

  headerRow.forEach((header, index) => {
    const key = normalizeText(header)
    if (key !== '' && !indexMap.has(key)) {
      indexMap.set(key, index)
    }
  })

  return indexMap
}

const readCell = (row: unknown[], map: Map<string, number>, key: string) => {
  const index = map.get(key)
  if (index === undefined) {
    return ''
  }

  return row[index] ?? ''
}

const readCellByCandidates = (row: unknown[], map: Map<string, number>, keys: string[]) => {
  for (const key of keys) {
    if (map.has(key)) {
      return readCell(row, map, key)
    }
  }

  return ''
}

const parseChecklistSheet = (workbook: XLSX.WorkBook) => {
  const checklistSheetName = workbook.SheetNames.find((name) => name.includes('檢查清單'))
    ?? workbook.SheetNames.find((name) => name.toLowerCase().includes('checklist'))

  const checklistMap = new Map<string, PlannerChecklistItem[]>()
  if (!checklistSheetName) {
    return checklistMap
  }

  const checklistSheet = workbook.Sheets[checklistSheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(checklistSheet, {
    header: 1,
    blankrows: false,
    raw: true,
    defval: '',
  })

  if (!Array.isArray(matrix) || matrix.length < 2) {
    return checklistMap
  }

  const [headerRow, ...rows] = matrix
  if (!Array.isArray(headerRow)) {
    return checklistMap
  }

  const headerMap = toHeaderIndex(headerRow)
  const taskIdKeys = ['工作識別碼', '工作ID', '工作 Id', 'Task ID', 'Task Id']
  const titleKeys = ['標題', '名稱', '檢查清單項目', 'Checklist Item', 'Checklist Title']
  const completedKeys = ['已完成', '完成', '狀態', 'Completed', 'Is Completed']

  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue
    }

    const taskId = normalizeText(readCellByCandidates(row, headerMap, taskIdKeys))
    if (!taskId) {
      continue
    }

    const title = normalizeText(readCellByCandidates(row, headerMap, titleKeys)) || '(未命名檢查項目)'
    const completed = parseChecklistCompleted(readCellByCandidates(row, headerMap, completedKeys))

    const item: PlannerChecklistItem = {
      id: createTaskId(),
      title,
      completed,
    }

    if (!checklistMap.has(taskId)) {
      checklistMap.set(taskId, [])
    }

    checklistMap.get(taskId)?.push(item)
  }

  return checklistMap
}

const parsePlannerWorkbook = (workbook: XLSX.WorkBook) => {
  const worksheetName = workbook.SheetNames.find((name) => name === '工作')
    ?? workbook.SheetNames.find((name) => name === '合併資料')

  if (!worksheetName) {
    throw new Error('找不到「工作」或「合併資料」工作表，請確認是 Microsoft Planner 匯出格式。')
  }

  const worksheet = workbook.Sheets[worksheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
    raw: true,
    defval: '',
  })

  if (!Array.isArray(matrix) || matrix.length < 2) {
    throw new Error('工作表資料不足，至少需要標題列與一筆工作資料。')
  }

  const [headerRow, ...rows] = matrix
  if (!Array.isArray(headerRow)) {
    throw new Error('找不到有效的欄位標題列。')
  }

  const headerMap = toHeaderIndex(headerRow)
  const departmentColumnIndexes = getDepartmentColumnIndexes(headerRow)
  const checklistMap = parseChecklistSheet(workbook)

  const requiredKeys = ['工作識別碼', '工作名稱', '貯體', '狀態', '到期日', '開始日期']
  const missingKeys = requiredKeys.filter((key) => !headerMap.has(key))
  if (missingKeys.length > 0) {
    throw new Error(`缺少必要欄位：${missingKeys.join('、')}`)
  }

  const bucketNameMap = new Map<string, string>()
  const nextBucketSortOrder: Record<string, number> = {}
  let bucketOrderIndex = 0
  const bucketSheet = workbook.Sheets['貯體']
  if (bucketSheet) {
    const bucketRows = XLSX.utils.sheet_to_json<unknown[]>(bucketSheet, {
      header: 1,
      blankrows: false,
      raw: true,
      defval: '',
    })

    const [, ...body] = bucketRows
    for (const row of body) {
      if (!Array.isArray(row)) {
        continue
      }

      const id = normalizeText(row[0])
      const name = normalizeText(row[1])
      if (id && name) {
        bucketNameMap.set(id, name)
        if (nextBucketSortOrder[name] === undefined) {
          nextBucketSortOrder[name] = bucketOrderIndex
          bucketOrderIndex += 1
        }
      }
    }
  }

  const userNameMap = new Map<string, string>()
  const userSheet = workbook.Sheets['使用者']
  if (userSheet) {
    const userRows = XLSX.utils.sheet_to_json<unknown[]>(userSheet, {
      header: 1,
      blankrows: false,
      raw: true,
      defval: '',
    })

    const [userHeader, ...body] = userRows
    const userHeaderMap = Array.isArray(userHeader) ? toHeaderIndex(userHeader) : new Map<string, number>()
    const userIdKeys = ['使用者識別碼', '使用者ID', '識別碼', 'ID', 'Id', 'User ID', 'User Id', 'Object ID', 'Aad Object Id']
    const userNameKeys = ['使用者名稱', '顯示名稱', '名稱', 'Name', 'Display Name']

    for (const row of body) {
      if (!Array.isArray(row)) {
        continue
      }

      const id = normalizeText(readCellByCandidates(row, userHeaderMap, userIdKeys)) || normalizeText(row[0])
      const name = normalizeText(readCellByCandidates(row, userHeaderMap, userNameKeys)) || normalizeText(row[1])
      if (id && name) {
        addUserNameMapping(userNameMap, id, name)
      }

      if (name) {
        userNameMap.set(name, name)
      }
    }
  }

  const parsedTasks: PlannerTask[] = rows
    .filter((row) => Array.isArray(row) && row.some((cell) => normalizeText(cell) !== ''))
    .map((row) => {
      const sourceTaskId = normalizeText(readCell(row, headerMap, '工作識別碼'))
      const name = normalizeText(readCell(row, headerMap, '工作名稱'))
      const bucketRaw = normalizeText(readCell(row, headerMap, '貯體'))
      const departments = parseDepartmentTagsFromRow(row, headerMap, departmentColumnIndexes)
      const status = normalizeText(readCell(row, headerMap, '狀態'))
      const priority = normalizeText(readCell(row, headerMap, '優先順序'))
      const assigneeRaw = normalizeText(readCell(row, headerMap, '指派至'))
      const createdByRaw = normalizeText(readCell(row, headerMap, '建立者'))
      const notes = normalizeText(readCell(row, headerMap, '記事'))
      const checklistRaw = normalizeText(readCell(row, headerMap, '檢查清單項目'))
      const startDate = parseDateCell(readCell(row, headerMap, '開始日期'))
      const dueDate = parseDateCell(readCell(row, headerMap, '到期日'))
      const completedDate = parseDateCell(readCell(row, headerMap, '完成日期'))
      const createdDate = parseDateCell(readCell(row, headerMap, '建立日期'))
      const checklistFromRow = splitChecklistText(checklistRaw).map((title) => ({
        id: createTaskId(),
        title,
        completed: false,
      }))
      const checklistItems = checklistMap.get(sourceTaskId) ?? checklistFromRow

      return {
        id: sourceTaskId || createTaskId(),
        name: name || '(未命名工作)',
        bucketId: bucketRaw,
        bucketName: bucketNameMap.get(bucketRaw) ?? bucketRaw ?? '未分類',
        departments,
        status,
        priority,
        assigneeId: assigneeRaw,
        assignee: resolveUserDisplayName(assigneeRaw, userNameMap),
        createdById: createdByRaw,
        createdBy: resolveUserDisplayName(createdByRaw, userNameMap),
        notes,
        startDate,
        dueDate,
        completedDate,
        createdDate,
        checklistItems,
      }
    })

  if (parsedTasks.length === 0) {
    throw new Error('沒有找到可顯示的工作資料。')
  }

  for (const task of parsedTasks) {
    const bucketName = task.bucketName || '未分類'
    if (nextBucketSortOrder[bucketName] === undefined) {
      nextBucketSortOrder[bucketName] = bucketOrderIndex
      bucketOrderIndex += 1
    }
  }

  tasks.value = parsedTasks
  bucketSortOrder.value = nextBucketSortOrder
  selectedDepartmentTags.value = dedupeTexts(parsedTasks.flatMap((task) => task.departments)).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  collapsedBuckets.value = {}
  selectedTaskId.value = parsedTasks[0].id
}

const handleFileImport = async (event: Event) => {
  errorMessage.value = ''
  successMessage.value = ''

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  sourceFileName.value = file.name
  isParsing.value = true

  try {
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    if (isCsv) {
      throw new Error('請上傳 Microsoft Planner 的 .xlsx 匯出檔案。')
    }

    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { type: 'array', cellDates: true })
    parsePlannerWorkbook(workbook)
    successMessage.value = `已成功匯入 ${tasks.value.length} 筆工作。`
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = '匯入失敗，請確認檔案格式是否正確。'
    }
  } finally {
    isParsing.value = false
    input.value = ''
  }
}

const allDepartmentTags = computed(() => {
  return dedupeTexts(tasks.value.flatMap((task) => task.departments)).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
})

const selectedDepartmentTagSet = computed(() => new Set(selectedDepartmentTags.value))

const filteredTasks = computed(() => {
  if (allDepartmentTags.value.length === 0) {
    return tasks.value
  }

  if (selectedDepartmentTags.value.length === 0) {
    return []
  }

  if (selectedDepartmentTags.value.length === allDepartmentTags.value.length) {
    return tasks.value
  }

  return tasks.value.filter((task) => task.departments.some((tag) => selectedDepartmentTagSet.value.has(tag)))
})

const groupedTasks = computed(() => {
  const groups = new Map<string, PlannerTask[]>()

  for (const task of filteredTasks.value) {
    const bucketName = task.bucketName || '未分類'
    if (!groups.has(bucketName)) {
      groups.set(bucketName, [])
    }

    groups.get(bucketName)?.push(task)
  }

  return Array.from(groups.entries())
    .sort(([aName], [bName]) => {
      const aOrder = bucketSortOrder.value[aName]
      const bOrder = bucketSortOrder.value[bName]
      const hasAOrder = aOrder !== undefined
      const hasBOrder = bOrder !== undefined

      if (hasAOrder && hasBOrder) {
        return aOrder - bOrder
      }

      if (hasAOrder) {
        return -1
      }

      if (hasBOrder) {
        return 1
      }

      return aName.localeCompare(bName, 'zh-Hant')
    })
    .map(([bucketName, items]) => ({
      bucketName,
      items: items.sort((a, b) => {
        const startDiff = getTaskStart(a).getTime() - getTaskStart(b).getTime()
        if (startDiff !== 0) {
          return startDiff
        }

        const endDiff = getTaskEnd(a).getTime() - getTaskEnd(b).getTime()
        if (endDiff !== 0) {
          return endDiff
        }

        return a.name.localeCompare(b.name, 'zh-Hant')
      }),
    }))
})

const visibleTasks = computed(() => {
  const rows: PlannerTask[] = []

  for (const group of groupedTasks.value) {
    if (collapsedBuckets.value[group.bucketName]) {
      continue
    }

    rows.push(...group.items)
  }

  return rows
})

const displayedTagSummary = computed(() => {
  const allCount = allDepartmentTags.value.length
  const selectedCount = selectedDepartmentTags.value.length

  if (allCount === 0) {
    return '未偵測到部門標籤，甘特圖顯示全部任務。'
  }

  if (selectedCount === 0) {
    return '目前未選擇任何標籤，甘特圖不顯示任務。'
  }

  if (selectedCount === allCount) {
    return `目前顯示全部標籤任務（${allCount} 個標籤）。`
  }

  return `目前顯示 ${selectedCount}/${allCount} 個標籤任務：${selectedDepartmentTags.value.join('、')}`
})

const selectedTagDropdownLabel = computed(() => {
  const allCount = allDepartmentTags.value.length
  const selectedCount = selectedDepartmentTags.value.length

  if (allCount === 0) {
    return '未偵測到標籤'
  }

  if (selectedCount === 0) {
    return '未選擇標籤'
  }

  if (selectedCount === allCount) {
    return `全部標籤（${allCount}）`
  }

  return `已選 ${selectedCount}/${allCount}`
})

const isTagSelected = (tag: string) => selectedDepartmentTagSet.value.has(tag)

const toggleDepartmentTag = (tag: string) => {
  if (isTagSelected(tag)) {
    selectedDepartmentTags.value = selectedDepartmentTags.value.filter((item) => item !== tag)
    return
  }

  selectedDepartmentTags.value = [...selectedDepartmentTags.value, tag].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

const selectAllDepartmentTags = () => {
  selectedDepartmentTags.value = [...allDepartmentTags.value]
}

const clearDepartmentTags = () => {
  selectedDepartmentTags.value = []
}

watch([filteredTasks, selectedTaskId], ([currentFiltered, currentSelectedId]) => {
  if (currentFiltered.length === 0) {
    selectedTaskId.value = ''
    return
  }

  const hasSelected = currentFiltered.some((task) => task.id === currentSelectedId)
  if (!hasSelected) {
    selectedTaskId.value = currentFiltered[0].id
  }
}, { immediate: true })

const timelineStart = computed(() => {
  if (tasks.value.length === 0) {
    return addDays(safeDate(now), -3)
  }

  let min = ensureTaskDates(tasks.value[0]).start
  for (const task of tasks.value) {
    const current = ensureTaskDates(task).start
    if (current < min) {
      min = current
    }
  }

  return addDays(min, -2)
})

const timelineEnd = computed(() => {
  if (tasks.value.length === 0) {
    return addDays(safeDate(now), 7)
  }

  let max = ensureTaskDates(tasks.value[0]).end
  for (const task of tasks.value) {
    const current = ensureTaskDates(task).end
    if (current > max) {
      max = current
    }
  }

  return addDays(max, 2)
})

const totalDays = computed(() => dayDiff(timelineStart.value, timelineEnd.value) + 1)

const timelineDays = computed(() => {
  const items: Date[] = []
  for (let i = 0; i < totalDays.value; i++) {
    items.push(addDays(timelineStart.value, i))
  }

  return items
})

const monthSegments = computed(() => {
  const segments: Array<{ label: string; length: number }> = []

  for (const date of timelineDays.value) {
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const last = segments[segments.length - 1]

    if (last && last.label === label) {
      last.length += 1
    } else {
      segments.push({ label, length: 1 })
    }
  }

  return segments
})

const chartWidth = computed(() => totalDays.value * dayWidth.value)
const timelineTotalWidth = computed(() => TASK_LABEL_WIDTH + chartWidth.value)
const timelineRenderWidth = computed(() => `max(${timelineTotalWidth.value}px, 100%)`)

const isTaskCompleted = (task: PlannerTask) => {
  const normalized = normalizeStatus(task.status)
  return normalized.includes('完成') || task.completedDate !== null
}

const getTaskProgressPct = (task: PlannerTask) => {
  if (isTaskCompleted(task)) {
    return 100
  }

  const total = task.checklistItems.length
  if (total > 0) {
    const completed = task.checklistItems.filter((item) => item.completed).length
    return Math.round((completed / total) * 100)
  }

  const normalized = normalizeStatus(task.status)
  if (normalized.includes('進行中')) {
    return 50
  }

  return 0
}

const dashboardMetrics = computed(() => {
  const today = safeDate(new Date())
  const soonDate = addDays(today, 7)

  let completed = 0
  let incomplete = 0
  let dueSoon = 0

  for (const task of tasks.value) {
    const completedFlag = isTaskCompleted(task)
    if (completedFlag) {
      completed += 1
    } else {
      incomplete += 1
      if (task.dueDate && task.dueDate >= today && task.dueDate <= soonDate) {
        dueSoon += 1
      }
    }
  }

  return {
    completed,
    incomplete,
    dueSoon,
  }
})

const overallCompletionRate = computed(() => {
  if (tasks.value.length === 0) {
    return 0
  }

  const progressSum = tasks.value.reduce((sum, task) => sum + getTaskProgressPct(task), 0)
  return Math.round((progressSum / (tasks.value.length * 100)) * 100)
})

const progressDistribution = computed(() => {
  let done = 0
  let inProgress = 0
  let notStarted = 0

  for (const task of tasks.value) {
    const progress = getTaskProgressPct(task)
    if (progress >= 100) {
      done += 1
    } else if (progress > 0) {
      inProgress += 1
    } else {
      notStarted += 1
    }
  }

  return { done, inProgress, notStarted }
})

const bucketCompletionRates = computed<BucketCompletionStat[]>(() => {
  const bucketMap = new Map<string, PlannerTask[]>()

  for (const task of tasks.value) {
    const key = task.bucketName || '未分類'
    if (!bucketMap.has(key)) {
      bucketMap.set(key, [])
    }

    bucketMap.get(key)?.push(task)
  }

  return Array.from(bucketMap.entries())
    .map(([name, items]) => {
      const taskCount = items.length
      const completedCount = items.filter((task) => isTaskCompleted(task)).length
      const progressSum = items.reduce((sum, task) => sum + getTaskProgressPct(task), 0)
      const avgProgressPct = taskCount === 0 ? 0 : Math.round(progressSum / taskCount)

      return {
        name,
        taskCount,
        completedCount,
        avgProgressPct,
      }
    })
    .sort((a, b) => {
      if (b.avgProgressPct !== a.avgProgressPct) {
        return b.avgProgressPct - a.avgProgressPct
      }

      return b.taskCount - a.taskCount
    })
})

const taskContributionRates = computed<TaskContributionStat[]>(() => {
  const items = tasks.value.map((task) => ({
    id: task.id,
    name: task.name,
    bucketName: task.bucketName || '未分類',
    progressPct: getTaskProgressPct(task),
  }))

  const bucketProgressTotalMap = new Map<string, number>()
  for (const item of items) {
    const current = bucketProgressTotalMap.get(item.bucketName) ?? 0
    bucketProgressTotalMap.set(item.bucketName, current + item.progressPct)
  }

  return items
    .map((item) => ({
      ...item,
      contributionPct: (bucketProgressTotalMap.get(item.bucketName) ?? 0) > 0
        ? Number(((item.progressPct / (bucketProgressTotalMap.get(item.bucketName) ?? 0)) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => {
      const bucketCompare = a.bucketName.localeCompare(b.bucketName, 'zh-Hant')
      if (bucketCompare !== 0) {
        return bucketCompare
      }

      if (b.contributionPct !== a.contributionPct) {
        return b.contributionPct - a.contributionPct
      }

      return a.name.localeCompare(b.name, 'zh-Hant')
    })
})

const contributionBarWidth = (contributionPct: number) => {
  if (contributionPct <= 0) {
    return '0%'
  }

  return `${Math.max(contributionPct, 2)}%`
}

const overviewRange = computed(() => {
  if (groupedTasks.value.length === 0 || groupedTasks.value[0].items.length === 0) {
    return null
  }

  let minStart = getTaskStart(groupedTasks.value[0].items[0])
  let maxFinish = getTaskFinish(groupedTasks.value[0].items[0])

  for (const group of groupedTasks.value) {
    for (const task of group.items) {
      const start = getTaskStart(task)
      const finish = getTaskFinish(task)

      if (start < minStart) {
        minStart = start
      }

      if (finish > maxFinish) {
        maxFinish = finish
      }
    }
  }

  return {
    start: minStart,
    finish: maxFinish,
    totalDays: Math.max(1, dayDiff(minStart, maxFinish) + 1),
  }
})

const overviewRangeLabel = computed(() => {
  if (!overviewRange.value) {
    return '-'
  }

  return `${formatDate(overviewRange.value.start)} ~ ${formatDate(overviewRange.value.finish)}`
})

const overviewGridTemplateColumns = computed(() => {
  return `${OVERVIEW_BUCKET_COL_WIDTH}px ${OVERVIEW_DAYS_COL_WIDTH}px ${OVERVIEW_DATE_COL_WIDTH}px ${OVERVIEW_DATE_COL_WIDTH}px minmax(360px, 1fr)`
})

const overviewTimelineDays = computed(() => {
  if (!overviewRange.value) {
    return [] as Date[]
  }

  const days: Date[] = []
  for (let i = 0; i < overviewRange.value.totalDays; i++) {
    days.push(addDays(overviewRange.value.start, i))
  }

  return days
})

const overviewMonthSegments = computed(() => {
  const range = overviewRange.value
  if (!range) {
    return [] as Array<{ label: string; length: number; widthPct: number }>
  }

  const segments: Array<{ label: string; length: number; widthPct: number }> = []

  for (const date of overviewTimelineDays.value) {
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const last = segments[segments.length - 1]

    if (last && last.label === label) {
      last.length += 1
      last.widthPct = (last.length / range.totalDays) * 100
    } else {
      segments.push({ label, length: 1, widthPct: (1 / range.totalDays) * 100 })
    }
  }

  return segments
})

const bucketOverviewRows = computed<BucketOverviewRow[]>(() => {
  const range = overviewRange.value
  if (!range) {
    return []
  }

  return groupedTasks.value
    .map((group) => {
      const firstTask = group.items[0]
      if (!firstTask) {
        return null
      }

      let minStart = getTaskStart(firstTask)
      let maxFinish = getTaskFinish(firstTask)

      for (const task of group.items) {
        const start = getTaskStart(task)
        const finish = getTaskFinish(task)

        if (start < minStart) {
          minStart = start
        }

        if (finish > maxFinish) {
          maxFinish = finish
        }
      }

      const totalDays = Math.max(1, dayDiff(minStart, maxFinish) + 1)
      const leftPct = (dayDiff(range.start, minStart) / range.totalDays) * 100
      const widthPct = Math.max((1 / range.totalDays) * 100, (totalDays / range.totalDays) * 100)

      return {
        name: group.bucketName,
        totalDays,
        minStart,
        maxFinish,
        leftPct,
        widthPct,
      }
    })
    .filter((row): row is BucketOverviewRow => row !== null)
    .sort((a, b) => a.minStart.getTime() - b.minStart.getTime())
})

const createOverviewImageDataUrl = async () => {
  if (!overviewRef.value) {
    throw new Error('找不到 Overview 區塊。')
  }

  return toPng(overviewRef.value, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
  })
}

const createCurrentViewImageDataUrl = async () => {
  if (!ganttCaptureRef.value) {
    throw new Error('找不到甘特圖區塊。')
  }

  const captureWidth = ganttCaptureRef.value.scrollWidth
  const captureHeight = ganttCaptureRef.value.scrollHeight

  return toPng(ganttCaptureRef.value, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
    width: captureWidth,
    height: captureHeight,
    canvasWidth: captureWidth,
    canvasHeight: captureHeight,
    style: {
      width: `${captureWidth}px`,
      height: `${captureHeight}px`,
      overflow: 'visible',
    },
  })
}

const writeImageToClipboard = async (dataUrl: string) => {
  if (
    typeof navigator === 'undefined'
    || !navigator.clipboard
    || typeof ClipboardItem === 'undefined'
    || !navigator.clipboard.write
  ) {
    return false
  }

  const blob = await (await fetch(dataUrl)).blob()
  const clipboardItem = new ClipboardItem({ [blob.type]: blob })
  await navigator.clipboard.write([clipboardItem])
  return true
}

const downloadOverviewImage = (dataUrl: string) => {
  const link = document.createElement('a')
  const dateTag = new Date().toISOString().slice(0, 10)
  link.href = dataUrl
  link.download = `planner-overview-${dateTag}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const exportGanttWorkbook = () => {
  overviewMessage.value = ''

  if (tasks.value.length === 0) {
    overviewMessage.value = '目前沒有資料可匯出甘特圖 Excel。'
    return
  }

  try {
    const workbook = XLSX.utils.book_new()
    const visibleTaskIdSet = new Set(filteredTasks.value.map((task) => task.id))
    const rows = tasks.value.map((task, index) => {
      const { start, end } = ensureTaskDates(task)
      const finish = getTaskFinish(task)
      const checklistTotal = task.checklistItems.length
      const checklistCompleted = task.checklistItems.filter((item) => item.completed).length

      return {
        工作名稱: task.name,
        排序: index + 1,
        貯體: task.bucketName,
        貯體識別碼: task.bucketId,
        起始日: formatDateIso(start),
        結束日: formatDateIso(end),
        完成日: formatDateIso(finish),
        工期天數: Math.max(1, dayDiff(start, end) + 1),
        狀態: task.status,
        優先順序: task.priority,
        進度百分比: getTaskProgressPct(task),
        是否完成: isTaskCompleted(task) ? '是' : '否',
        指派人: task.assignee,
        指派人識別碼: task.assigneeId,
        建立者: task.createdBy,
        建立者識別碼: task.createdById,
        部門標籤: task.departments.join('、'),
        檢查清單總數: checklistTotal,
        檢查清單已完成: checklistCompleted,
        檢查清單項目: task.checklistItems.map((item) => `${item.completed ? '☑' : '☐'} ${item.title}`).join(' | '),
        備註: task.notes,
        目前篩選是否顯示: visibleTaskIdSet.has(task.id) ? '是' : '否',
        匯出時間UTC: new Date().toISOString(),
        來源檔名: sourceFileName.value || '',
      }
    })

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'GanttFlat')

    const dateTag = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `planner-gantt-flat-${dateTag}.xlsx`)
    overviewMessage.value = '單頁甘特圖 Excel 已匯出，可直接用樞紐分析。'
  } catch (error) {
    if (error instanceof Error) {
      overviewMessage.value = `匯出甘特圖 Excel 失敗：${error.message}`
    } else {
      overviewMessage.value = '匯出甘特圖 Excel 失敗，請再試一次。'
    }
  }
}

const copyOverviewToClipboard = async () => {
  overviewMessage.value = ''

  if (tasks.value.length === 0) {
    overviewMessage.value = '目前沒有資料可匯出 Overview。'
    return
  }

  try {
    const dataUrl = await createOverviewImageDataUrl()

    if (await writeImageToClipboard(dataUrl)) {
      overviewMessage.value = 'Overview 已複製，請直接貼到 PPT。'
      return
    }

    downloadOverviewImage(dataUrl)
    overviewMessage.value = '目前環境不支援剪貼簿圖片，已改為下載 PNG。'
  } catch (error) {
    if (error instanceof Error) {
      overviewMessage.value = `匯出失敗：${error.message}`
    } else {
      overviewMessage.value = '匯出失敗，請再試一次。'
    }
  }
}

const copyCurrentViewToClipboard = async () => {
  overviewMessage.value = ''

  if (tasks.value.length === 0) {
    overviewMessage.value = '目前沒有資料可複製甘特圖。'
    return
  }

  try {
    const dataUrl = await createCurrentViewImageDataUrl()

    if (await writeImageToClipboard(dataUrl)) {
      overviewMessage.value = '甘特圖已複製，可直接貼到 PPT。'
      return
    }

    downloadOverviewImage(dataUrl)
    overviewMessage.value = '目前環境不支援剪貼簿圖片，已改為下載甘特圖 PNG。'
  } catch (error) {
    if (error instanceof Error) {
      overviewMessage.value = `甘特圖複製失敗：${error.message}`
    } else {
      overviewMessage.value = '甘特圖複製失敗，請再試一次。'
    }
  }
}

const downloadOverviewAsPng = async () => {
  overviewMessage.value = ''

  if (tasks.value.length === 0) {
    overviewMessage.value = '目前沒有資料可下載 Overview。'
    return
  }

  try {
    const dataUrl = await createOverviewImageDataUrl()
    downloadOverviewImage(dataUrl)
    overviewMessage.value = 'Overview PNG 已下載，可直接插入 PPT。'
  } catch (error) {
    if (error instanceof Error) {
      overviewMessage.value = `下載失敗：${error.message}`
    } else {
      overviewMessage.value = '下載失敗，請再試一次。'
    }
  }
}

const todayOffset = computed(() => {
  const today = safeDate(now)
  const offset = dayDiff(timelineStart.value, today) * dayWidth.value
  return Math.max(0, Math.min(chartWidth.value, offset))
})

const taskBarStyle = (task: PlannerTask) => {
  const { start, end } = ensureTaskDates(task)
  const leftDays = dayDiff(timelineStart.value, start)
  const duration = Math.max(1, dayDiff(start, end) + 1)

  return {
    left: `${leftDays * dayWidth.value}px`,
    width: `${duration * dayWidth.value}px`,
  }
}

const taskTrackStyle = computed(() => ({
  width: `max(${chartWidth.value}px, calc(100% - ${TASK_LABEL_WIDTH}px))`,
  backgroundImage:
    'repeating-linear-gradient(to right, rgba(148, 163, 184, 0.24) 0 1px, transparent 1px var(--day-width))',
  backgroundSize: 'auto 100%',
  ['--day-width' as string]: `${dayWidth.value}px`,
}))

const rowStyle = computed(() => ({
  width: timelineRenderWidth.value,
}))

const groupRowStyle = computed(() => ({
  width: timelineRenderWidth.value,
  backgroundImage: `linear-gradient(to right, #f8fafc ${TASK_LABEL_WIDTH}px, #f1f5f9 ${TASK_LABEL_WIDTH}px)`,
  backgroundSize: `${timelineRenderWidth.value} 100%`,
}))

const barClass = (task: PlannerTask) => {
  const normalized = normalizeStatus(task.status)
  if (normalized.includes('完成')) {
    return 'bar-done'
  }

  if (normalized.includes('進行中')) {
    return 'bar-progress'
  }

  return 'bar-todo'
}

const toggleBucket = (bucketName: string) => {
  collapsedBuckets.value[bucketName] = !collapsedBuckets.value[bucketName]
}

const updateTaskDates = (taskId: string, nextStart: Date, nextEnd: Date) => {
  const index = tasks.value.findIndex((task) => task.id === taskId)
  if (index < 0) {
    return
  }

  const task = tasks.value[index]

  tasks.value[index] = {
    ...task,
    startDate: safeDate(nextStart),
    dueDate: safeDate(nextEnd),
    completedDate:
      task.completedDate && task.completedDate > nextEnd
        ? safeDate(nextEnd)
        : task.completedDate,
  }
}

const beginDrag = (event: MouseEvent, task: PlannerTask, mode: DragMode) => {
  event.preventDefault()
  event.stopPropagation()

  const { start, end } = ensureTaskDates(task)
  activeDrag.value = {
    taskId: task.id,
    mode,
    anchorX: event.clientX,
    originalStart: start,
    originalEnd: end,
  }

  selectedTaskId.value = task.id
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', endDrag)
}

const onDragMove = (event: MouseEvent) => {
  if (!activeDrag.value) {
    return
  }

  const state = activeDrag.value
  const movedDays = Math.round((event.clientX - state.anchorX) / dayWidth.value)
  if (movedDays === 0) {
    return
  }

  let nextStart = state.originalStart
  let nextEnd = state.originalEnd

  if (state.mode === 'move') {
    nextStart = addDays(state.originalStart, movedDays)
    nextEnd = addDays(state.originalEnd, movedDays)
  } else if (state.mode === 'resize-start') {
    const candidate = addDays(state.originalStart, movedDays)
    nextStart = candidate <= state.originalEnd ? candidate : state.originalEnd
  } else {
    const candidate = addDays(state.originalEnd, movedDays)
    nextEnd = candidate >= state.originalStart ? candidate : state.originalStart
  }

  updateTaskDates(state.taskId, nextStart, nextEnd)
}

const endDrag = () => {
  activeDrag.value = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', endDrag)
}

onBeforeUnmount(() => {
  endDrag()
})

const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null)

const isUnassignedAssignee = (assignee: string) => {
  const normalized = normalizeText(assignee)
  if (!normalized) {
    return true
  }

  return ['-', '未指派', '未分派', 'n/a', 'na'].includes(normalized.toLowerCase())
}

const assigneeTaskGroups = computed(() => {
  const map = new Map<string, PlannerTask[]>()

  for (const task of tasks.value) {
    if (isUnassignedAssignee(task.assignee)) {
      continue
    }

    const assignee = normalizeText(task.assignee)
    if (!map.has(assignee)) {
      map.set(assignee, [])
    }

    map.get(assignee)?.push(task)
  }

  return Array.from(map.entries())
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => getTaskStart(a).getTime() - getTaskStart(b).getTime()),
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length
      }

      return a.name.localeCompare(b.name, 'zh-Hant')
    })
})

const unassignedTasks = computed(() => {
  return tasks.value
    .filter((task) => isUnassignedAssignee(task.assignee))
    .slice()
    .sort((a, b) => getTaskStart(a).getTime() - getTaskStart(b).getTime())
})

const selectedChecklistStats = computed(() => {
  if (!selectedTask.value) {
    return { completed: 0, total: 0 }
  }

  const total = selectedTask.value.checklistItems.length
  const completed = selectedTask.value.checklistItems.filter((item) => item.completed).length
  return { completed, total }
})

const selectedTaskDurationDays = computed(() => {
  if (!selectedTask.value) {
    return '-'
  }

  const { start, end } = ensureTaskDates(selectedTask.value)
  return String(Math.max(1, dayDiff(start, end) + 1))
})

const toggleOverview = () => {
  isOverviewCollapsed.value = !isOverviewCollapsed.value
}

const toggleStats = () => {
  isStatsCollapsed.value = !isStatsCollapsed.value
}
</script>

<template>
  <div class="planner-gantt-page">
    <div class="planner-toolbar">
      <div class="left-block">
        <h2>Planner Interactive Gantt</h2>
        <p>匯入 Microsoft Planner 匯出的 xlsx（支援「工作 / 合併資料」工作表）並轉為可互動甘特圖。</p>
      </div>

      <div class="toolbar-actions">
        <input type="file" accept=".xlsx" @change="handleFileImport">
        <label class="zoom-control">
          時間縮放
          <input v-model.number="dayWidth" type="range" min="18" max="50" step="2">
          <span>{{ dayWidth }} px</span>
        </label>
      </div>
    </div>

    <p v-if="sourceFileName" class="source-name">來源檔案：{{ sourceFileName }}</p>
    <p v-if="isParsing" class="status-info">解析中，請稍候...</p>
    <p v-if="successMessage" class="status-success">{{ successMessage }}</p>
    <p v-if="errorMessage" class="status-error">{{ errorMessage }}</p>

    <div v-if="tasks.length > 0" class="dashboard-cards">
      <div class="dashboard-card dashboard-card-done">
        <div class="dashboard-label">完成</div>
        <div class="dashboard-value">{{ dashboardMetrics.completed }}</div>
      </div>
      <div class="dashboard-card dashboard-card-pending">
        <div class="dashboard-label">未完成</div>
        <div class="dashboard-value">{{ dashboardMetrics.incomplete }}</div>
      </div>
      <div class="dashboard-card dashboard-card-soon">
        <div class="dashboard-label">即將到期（7 天內）</div>
        <div class="dashboard-value">{{ dashboardMetrics.dueSoon }}</div>
      </div>
    </div>

    <div v-if="tasks.length > 0" class="stats-panel">
      <div class="stats-panel-header">
        <div>
          <div class="stats-panel-title">全部任務統計圖表</div>
          <div class="stats-panel-subtitle">依目前匯入的全部任務計算，不受部門篩選影響。</div>
        </div>
        <button class="stats-toggle-button" type="button" @click="toggleStats">
          {{ isStatsCollapsed ? '展開統計圖表' : '收合統計圖表' }}
        </button>
      </div>

      <div v-show="!isStatsCollapsed" class="stats-kpi-grid">
        <div class="stats-kpi-card">
          <div class="stats-kpi-label">總完成率</div>
          <div class="stats-kpi-value">{{ overallCompletionRate }}%</div>
          <div class="stats-bar-track">
            <div class="stats-bar-fill stats-bar-fill-overall" :style="{ width: `${overallCompletionRate}%` }"></div>
          </div>
        </div>

        <div class="stats-kpi-card">
          <div class="stats-kpi-label">任務進度分布</div>
          <div class="stats-kpi-stack">
            <span class="stats-chip stats-chip-done">完成 {{ progressDistribution.done }}</span>
            <span class="stats-chip stats-chip-progress">進行中 {{ progressDistribution.inProgress }}</span>
            <span class="stats-chip stats-chip-todo">未開始 {{ progressDistribution.notStarted }}</span>
          </div>
        </div>
      </div>

      <div v-show="!isStatsCollapsed" class="stats-chart-grid">
        <div class="stats-chart-card">
          <div class="stats-chart-title">貯體完成率</div>
          <div v-if="bucketCompletionRates.length === 0" class="stats-empty">目前無可用資料</div>
          <div v-else class="stats-rows">
            <div v-for="bucket in bucketCompletionRates" :key="bucket.name" class="stats-row">
              <div class="stats-row-head">
                <span class="stats-row-name">{{ bucket.name }}</span>
                <span class="stats-row-value">{{ bucket.avgProgressPct }}%</span>
              </div>
              <div class="stats-bar-track">
                <div class="stats-bar-fill stats-bar-fill-bucket" :style="{ width: `${bucket.avgProgressPct}%` }"></div>
              </div>
              <div class="stats-row-meta">完成 {{ bucket.completedCount }} / {{ bucket.taskCount }}</div>
            </div>
          </div>
        </div>

        <div class="stats-chart-card">
          <div class="stats-chart-title">每項工作佔該貯體的完成率</div>
          <div class="stats-chart-subtitle">計算方式：工作進度 / 該貯體全部工作進度總和</div>
          <div v-if="taskContributionRates.length === 0" class="stats-empty">目前無可用資料</div>
          <div v-else class="stats-rows stats-rows-scroll">
            <div v-for="item in taskContributionRates" :key="item.id" class="stats-row">
              <div class="stats-row-head">
                <span class="stats-row-name" :title="item.name">{{ item.name }}</span>
                <span class="stats-row-value">{{ item.contributionPct }}%</span>
              </div>
              <div class="stats-bar-track">
                <div class="stats-bar-fill stats-bar-fill-task" :style="{ width: contributionBarWidth(item.contributionPct) }"></div>
              </div>
              <div class="stats-row-meta">{{ item.bucketName }} | 任務進度 {{ item.progressPct }}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="tasks.length > 0" class="overview-tools">
      <div class="overview-header-row">
        <div class="overview-title-wrap">
          <div class="overview-title">Planner Overview</div>
          <div class="overview-subtitle">{{ sourceFileName || 'Microsoft Planner 匯入資料' }}</div>
        </div>
        <button class="overview-toggle-button" type="button" @click="toggleOverview">
          {{ isOverviewCollapsed ? '展開 Overview' : '收合 Overview' }}
        </button>
      </div>

      <div v-show="!isOverviewCollapsed" ref="overviewRef" class="overview-export-card">

        <div class="overview-range">總時間軸：{{ overviewRangeLabel }}</div>

        <div class="overview-table">
          <div
            class="overview-table-head"
            :style="{ gridTemplateColumns: overviewGridTemplateColumns }"
          >
            <div>貯體</div>
            <div>總天數</div>
            <div>最小起始時間</div>
            <div>最大完成時間</div>
            <div class="overview-axis-track">
              <div class="overview-axis-month-row">
                <div
                  v-for="segment in overviewMonthSegments"
                  :key="segment.label"
                  class="overview-axis-month"
                  :style="{ width: `${segment.widthPct}%` }"
                >
                  {{ segment.label }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-for="row in bucketOverviewRows"
            :key="row.name"
            class="overview-table-row"
            :style="{ gridTemplateColumns: overviewGridTemplateColumns }"
          >
            <div class="overview-cell bucket-name-cell">{{ row.name }}</div>
            <div class="overview-cell">{{ row.totalDays }}</div>
            <div class="overview-cell">{{ formatDate(row.minStart) }}</div>
            <div class="overview-cell">{{ formatDate(row.maxFinish) }}</div>
            <div class="overview-track-cell">
              <div class="overview-track">
                <div
                  class="overview-track-bar"
                  :style="{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="overview-actions">
        <button class="tool-button" type="button" @click="copyOverviewToClipboard">複製 Overview 圖片</button>
        <button
          class="tool-button"
          style="--tool-button-bg: #334155"
          type="button"
          @click="copyCurrentViewToClipboard"
        >
          複製甘特圖圖片
        </button>
        <button
          class="tool-button"
          style="--tool-button-bg: #0f766e"
          type="button"
          @click="downloadOverviewAsPng"
        >
          下載 Overview PNG
        </button>
        <button
          class="tool-button"
          style="--tool-button-bg: #0369a1"
          type="button"
          @click="exportGanttWorkbook"
        >
          匯出甘特圖 Excel
        </button>
      </div>

      <p v-if="overviewMessage" class="overview-status">{{ overviewMessage }}</p>
    </div>

    <div v-if="tasks.length > 0" class="gantt-layout">
      <div class="gantt-filter-row">
        <div class="gantt-filter-title">部門標籤篩選</div>
        <details class="tag-dropdown" :open="false">
          <summary class="tag-dropdown-summary">{{ selectedTagDropdownLabel }}</summary>

          <div class="tag-dropdown-menu">
            <div v-if="allDepartmentTags.length === 0" class="tag-filter-empty">此檔案未找到可用的部門標籤欄位。</div>

            <template v-else>
              <div class="tag-dropdown-actions">
                <button class="tag-filter-button" type="button" @click="selectAllDepartmentTags">全部</button>
                <button class="tag-filter-button" type="button" @click="clearDepartmentTags">全不選</button>
              </div>

              <label
                v-for="tag in allDepartmentTags"
                :key="tag"
                class="tag-dropdown-item"
              >
                <input
                  type="checkbox"
                  :checked="isTagSelected(tag)"
                  @change="toggleDepartmentTag(tag)"
                >
                <span>{{ tag }}</span>
              </label>
            </template>
          </div>
        </details>
      </div>
      <p class="tag-filter-current">{{ displayedTagSummary }}</p>

      <div class="task-panel task-panel-top">
        <div class="summary-card">
          <div class="summary-title">工作摘要</div>
          <div class="summary-item">總數：{{ tasks.length }}</div>
          <div class="summary-item">貯體：{{ groupedTasks.length }}</div>
          <div class="summary-item">顯示中：{{ visibleTasks.length }}</div>

          <div class="summary-subtitle">負責人任務分布</div>
          <div v-if="assigneeTaskGroups.length === 0" class="summary-item">目前沒有已分派負責人的任務</div>
          <details v-for="group in assigneeTaskGroups" :key="group.name" class="summary-details">
            <summary>{{ group.name }}（{{ group.items.length }}）</summary>
            <ul class="summary-task-list">
              <li v-for="task in group.items" :key="task.id" class="summary-task-item" @click="selectedTaskId = task.id">
                <span class="summary-task-name">{{ task.name }}</span>
                <span class="summary-task-date">{{ formatDate(task.startDate) }}</span>
              </li>
            </ul>
          </details>

          <div class="summary-subtitle">未分派負責人（{{ unassignedTasks.length }}）</div>
          <div v-if="unassignedTasks.length === 0" class="summary-item">無未分派任務</div>
          <ul v-else class="summary-task-list summary-task-list-flat">
            <li v-for="task in unassignedTasks" :key="task.id" class="summary-task-item" @click="selectedTaskId = task.id">
              <span class="summary-task-name">{{ task.name }}</span>
              <span class="summary-task-date">{{ formatDate(task.startDate) }}</span>
            </li>
          </ul>
        </div>

        <div class="summary-card selected-task-card" v-if="selectedTask">
          <div class="selected-task-header">
            <div class="summary-title">目前選擇</div>
            <div class="selected-task-name">{{ selectedTask.name }}</div>
          </div>

          <div class="selected-task-grid">
            <div class="selected-kv"><span class="kv-label">狀態</span><span class="kv-value">{{ selectedTask.status || '-' }}</span></div>
            <div class="selected-kv"><span class="kv-label">優先</span><span class="kv-value">{{ selectedTask.priority || '-' }}</span></div>
            <div class="selected-kv"><span class="kv-label">起日</span><span class="kv-value">{{ formatDate(selectedTask.startDate) }}</span></div>
            <div class="selected-kv"><span class="kv-label">迄日</span><span class="kv-value">{{ formatDate(selectedTask.dueDate) }}</span></div>
            <div class="selected-kv"><span class="kv-label">天數</span><span class="kv-value">{{ selectedTaskDurationDays }}</span></div>
            <div class="selected-kv"><span class="kv-label">指派</span><span class="kv-value">{{ selectedTask.assignee || '-' }}</span></div>
            <div class="selected-kv"><span class="kv-label">貯體</span><span class="kv-value">{{ selectedTask.bucketName || '-' }}</span></div>
            <div class="selected-kv"><span class="kv-label">部門標籤</span><span class="kv-value">{{ selectedTask.departments.length > 0 ? selectedTask.departments.join('、') : '-' }}</span></div>
          </div>

          <details class="checklist-panel" :open="selectedTask.checklistItems.length > 0 && selectedTask.checklistItems.length <= 4">
            <summary>
              檢查清單（{{ selectedChecklistStats.completed }}/{{ selectedChecklistStats.total }}）
            </summary>

            <div v-if="selectedTask.checklistItems.length === 0" class="summary-item">此工作無檢查清單項目</div>
            <ul v-else class="checklist-list compact">
              <li v-for="item in selectedTask.checklistItems" :key="item.id" class="checklist-item">
                <span class="check-icon">{{ item.completed ? '☑' : '☐' }}</span>
                <span :class="{ 'checklist-done': item.completed }">{{ item.title }}</span>
              </li>
            </ul>
          </details>
        </div>
      </div>

      <section ref="ganttCaptureRef" class="gantt-main">
        <div class="timeline-header" :style="{ width: timelineRenderWidth }">
          <div class="month-row">
            <div class="timeline-label-spacer" :style="{ width: `${TASK_LABEL_WIDTH}px` }"></div>
            <div
              v-for="segment in monthSegments"
              :key="segment.label"
              class="month-cell"
              :style="{ width: `${segment.length * dayWidth}px` }"
            >
              {{ segment.label }}
            </div>
          </div>
          <div class="day-row">
            <div class="timeline-label-spacer" :style="{ width: `${TASK_LABEL_WIDTH}px` }"></div>
            <div
              v-for="date in timelineDays"
              :key="date.toISOString()"
              class="day-cell"
              :style="{ width: `${dayWidth}px` }"
            >
              {{ date.getDate() }}
            </div>
          </div>
        </div>

        <div class="gantt-body">
          <div class="today-line" :style="{ left: `${TASK_LABEL_WIDTH + todayOffset}px` }"></div>

          <template v-for="group in groupedTasks" :key="group.bucketName">
            <div class="group-row" :style="groupRowStyle" @click="toggleBucket(group.bucketName)">
              <span>{{ collapsedBuckets[group.bucketName] ? '▸' : '▾' }}</span>
              <strong>{{ group.bucketName }}</strong>
              <span>（{{ group.items.length }}）</span>
            </div>

            <div v-if="!collapsedBuckets[group.bucketName]">
              <div
                v-for="task in group.items"
                :key="task.id"
                class="task-row"
                :class="{ selected: selectedTaskId === task.id }"
                :style="rowStyle"
                @click="selectedTaskId = task.id"
              >
                <div class="task-label">
                  <div class="task-name">{{ task.name }}</div>
                  <div class="task-meta">
                    {{ task.status || '未設定狀態' }} | {{ formatDate(task.startDate) }} ~
                    {{ formatDate(task.dueDate) }}
                  </div>
                  <div v-if="task.departments.length > 0" class="task-tag-row">
                    <span
                      v-for="tag in task.departments"
                      :key="`${task.id}-${tag}`"
                      class="task-tag-pill"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>

                <div class="task-track" :style="taskTrackStyle">
                  <div
                    class="task-bar"
                    :class="barClass(task)"
                    :style="taskBarStyle(task)"
                    @mousedown="(event) => beginDrag(event, task, 'move')"
                  >
                    <span
                      class="resize-handle left"
                      @mousedown="(event) => beginDrag(event, task, 'resize-start')"
                    ></span>
                    <span class="bar-title">{{ task.name }}</span>
                    <span
                      class="resize-handle right"
                      @mousedown="(event) => beginDrag(event, task, 'resize-end')"
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.planner-gantt-page {
  width: 100%;
  box-sizing: border-box;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #1f2937;
}

.planner-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.left-block h2 {
  margin: 0;
}

.left-block p {
  margin: 6px 0 0;
  color: #4b5563;
}

.toolbar-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.zoom-control {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.status-info,
.status-success,
.status-error,
.source-name {
  margin: 0;
  font-size: 13px;
}

.status-success {
  color: #2e7d32;
}

.status-error {
  color: #c62828;
}

.gantt-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tag-filter-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.tag-dropdown {
  position: relative;
}

.tag-dropdown-summary {
  list-style: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #1e293b;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
}

.tag-dropdown-summary::-webkit-details-marker {
  display: none;
}

.tag-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  width: 260px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-dropdown-actions {
  display: flex;
  gap: 8px;
}

.tag-filter-button {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #1e293b;
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
}

.tag-filter-button:hover,
.tag-dropdown-summary:hover {
  background: #f1f5f9;
}

.tag-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #334155;
  padding: 4px 2px;
  cursor: pointer;
}

.tag-dropdown-item input {
  margin: 0;
}

.tag-filter-empty {
  font-size: 12px;
  color: #64748b;
}

.tag-filter-current {
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.dashboard-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-card {
  border: 1px solid #d7deea;
  border-radius: 10px;
  padding: 12px;
  background: #f8fbff;
}

.dashboard-card-done {
  background: linear-gradient(135deg, #ecfdf3, #dcfce7);
  border-color: #86efac;
}

.dashboard-card-pending {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border-color: #93c5fd;
}

.dashboard-card-soon {
  background: linear-gradient(135deg, #fff7ed, #ffedd5);
  border-color: #fdba74;
}

.dashboard-label {
  font-size: 12px;
  color: #475569;
  margin-bottom: 6px;
}

.dashboard-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  color: #1e293b;
}

.stats-panel {
  border: 1px solid #d7deea;
  border-radius: 12px;
  padding: 12px;
  background: #f8fbff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stats-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stats-panel-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.stats-panel-subtitle {
  font-size: 12px;
  color: #64748b;
}

.stats-toggle-button {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #1e293b;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
}

.stats-toggle-button:hover {
  background: #f1f5f9;
}

.stats-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stats-kpi-card {
  border: 1px solid #dbe5f1;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-kpi-label {
  font-size: 12px;
  color: #64748b;
}

.stats-kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: #1e40af;
}

.stats-kpi-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stats-chip {
  border-radius: 999px;
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid transparent;
}

.stats-chip-done {
  color: #166534;
  background: #dcfce7;
  border-color: #86efac;
}

.stats-chip-progress {
  color: #92400e;
  background: #ffedd5;
  border-color: #fdba74;
}

.stats-chip-todo {
  color: #1e3a8a;
  background: #dbeafe;
  border-color: #93c5fd;
}

.stats-chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stats-chart-card {
  border: 1px solid #dbe5f1;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-chart-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.stats-chart-subtitle {
  font-size: 11px;
  color: #64748b;
}

.stats-empty {
  font-size: 12px;
  color: #64748b;
}

.stats-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-rows-scroll {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.stats-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stats-row-name {
  min-width: 0;
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-row-value {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.stats-row-meta {
  font-size: 11px;
  color: #64748b;
}

.stats-bar-track {
  height: 10px;
  width: 100%;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.stats-bar-fill {
  height: 100%;
  border-radius: 999px;
}

.stats-bar-fill-overall {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.stats-bar-fill-bucket {
  background: linear-gradient(90deg, #0ea5e9, #2563eb);
}

.stats-bar-fill-task {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.overview-tools {
  border: 1px solid #d7deea;
  border-radius: 12px;
  padding: 12px;
  background: #f8fbff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-x: auto;
}

.overview-export-card {
  width: max-content;
  min-width: 100%;
  max-width: none;
  box-sizing: border-box;
  border: 1px solid #dbe5f1;
  border-radius: 10px;
  padding: 14px;
  background: #ffffff;
  color: #1e293b;
}

.overview-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.overview-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overview-toggle-button {
  border: 1px solid #d7deea;
  border-radius: 8px;
  padding: 6px 10px;
  background: #ffffff;
  color: #1e293b;
  font-size: 13px;
  cursor: pointer;
}

.overview-toggle-button:hover {
  background: #f8fafc;
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
}

.overview-title {
  font-size: 18px;
  font-weight: 700;
}

.overview-subtitle {
  font-size: 12px;
  color: #64748b;
}

.overview-range {
  margin-top: 10px;
  font-size: 13px;
  color: #475569;
}

.overview-axis-track {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  height: 100%;
}

.overview-axis-month-row {
  display: flex;
  width: 100%;
}

.overview-axis-month {
  box-sizing: border-box;
  border-right: 1px solid #dbe5f1;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  padding: 8px 0;
}

.overview-table {
  margin-top: 10px;
  border: 1px solid #dbe5f1;
  border-radius: 8px;
  overflow: auto;
}

.overview-table-head,
.overview-table-row {
  display: grid;
  align-items: center;
}

.overview-table-head {
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #dbe5f1;
}

.overview-table-head > div {
  padding: 8px;
}

.overview-table-row {
  border-bottom: 1px solid #eff3f8;
}

.overview-table-row:last-child {
  border-bottom: none;
}

.overview-cell {
  padding: 8px;
  font-size: 12px;
  color: #334155;
}

.bucket-name-cell {
  font-weight: 600;
}

.overview-track-cell {
  padding: 6px 8px;
}

.overview-track {
  position: relative;
  width: 100%;
  height: 20px;
  border-radius: 6px;
  background-image:
    repeating-linear-gradient(to right, rgba(148, 163, 184, 0.25) 0 1px, transparent 1px var(--overview-day-width));
  background-color: #f8fafc;
  --overview-day-width: 12px;
}

.overview-track-bar {
  position: absolute;
  top: 3px;
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
}

.overview-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.overview-status {
  margin: 0;
  font-size: 13px;
  color: #334155;
}

.gantt-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 640px;
}

.task-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.task-panel-top {
  align-items: stretch;
}

.summary-subtitle {
  margin-top: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #64748b;
}

.summary-details {
  margin-bottom: 6px;
}

.summary-details summary {
  cursor: pointer;
  font-size: 12px;
  color: #334155;
  user-select: none;
}

.summary-task-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid #e5ecf5;
  border-radius: 8px;
  background: #ffffff;
  max-height: 132px;
  overflow-y: auto;
}

.summary-task-list-flat {
  margin-top: 4px;
}

.summary-task-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid #eef2f7;
  cursor: pointer;
}

.summary-task-item:last-child {
  border-bottom: none;
}

.summary-task-item:hover {
  background: #f8fbff;
}

.summary-task-name {
  min-width: 0;
  font-size: 12px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-task-date {
  flex: 0 0 auto;
  font-size: 11px;
  color: #64748b;
}

.selected-task-card {
  padding: 10px 12px;
}

.selected-task-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.selected-task-header .summary-title {
  margin-bottom: 0;
}

.selected-task-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.selected-task-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.selected-kv {
  border: 1px solid #e5ecf5;
  background: #ffffff;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.kv-label {
  font-size: 11px;
  color: #64748b;
}

.kv-value {
  font-size: 12px;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.checklist-panel {
  margin-top: 8px;
}

.checklist-panel summary {
  cursor: pointer;
  font-size: 12px;
  color: #475569;
  user-select: none;
}

.checklist-list.compact {
  margin-top: 6px;
  max-height: 120px;
  overflow-y: auto;
  padding-right: 4px;
}

.checklist-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.check-icon {
  color: #334155;
}

.checklist-done {
  color: #64748b;
  text-decoration: line-through;
}

.summary-card {
  border: 1px solid #d7deea;
  border-radius: 10px;
  padding: 12px;
  background: #f8fbff;
}

.summary-title {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}

.summary-item {
  font-size: 13px;
  margin-bottom: 4px;
}

.gantt-main {
  border: 1px solid #d7deea;
  border-radius: 10px;
  overflow: auto;
  background: #fff;
  min-height: 520px;
}

.timeline-header {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f1f5f9;
  border-bottom: 1px solid #d7deea;
}

.month-row,
.day-row {
  display: flex;
}

.timeline-label-spacer {
  min-width: 270px;
  border-right: 1px solid #cad5e2;
  box-sizing: border-box;
}

.month-cell {
  box-sizing: border-box;
  border-right: 1px solid #cad5e2;
  border-bottom: 1px solid #cad5e2;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 0;
}

.day-cell {
  box-sizing: border-box;
  border-right: 1px solid #d8e1ec;
  text-align: center;
  font-size: 11px;
  padding: 4px 0;
  color: #475569;
}

.gantt-body {
  position: relative;
}

.today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(220, 38, 38, 0.45);
  z-index: 2;
  pointer-events: none;
}

.group-row {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-top: 1px solid #e2e8f0;
  cursor: pointer;
  font-size: 13px;
  box-sizing: border-box;
}

.task-row {
  display: flex;
  align-items: stretch;
  border-top: 1px solid #eef2f7;
  min-height: 62px;
  padding: 4px 0;
  min-width: max-content;
  box-sizing: border-box;
}

.task-row.selected {
  background: #ecfeff;
}

.task-label {
  flex: 0 0 270px;
  width: 270px;
  min-width: 270px;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.task-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.task-tag-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
}

.task-track {
  flex: 0 0 auto;
  position: relative;
  min-height: 62px;
  overflow: hidden;
  background-image: linear-gradient(to right, rgba(148, 163, 184, 0.2) 1px, transparent 1px);
}

.task-bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  color: #fff;
  cursor: grab;
  user-select: none;
}

.task-bar:active {
  cursor: grabbing;
}

.bar-title {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  pointer-events: none;
}

.bar-todo {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
}

.bar-progress {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.bar-done {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.resize-handle {
  width: 8px;
  height: 100%;
  cursor: ew-resize;
  display: inline-block;
}

.resize-handle.left {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

.resize-handle.right {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

@media (max-width: 960px) {
  .dashboard-cards {
    grid-template-columns: 1fr;
  }

  .stats-kpi-grid,
  .stats-chart-grid {
    grid-template-columns: 1fr;
  }

  .overview-export-card {
    overflow-x: auto;
  }

  .overview-table {
    min-width: 760px;
  }

  .gantt-layout {
    min-height: 520px;
  }

  .task-panel {
    grid-template-columns: 1fr;
  }

  .selected-task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-label {
    width: 270px;
    min-width: 270px;
  }
}
</style>
