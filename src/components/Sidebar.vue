<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Bars3Icon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import { useUiStore } from '../stores/ui'

interface NavItem {
  id: number
  text: string
  shortText: string
  path?: string
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { id: 1, text: '主控台', shortText: '主', path: '/' },
  {
    id: 2,
    text: '我的工具',
    shortText: '工',
    children: [
      { id: 21, text: 'Base64', shortText: 'B', path: '/tools/base64' },
      { id: 22, text: 'JSON Formatter', shortText: 'J', path: '/tools/json-formatter' },
      { id: 23, text: 'HTML Previewer', shortText: 'H', path: '/tools/html-previewer' },
      { id: 24, text: 'Markdown Previewer', shortText: 'M', path: '/tools/markdown-previewer' },
      { id: 25, text: 'QRCode Previewer', shortText: 'Q', path: '/tools/qrious' },
      { id: 26, text: 'JWT Decoder', shortText: 'J', path: '/tools/jwt-decoder' },
      { id: 27, text: 'XSLT Compare', shortText: 'X', path: '/tools/xslt-diff' },
      { id: 28, text: 'SQL Compare', shortText: 'C', path: '/tools/sql-compare' },
      { id: 29, text: 'SQL Practice', shortText: 'S', path: '/tools/sql-practice' },
      { id: 30, text: 'CSV/XLSX Parser', shortText: 'C', path: '/tools/csv-xlsx-to-json' },
      { id: 31, text: 'Planner Gantt', shortText: 'P', path: '/tools/planner-gantt' },
      { id: 32, text: 'Hash Generator', shortText: 'H', path: '/tools/hash-generator' },
      { id: 33, text: 'Text Diff', shortText: 'D', path: '/tools/text-diff' },
      { id: 34, text: 'URL Toolkit', shortText: 'U', path: '/tools/url-toolkit' },
      { id: 35, text: 'Regex Tester', shortText: 'R', path: '/tools/regex-tester' },
    ],
  },
  { id: 3, text: 'History', shortText: 'H', path: '/history' },
]

const route = useRoute()
const uiStore = useUiStore()
const { isSidebarCollapsed } = storeToRefs(uiStore)
const expandedItemIds = ref<number[]>([2])
const appVersion = __APP_VERSION__

const toggleSidebar = () => {
  uiStore.toggleSidebar()
}

const itemHasActiveChild = (item: NavItem) => {
  if (!item.children) {
    return false
  }

  return item.children.some((child) => route.path === child.path)
}

const isExpanded = (itemId: number) => expandedItemIds.value.includes(itemId)

const toggleExpanded = (itemId: number) => {
  if (isExpanded(itemId)) {
    expandedItemIds.value = expandedItemIds.value.filter((id) => id !== itemId)
    return
  }

  expandedItemIds.value = [...expandedItemIds.value, itemId]
}

const navContainerClass = computed(() => ['sidebar', { collapsed: isSidebarCollapsed.value }])
</script>

<template>
  <nav :class="navContainerClass">
    <div class="sidebar-header">
      <button class="toggle-button" @click="toggleSidebar" type="button" aria-label="切換側邊欄">
        <Bars3Icon style="width: 20px; height: 20px" />
      </button>
    </div>

    <ul class="nav-list">
      <li v-for="item in navItems" :key="item.id" class="nav-item">
        <RouterLink
          v-if="item.path"
          :to="item.path"
          class="nav-link-content"
          active-class="active"
          :class="{ active: itemHasActiveChild(item) }"
          :exact-active-class="item.path === '/' ? 'active' : ''"
        >
          <span v-if="isSidebarCollapsed" class="text-collapsed">{{ item.shortText }}</span>
          <span v-else class="text">{{ item.text }}</span>
        </RouterLink>

        <div
          v-else
          class="nav-link-content"
          :class="{ active: itemHasActiveChild(item) }"
          @click="toggleExpanded(item.id)"
        >
          <span v-if="isSidebarCollapsed" class="text-collapsed">{{ item.shortText }}</span>
          <span v-else class="text">{{ item.text }}</span>
          <span v-if="item.children && !isSidebarCollapsed" class="submenu-toggle">
            <ChevronUpIcon v-if="isExpanded(item.id)" style="width: 16px; height: 16px" />
            <ChevronDownIcon v-else style="width: 16px; height: 16px" />
          </span>
        </div>

        <ul v-if="item.children && isExpanded(item.id)" class="sub-menu">
          <li v-for="child in item.children" :key="child.id" class="nav-item sub-item">
            <RouterLink
              :to="child.path || '/'"
              class="nav-link-content sub-link"
              active-class="active"
            >
              <span class="text">{{ child.text }}</span>
            </RouterLink>
          </li>
        </ul>
      </li>
    </ul>

    <div class="sidebar-footer">
      <span v-if="!isSidebarCollapsed" class="sidebar-version">版本 {{ appVersion }}</span>
      <a
        href="https://github.com/fujimmy/MyTools/issues"
        target="_blank"
        rel="noopener noreferrer"
        class="issue-button"
        title="回報問題"
        data-testid="issue-report-button"
      >
        <span>{{ isSidebarCollapsed ? '回報' : '回報 Issue' }}</span>
      </a>
    </div>
  </nav>
</template>
