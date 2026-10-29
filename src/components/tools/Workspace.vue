<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

interface WorkspaceItem { id: string; name: string; content: string }
const STORAGE_KEY = 'mytools:workspace'
const router = useRouter()
const items = ref<WorkspaceItem[]>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as WorkspaceItem[])
const name = ref('')
const content = ref('')
const selectedId = ref('')
const selected = computed(() => items.value.find((item) => item.id === selectedId.value))
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
const save = () => {
  if (!name.value.trim()) return
  const item = { id: crypto.randomUUID(), name: name.value.trim(), content: content.value }
  items.value = [item, ...items.value].slice(0, 50)
  selectedId.value = item.id
  persist()
}
const remove = (id: string) => { items.value = items.value.filter((item) => item.id !== id); persist() }
const openJson = () => {
  if (selected.value) router.push({ path: '/tools/json-formatter', query: { workspace: selected.value.id } })
}
</script>

<template>
  <div class="tool-page">
    <h2>工作區</h2>
    <p>資料只儲存在本機瀏覽器的 localStorage，不會自動上傳。</p>
    <input v-model="name" class="tool-input" placeholder="片段名稱" />
    <textarea v-model="content" class="tool-textarea" rows="8" placeholder="輸入要保存或傳遞的內容"></textarea>
    <div class="tool-actions"><button class="tool-button" @click="save">儲存片段</button><button class="tool-button" :disabled="!selected" @click="openJson">傳給 JSON Formatter</button></div>
    <select v-model="selectedId" class="tool-input"><option value="">選擇工作區片段</option><option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option></select>
    <pre v-if="selected" class="tool-output">{{ selected.content }}</pre>
    <button v-if="selected" class="tool-button" @click="remove(selected.id)">刪除片段</button>
  </div>
</template>
