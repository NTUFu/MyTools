<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

const expression = ref('*/5 * * * *')
const errorMessage = ref('')
const now = ref(new Date())
const aiIsLocal = isLocalAiAvailable()
const aiDescription = ref('')
const aiResult = ref('')
const aiError = ref('')
const aiAction = ref<'generate' | 'explain' | null>(null)
const aiCronDraft = ref('')
let activeAiRequest: AbortController | null = null

const fields = ['分', '時', '日', '月', '週']
const fieldRanges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]

const parseCronExpression = (value: string): string | null => {
  const fenced = value.match(/```(?:cron)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = (fenced ?? value.trim()).replace(/^cron\s*:\s*/i, '').split(/\r?\n/)[0]?.trim() ?? ''
  const parts = candidate.split(/\s+/)
  if (parts.length !== 5) return null

  const isValidField = (part: string, [min, max]: [number, number]) =>
    part.split(',').every((item) => {
      if (!item) return false
      const [base, stepText, extra] = item.split('/')
      if (extra !== undefined) return false
      if (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1)) return false
      if (base === '*') return true

      const range = base?.match(/^(\d+)(?:-(\d+))?$/)
      if (!range) return false
      const start = Number(range[1])
      const end = range[2] === undefined ? start : Number(range[2])
      return start >= min && end <= max && start <= end && (stepText === undefined || range[2] !== undefined)
    })

  return parts.every((part, index) => isValidField(part, fieldRanges[index]!)) ? parts.join(' ') : null
}

const descriptions = computed(() => {
  const parts = expression.value.trim().split(/\s+/)
  if (parts.length !== 5) return []
  return parts.map((part, index) => `${fields[index]}：${part}`)
})

const matches = (value: number, part: string, min: number, max: number) => {
  if (part === '*') return true
  return part.split(',').some((item) => {
    const [base, stepText] = item.split('/')
    const step = stepText ? Number(stepText) : 1
    if (!Number.isInteger(step) || step < 1) return false
    if (base === '*') return value % step === 0
    if (base.includes('-')) {
      const [start, end] = base.split('-').map(Number)
      return value >= start && value <= end && (value - start) % step === 0
    }
    return value === Number(base)
  }) && value >= min && value <= max
}

const nextRuns = computed(() => {
  errorMessage.value = ''
  const parts = expression.value.trim().split(/\s+/)
  if (parts.length !== 5) {
    errorMessage.value = 'Cron 表達式目前支援 5 個欄位：分 時 日 月 週。'
    return []
  }
  const result: Date[] = []
  const cursor = new Date(now.value)
  cursor.setSeconds(0, 0)
  for (let i = 0; i < 525600 && result.length < 5; i += 1) {
    cursor.setMinutes(cursor.getMinutes() + 1)
    if (
      matches(cursor.getMinutes(), parts[0]!, 0, 59) &&
      matches(cursor.getHours(), parts[1]!, 0, 23) &&
      matches(cursor.getDate(), parts[2]!, 1, 31) &&
      matches(cursor.getMonth() + 1, parts[3]!, 1, 12) &&
      matches(cursor.getDay(), parts[4]!, 0, 6)
    ) result.push(new Date(cursor))
  }
  if (result.length === 0) errorMessage.value = '找不到符合條件的執行時間，請檢查欄位。'
  return result
})

const clearAiSuggestion = () => {
  const controller = activeAiRequest
  activeAiRequest = null
  aiAction.value = null
  aiResult.value = ''
  aiError.value = ''
  aiCronDraft.value = ''
  controller?.abort()
}

const requestCronAi = async (action: 'generate' | 'explain') => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiResult.value = ''
  aiCronDraft.value = ''

  if (action === 'generate' && !aiDescription.value.trim()) {
    aiError.value = '請先描述排程需求。'
    return
  }
  if (action === 'explain' && !expression.value.trim()) {
    aiError.value = '請先輸入 Cron 表達式。'
    return
  }

  const controller = new AbortController()
  activeAiRequest = controller
  aiAction.value = action
  try {
    const result = await generateAiText({
      tool: 'cron-helper',
      action: `cron-${action}`,
      prompt: action === 'generate'
        ? '將排程需求轉成此工具支援的標準 5 欄位 Cron 表達式（分 時 日 月 週）。只輸出單一表達式，不要 Markdown 或說明。只使用數字、*、逗號、範圍及步進；星期使用 0 到 6。'
        : '請用繁體中文說明這個標準 5 欄位 Cron 表達式各欄位的含意與觸發時機。若格式無效請指出，不要假稱已執行計算。',
      context: action === 'generate'
        ? `排程需求：\n${aiDescription.value.trim()}`
        : `Cron 表達式：\n${expression.value.trim()}`,
      signal: controller.signal,
    })
    aiResult.value = result.text
    if (action === 'generate') {
      const candidate = parseCronExpression(result.text)
      if (candidate) {
        aiCronDraft.value = candidate
      } else {
        aiError.value = 'AI 回覆不是此工具支援的有效 5 欄位 Cron 表達式，原設定未變更。'
      }
    }
  } catch (error) {
    if (activeAiRequest === controller) {
      aiError.value = error instanceof Error
        ? error.name === 'AbortError' ? '已取消 AI 請求。' : error.message
        : 'AI 請求失敗。'
    }
  } finally {
    if (activeAiRequest === controller) {
      activeAiRequest = null
      aiAction.value = null
    }
  }
}

const applyAiCronDraft = () => {
  if (aiCronDraft.value) {
    expression.value = aiCronDraft.value
  }
}

const cancelCronAi = () => activeAiRequest?.abort()

onBeforeUnmount(clearAiSuggestion)
</script>

<template>
  <div class="tool-page">
    <h2>Cron Expression Helper</h2>
    <p>支援標準 5 欄位 Cron：分 時 日 月 週。</p>
    <input v-model="expression" class="tool-input" aria-label="Cron 表達式" placeholder="*/5 * * * *" @input="clearAiSuggestion" />
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <div class="tool-actions"><button class="tool-button" @click="now = new Date()">重新計算</button></div>
    <ul><li v-for="description in descriptions" :key="description">{{ description }}</li></ul>
    <h3>下次執行時間</h3>
    <ul><li v-for="run in nextRuns" :key="run.toISOString()">{{ run.toLocaleString('zh-TW', { hour12: false }) }}</li></ul>
    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI Cron 助手</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">僅傳送你的排程描述或 Cron 表達式。產生結果會先檢查欄位格式，需手動套用；原有執行時間仍由本工具計算。</p>
      </div>
      <textarea v-model="aiDescription" class="tool-textarea" rows="2" maxlength="4000" placeholder="描述排程，例如：每個工作日早上 9 點執行" @input="clearAiSuggestion" />
      <div class="tool-actions">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null" @click="requestCronAi('generate')">
          {{ aiAction === 'generate' ? '產生中…' : '依描述產生 Cron' }}
        </button>
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction !== null || !expression.trim()" @click="requestCronAi('explain')">
          {{ aiAction === 'explain' ? '解釋中…' : '解釋目前 Cron' }}
        </button>
        <button v-if="aiAction !== null" class="tool-button tool-button--compact" type="button" @click="cancelCronAi">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" class="tool-error" role="status">{{ aiError }}</p>
      <div v-if="aiResult">
        <pre class="tool-output">{{ aiResult }}</pre>
        <button v-if="aiCronDraft" class="tool-button tool-button--compact" type="button" @click="applyAiCronDraft">將 Cron 草稿帶入欄位</button>
      </div>
    </section>
  </div>
</template>
