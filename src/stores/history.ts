import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  clearHistoryItems as clearPersistedHistoryItems,
  clearWebsiteVisitHistoryItems as clearPersistedWebsiteVisitHistoryItems,
  deleteHistoryItem as removePersistedHistoryItem,
  deleteWebsiteVisitHistoryItem as removePersistedWebsiteVisitHistoryItem,
  getHistoryItems,
  getWebsiteVisitHistoryItems,
  saveHistoryItem as savePersistedHistoryItem,
  subscribeHistoryUpdated,
  type ConversionHistoryDraft,
  type ConversionHistoryItem,
  type WebsiteVisitHistoryItem,
} from '../utils/historyStore'

export const useHistoryStore = defineStore('history', () => {
  const items = ref<ConversionHistoryItem[]>(getHistoryItems())
  const websiteVisitItems = ref<WebsiteVisitHistoryItem[]>(getWebsiteVisitHistoryItems())

  const historyItems = computed(() => items.value)
  const websiteHistoryItems = computed(() => websiteVisitItems.value)

  const refresh = () => {
    items.value = getHistoryItems()
    websiteVisitItems.value = getWebsiteVisitHistoryItems()
  }

  const saveHistoryItem = (draft: ConversionHistoryDraft): ConversionHistoryItem => {
    const savedItem = savePersistedHistoryItem(draft)
    refresh()
    return savedItem
  }

  const deleteHistoryItem = (id: string) => {
    removePersistedHistoryItem(id)
    refresh()
  }

  const clearHistoryItems = () => {
    clearPersistedHistoryItems()
    items.value = []
  }

  const deleteWebsiteVisitHistoryItem = (id: string) => {
    removePersistedWebsiteVisitHistoryItem(id)
    refresh()
  }

  const clearWebsiteVisitHistoryItems = () => {
    clearPersistedWebsiteVisitHistoryItems()
    websiteVisitItems.value = []
  }

  subscribeHistoryUpdated(refresh)

  return {
    historyItems,
    websiteHistoryItems,
    refresh,
    saveHistoryItem,
    deleteHistoryItem,
    clearHistoryItems,
    deleteWebsiteVisitHistoryItem,
    clearWebsiteVisitHistoryItems,
  }
})
