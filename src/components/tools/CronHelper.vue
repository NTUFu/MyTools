<script setup lang="ts">
import { computed, ref } from 'vue'

const expression = ref('*/5 * * * *')
const errorMessage = ref('')
const now = ref(new Date())

const fields = ['分', '時', '日', '月', '週']
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
</script>

<template>
  <div class="tool-page">
    <h2>Cron Expression Helper</h2>
    <p>支援標準 5 欄位 Cron：分 時 日 月 週。</p>
    <input v-model="expression" class="tool-input" aria-label="Cron 表達式" placeholder="*/5 * * * *" />
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <div class="tool-actions"><button class="tool-button" @click="now = new Date()">重新計算</button></div>
    <ul><li v-for="description in descriptions" :key="description">{{ description }}</li></ul>
    <h3>下次執行時間</h3>
    <ul><li v-for="run in nextRuns" :key="run.toISOString()">{{ run.toLocaleString('zh-TW', { hour12: false }) }}</li></ul>
  </div>
</template>
