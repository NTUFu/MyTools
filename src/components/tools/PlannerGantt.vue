<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import * as XLSX from 'xlsx'
import { toPng } from 'html-to-image'

interface PlannerTask {
  id: string
  name: string
  bucketId: string
  bucketName: string
  status: string
  priority: string
  assignee: string
  createdBy: string
  notes: string
  startDate: Date | null
  dueDate: Date | null
  completedDate: Date | null
  createdDate: Date | null
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

const isParsing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const overviewMessage = ref('')
const sourceFileName = ref('')
const overviewRef = ref<HTMLElement | null>(null)
const ganttCaptureRef = ref<HTMLElement | null>(null)

const tasks = ref<PlannerTask[]>([])
const collapsedBuckets = ref<Record<string, boolean>>({})

const dayWidth = ref(28)
const now = new Date()
const TASK_LABEL_WIDTH = 270
const OVERVIEW_BUCKET_COL_WIDTH = 180
const OVERVIEW_DAYS_COL_WIDTH = 80
const OVERVIEW_DATE_COL_WIDTH = 120

const activeDrag = ref<DragState | null>(null)
const selectedTaskId = ref('')

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

  const requiredKeys = ['工作識別碼', '工作名稱', '貯體', '狀態', '到期日', '開始日期']
  const missingKeys = requiredKeys.filter((key) => !headerMap.has(key))
  if (missingKeys.length > 0) {
    throw new Error(`缺少必要欄位：${missingKeys.join('、')}`)
  }

  const bucketNameMap = new Map<string, string>()
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

    const [, ...body] = userRows
    for (const row of body) {
      if (!Array.isArray(row)) {
        continue
      }

      const id = normalizeText(row[0])
      const name = normalizeText(row[1])
      if (id && name) {
        userNameMap.set(id, name)
      }
    }
  }

  const parsedTasks: PlannerTask[] = rows
    .filter((row) => Array.isArray(row) && row.some((cell) => normalizeText(cell) !== ''))
    .map((row) => {
      const id = normalizeText(readCell(row, headerMap, '工作識別碼'))
      const name = normalizeText(readCell(row, headerMap, '工作名稱'))
      const bucketRaw = normalizeText(readCell(row, headerMap, '貯體'))
      const status = normalizeText(readCell(row, headerMap, '狀態'))
      const priority = normalizeText(readCell(row, headerMap, '優先順序'))
      const assigneeRaw = normalizeText(readCell(row, headerMap, '指派至'))
      const createdByRaw = normalizeText(readCell(row, headerMap, '建立者'))
      const notes = normalizeText(readCell(row, headerMap, '記事'))
      const startDate = parseDateCell(readCell(row, headerMap, '開始日期'))
      const dueDate = parseDateCell(readCell(row, headerMap, '到期日'))
      const completedDate = parseDateCell(readCell(row, headerMap, '完成日期'))
      const createdDate = parseDateCell(readCell(row, headerMap, '建立日期'))

      return {
        id: id || createTaskId(),
        name: name || '(未命名工作)',
        bucketId: bucketRaw,
        bucketName: bucketNameMap.get(bucketRaw) ?? bucketRaw ?? '未分類',
        status,
        priority,
        assignee: userNameMap.get(assigneeRaw) ?? assigneeRaw,
        createdBy: userNameMap.get(createdByRaw) ?? createdByRaw,
        notes,
        startDate,
        dueDate,
        completedDate,
        createdDate,
      }
    })

  if (parsedTasks.length === 0) {
    throw new Error('沒有找到可顯示的工作資料。')
  }

  tasks.value = parsedTasks
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

const groupedTasks = computed(() => {
  const groups = new Map<string, PlannerTask[]>()

  for (const task of tasks.value) {
    const bucketName = task.bucketName || '未分類'
    if (!groups.has(bucketName)) {
      groups.set(bucketName, [])
    }

    groups.get(bucketName)?.push(task)
  }

  return Array.from(groups.entries()).map(([bucketName, items]) => ({
    bucketName,
    items: items.sort((a, b) => dayDiff(getTaskStart(a), getTaskStart(b))),
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

const isTaskCompleted = (task: PlannerTask) => {
  const normalized = normalizeStatus(task.status)
  return normalized.includes('完成') || task.completedDate !== null
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
  width: `${chartWidth.value}px`,
  backgroundImage:
    'repeating-linear-gradient(to right, rgba(148, 163, 184, 0.24) 0 1px, transparent 1px var(--day-width))',
  backgroundSize: 'auto 100%',
  ['--day-width' as string]: `${dayWidth.value}px`,
}))

const rowStyle = computed(() => ({
  width: `${timelineTotalWidth.value}px`,
}))

const groupRowStyle = computed(() => ({
  width: `${timelineTotalWidth.value}px`,
  backgroundImage: `linear-gradient(to right, #f8fafc ${TASK_LABEL_WIDTH}px, #f1f5f9 ${TASK_LABEL_WIDTH}px)`,
  backgroundSize: `${timelineTotalWidth.value}px 100%`,
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

    <div v-if="tasks.length > 0" class="overview-tools">
      <div ref="overviewRef" class="overview-export-card">
        <div class="overview-header">
          <div class="overview-title">Planner Overview</div>
          <div class="overview-subtitle">{{ sourceFileName || 'Microsoft Planner 匯入資料' }}</div>
        </div>

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
      </div>

      <p v-if="overviewMessage" class="overview-status">{{ overviewMessage }}</p>
    </div>

    <div v-if="tasks.length > 0" class="gantt-layout">
      <aside class="task-panel">
        <div class="summary-card">
          <div class="summary-title">工作摘要</div>
          <div class="summary-item">總數：{{ tasks.length }}</div>
          <div class="summary-item">貯體：{{ groupedTasks.length }}</div>
          <div class="summary-item">顯示中：{{ visibleTasks.length }}</div>
        </div>

        <div class="summary-card" v-if="selectedTask">
          <div class="summary-title">目前選擇</div>
          <div class="summary-item"><strong>{{ selectedTask.name }}</strong></div>
          <div class="summary-item">狀態：{{ selectedTask.status || '-' }}</div>
          <div class="summary-item">優先：{{ selectedTask.priority || '-' }}</div>
          <div class="summary-item">起日：{{ formatDate(selectedTask.startDate) }}</div>
          <div class="summary-item">迄日：{{ formatDate(selectedTask.dueDate) }}</div>
          <div class="summary-item">指派：{{ selectedTask.assignee || '-' }}</div>
          <div class="summary-item">貯體：{{ selectedTask.bucketName || '-' }}</div>
        </div>
      </aside>

      <section ref="ganttCaptureRef" class="gantt-main">
        <div class="timeline-header" :style="{ width: `${timelineTotalWidth}px` }">
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
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 12px;
  min-height: 520px;
}

.task-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  align-items: center;
  border-top: 1px solid #eef2f7;
  height: 54px;
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

.task-track {
  flex: 0 0 auto;
  position: relative;
  height: 100%;
  background-image: linear-gradient(to right, rgba(148, 163, 184, 0.2) 1px, transparent 1px);
}

.task-bar {
  position: absolute;
  top: 10px;
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

  .overview-export-card {
    overflow-x: auto;
  }

  .overview-table {
    min-width: 760px;
  }

  .gantt-layout {
    grid-template-columns: 1fr;
  }

  .task-label {
    width: 270px;
    min-width: 270px;
  }
}
</style>
