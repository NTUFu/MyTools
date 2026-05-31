import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  clearHistoryItems as clearPersistedHistoryItems,
  deleteHistoryItem as removePersistedHistoryItem,
  getHistoryItems,
  saveHistoryItem as savePersistedHistoryItem,
  subscribeHistoryUpdated,
  type ConversionHistoryDraft,
  type ConversionHistoryItem,
} from '../utils/historyStore'

export const useHistoryStore = defineStore('history', () => {
  const items = ref<ConversionHistoryItem[]>(getHistoryItems())

  const historyItems = computed(() => items.value)

  const refresh = () => {
    items.value = getHistoryItems()
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

  subscribeHistoryUpdated(refresh)

  return {
    historyItems,
    refresh,
    saveHistoryItem,
    deleteHistoryItem,
    clearHistoryItems,
  }
})
