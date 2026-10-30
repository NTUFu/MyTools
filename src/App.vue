<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import Sidebar from './components/Sidebar.vue'
import { useUiStore } from './stores/ui'
import { recordWebsiteVisit } from './utils/historyStore'

const uiStore = useUiStore()
const { isSidebarCollapsed } = storeToRefs(uiStore)

onMounted(() => {
  recordWebsiteVisit()
})
</script>

<template>
  <div class="app-container">
    <div :class="['main-wrapper', { collapsed: isSidebarCollapsed }]">
      <Sidebar />
      <main class="content-area">
        <RouterView />
      </main>
    </div>
  </div>
</template>
