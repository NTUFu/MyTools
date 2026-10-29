<script setup lang="ts">
import { computed, ref } from 'vue'
import { parse as parseYaml } from 'yaml'

interface Endpoint { method: string; path: string; summary: string; operation: Record<string, unknown> }
const input = ref('openapi: 3.0.0\ninfo:\n  title: Example API\npaths:\n  /users:\n    get:\n      summary: List users')
const baseUrl = ref('')
const endpoints = ref<Endpoint[]>([])
const errorMessage = ref('')
const selected = ref<Endpoint | null>(null)
const parseDocument = () => {
  errorMessage.value = ''
  try {
    const document = parseYaml(input.value) as { servers?: Array<{ url?: string }>; paths?: Record<string, Record<string, Record<string, unknown>>> }
    baseUrl.value = document.servers?.[0]?.url ?? ''
    endpoints.value = Object.entries(document.paths ?? {}).flatMap(([path, operations]) =>
      Object.entries(operations).filter(([method]) => ['get', 'post', 'put', 'patch', 'delete', 'head'].includes(method)).map(([method, operation]) => ({
        method: method.toUpperCase(), path, summary: typeof operation.summary === 'string' ? operation.summary : '', operation,
      })),
    )
    selected.value = endpoints.value[0] ?? null
  } catch (error) {
    endpoints.value = []
    errorMessage.value = error instanceof Error ? `解析失敗：${error.message}` : 'OpenAPI 文件解析失敗。'
  }
}
const curl = computed(() => selected.value ? `curl -X ${selected.value.method} ${JSON.stringify(`${baseUrl.value}${selected.value.path}`)}` : '')
</script>

<template>
  <div class="tool-page">
    <h2>OpenAPI / Swagger Viewer</h2>
    <textarea v-model="input" class="tool-textarea" rows="12"></textarea>
    <div class="tool-actions"><button class="tool-button" @click="parseDocument">解析文件</button><input v-model="baseUrl" class="tool-input" placeholder="Server URL（選填）" /></div>
    <p v-if="errorMessage" class="tool-error">{{ errorMessage }}</p>
    <div v-for="endpoint in endpoints" :key="`${endpoint.method}-${endpoint.path}`" class="tool-actions">
      <button class="tool-button" @click="selected = endpoint">{{ endpoint.method }} {{ endpoint.path }}</button><span>{{ endpoint.summary }}</span>
    </div>
    <pre v-if="selected" class="tool-output">{{ curl }}</pre>
  </div>
</template>
