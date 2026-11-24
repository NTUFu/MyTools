<script setup lang="ts">
import { ref } from 'vue'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

type Format = 'json' | 'yaml' | 'toml'
const sourceFormat = ref<Format>('json')
const targetFormat = ref<Format>('yaml')
const input = ref('{"name":"MyTools","enabled":true}')
const output = ref('')
const errorMessage = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const openFilePicker = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const extension = file.name.toLowerCase().match(/\.(json|yaml|toml)$/)?.[1]
  const format: Format | null =
    extension === 'json' || extension === 'yaml' || extension === 'toml' ? extension : null

  if (!format) {
    errorMessage.value = '僅支援 .json、.yaml、.toml 檔案。'
    target.value = ''
    return
  }

  try {
    input.value = await file.text()
    sourceFormat.value = format
    output.value = ''
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? `檔案讀取失敗：${error.message}` : '檔案讀取失敗。'
  } finally {
    target.value = ''
  }
}

const parse = (value: string, format: Format): unknown => {
  if (format === 'json') return JSON.parse(value)
  if (format === 'yaml') return parseYaml(value)
  return parseToml(value)
}

const stringify = (value: unknown, format: Format): string => {
  if (format === 'json') return JSON.stringify(value, null, 2)
  if (format === 'yaml') return stringifyYaml(value)
  return stringifyToml(value as Record<string, unknown>)
}

const convert = () => {
  errorMessage.value = ''
  try {
    output.value = stringify(parse(input.value, sourceFormat.value), targetFormat.value)
  } catch (error) {
    output.value = ''
    errorMessage.value = error instanceof Error ? `轉換失敗：${error.message}` : '轉換失敗。'
  }
}
</script>

<template>
  <div class="tool-page">
    <h2>JSON / YAML / TOML 轉換</h2>
    <div class="tool-actions">
      <label>來源 <select v-model="sourceFormat"><option value="json">JSON</option><option value="yaml">YAML</option><option value="toml">TOML</option></select></label>
      <label>目標 <select v-model="targetFormat"><option value="json">JSON</option><option value="yaml">YAML</option><option value="toml">TOML</option></select></label>
      <button class="tool-button" @click="openFilePicker">匯入檔案</button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json,.yaml,.toml"
        style="display: none"
        @change="handleFileImport"
      >
      <button class="tool-button" @click="convert">轉換</button>
    </div>
    <textarea v-model="input" class="tool-textarea" rows="12"></textarea>
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <pre class="tool-output">{{ output || '尚未轉換' }}</pre>
  </div>
</template>
