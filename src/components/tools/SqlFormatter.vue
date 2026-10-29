<script setup lang="ts">
import { computed, ref } from 'vue'

const input = ref('select id,name from users where active = 1 order by name;')
const keywordCase = ref<'upper' | 'lower'>('upper')
const compact = ref(false)
const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE']

const formatted = computed(() => {
  let sql = input.value.trim().replace(/\s+/g, ' ')
  const replacements = keywordCase.value === 'upper'
    ? keywords
    : keywords.map((keyword) => keyword.toLowerCase())
  keywords.forEach((keyword, index) => {
    sql = sql.replace(new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'gi'), replacements[index]!)
  })
  if (compact.value) return sql.replace(/\s*([(),=])\s*/g, '$1')
  return sql
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|SET|VALUES|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN)\s+/g, '\n$1 ')
    .replace(/\s+(AND|OR)\s+/g, '\n  $1 ')
    .replace(/\s*,\s*/g, ',\n  ')
    .trim()
})
</script>

<template>
  <div class="tool-page">
    <h2>SQL Formatter</h2>
    <textarea v-model="input" class="tool-textarea" rows="10" aria-label="SQL 輸入"></textarea>
    <div class="tool-actions">
      <select v-model="keywordCase" aria-label="關鍵字大小寫"><option value="upper">大寫關鍵字</option><option value="lower">小寫關鍵字</option></select>
      <label><input v-model="compact" type="checkbox" /> 壓縮 SQL</label>
    </div>
    <pre class="tool-output">{{ formatted }}</pre>
    <button class="tool-button" @click="navigator.clipboard.writeText(formatted)">複製結果</button>
  </div>
</template>
