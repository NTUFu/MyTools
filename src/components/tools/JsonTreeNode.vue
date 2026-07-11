<script setup lang="ts">
import { ref, computed } from 'vue'
import JsonTreeNode from './JsonTreeNode.vue'

interface Props {
  nodeKey: string | null
  value: unknown
  depth: number
  searchKeyword: string
  lineNumber: number
  expandAll: boolean
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  searchKeyword: '',
  lineNumber: 1,
  expandAll: false,
})

const userOpen = ref(props.depth < 2)

const valueType = computed(() => {
  if (props.value === null) return 'null'
  if (Array.isArray(props.value)) return 'array'
  return typeof props.value as 'object' | 'string' | 'number' | 'boolean'
})

const isExpandable = computed(() => valueType.value === 'object' || valueType.value === 'array')

const childEntries = computed((): { key: string; value: unknown }[] => {
  if (valueType.value === 'array') {
    return (props.value as unknown[]).map((v, i) => ({ key: String(i), value: v }))
  }
  if (valueType.value === 'object') {
    return Object.entries(props.value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }))
  }
  return []
})

const childCount = computed(() => childEntries.value.length)

const kw = computed(() => props.searchKeyword.trim().toLowerCase())

// Whether this node or any descendant matches the search keyword
const selfMatches = computed(() => {
  if (!kw.value) return false
  const keyMatch = props.nodeKey !== null && props.nodeKey.toLowerCase().includes(kw.value)
  const valueMatch = !isExpandable.value && String(props.value).toLowerCase().includes(kw.value)
  return keyMatch || valueMatch
})

// Build display segments with highlight
const highlight = (text: string): { text: string; mark: boolean }[] => {
  if (!kw.value) return [{ text, mark: false }]
  const lc = text.toLowerCase()
  const result: { text: string; mark: boolean }[] = []
  let pos = 0
  while (pos < text.length) {
    const found = lc.indexOf(kw.value, pos)
    if (found === -1) {
      result.push({ text: text.slice(pos), mark: false })
      break
    }
    if (found > pos) result.push({ text: text.slice(pos, found), mark: false })
    result.push({ text: text.slice(found, found + kw.value.length), mark: true })
    pos = found + kw.value.length
  }
  return result
}

const keySegments = computed(() => props.nodeKey !== null ? highlight(props.nodeKey) : [])

const primitiveColor = computed(() => {
  switch (valueType.value) {
    case 'string': return '#0550ae'
    case 'number': return '#cf222e'
    case 'boolean': return '#8250df'
    case 'null': return '#57606a'
    default: return '#24292f'
  }
})

const formattedPrimitiveValue = computed(() => {
  if (valueType.value === 'string') return `"${String(props.value)}"`
  return String(props.value)
})

const primitiveSegments = computed((): { text: string; mark: boolean }[] => {
  const full = formattedPrimitiveValue.value
  return highlight(full)
})

const collapsedPreview = computed(() => {
  if (valueType.value === 'array') return `[…] (${childCount.value} 項)`
  if (valueType.value === 'object') return `{…} (${childCount.value} 個屬性)`
  return ''
})

// Recursively check if a subtree (including its key) contains the keyword
const hasMatchAnywhere = (value: unknown, key: string | null, keyword: string): boolean => {
  if (key !== null && key.toLowerCase().includes(keyword)) return true
  if (value === null || typeof value !== 'object') {
    return String(value).toLowerCase().includes(keyword)
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).some((v) => hasMatchAnywhere(v, null, keyword))
  }
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => hasMatchAnywhere(v, k, keyword))
}

const hasDescendantMatch = computed((): boolean => {
  if (!kw.value || !isExpandable.value) return false
  return childEntries.value.some((entry) =>
    hasMatchAnywhere(entry.value, valueType.value === 'array' ? null : entry.key, kw.value)
  )
})

// When a search is active, force open if this node or any descendant matches.
// Otherwise, honour the user's manual toggle state.
const shouldBeOpen = computed(() => {
  if (props.expandAll) return true
  if (kw.value && (selfMatches.value || hasDescendantMatch.value)) return true
  return userOpen.value
})

const toggleOpen = () => {
  userOpen.value = !userOpen.value
}

// Count how many lines a value occupies in JSON.stringify(v, null, 2)
const subtreeLineCount = (value: unknown): number => {
  if (value === null || typeof value !== 'object') return 1
  const children: unknown[] = Array.isArray(value)
    ? (value as unknown[])
    : Object.values(value as Record<string, unknown>)
  // 1 opening line + each child's lines + 1 closing line
  return 1 + children.reduce((sum: number, v: unknown) => sum + subtreeLineCount(v), 0) + 1
}

// Map from child entry.key → its line number in formatted JSON
const childLineNumbers = computed((): Record<string, number> => {
  const result: Record<string, number> = {}
  let line = props.lineNumber + 1 // children start one line after this node's own line
  for (const entry of childEntries.value) {
    result[entry.key] = line
    line += subtreeLineCount(entry.value)
  }
  return result
})
</script>

<template>
  <div :style="{ paddingLeft: depth === 0 ? '0' : '18px' }">
    <div
      style="display: flex; align-items: baseline; gap: 2px; font-family: Consolas, monospace; font-size: 13px; line-height: 1.75; cursor: default; user-select: none"
      :style="{ backgroundColor: selfMatches ? '#fff9c4' : 'transparent' }"
    >
      <!-- Line number -->
      <span
        style="flex-shrink: 0; width: 40px; text-align: right; padding-right: 10px; color: #9ca3af; font-size: 12px; border-right: 1px solid #e5e7eb; margin-right: 6px; user-select: none"
      >{{ lineNumber }}</span>

      <!-- Toggle arrow -->
      <span
        v-if="isExpandable"
        @click="toggleOpen"
        style="flex-shrink: 0; width: 16px; cursor: pointer; color: #57606a; font-size: 11px"
      >{{ shouldBeOpen ? '▼' : '▶' }}</span>
      <span v-else style="flex-shrink: 0; width: 16px" />

      <!-- Key -->
      <span v-if="nodeKey !== null">
        <span style="color: #953800">
          <span
            v-for="(seg, i) in keySegments"
            :key="i"
            :style="{ background: seg.mark ? '#fff176' : undefined, borderRadius: seg.mark ? '2px' : undefined }"
          >{{ seg.text }}</span>
        </span>
        <span style="color: #57606a">: </span>
      </span>

      <!-- Expandable summary when collapsed -->
      <span
        v-if="isExpandable && !shouldBeOpen"
        @click="toggleOpen"
        style="color: #57606a; cursor: pointer"
      >{{ collapsedPreview }}</span>

      <!-- Opening bracket when open -->
      <span v-if="isExpandable && shouldBeOpen" style="color: #57606a">
        {{ valueType === 'array' ? '[' : '{' }}
      </span>

      <!-- Primitive value -->
      <span v-if="!isExpandable" :style="{ color: primitiveColor }">
        <span
          v-for="(seg, i) in primitiveSegments"
          :key="i"
          :style="{ background: seg.mark ? '#fff176' : undefined, borderRadius: seg.mark ? '2px' : undefined }"
        >{{ seg.text }}</span>
      </span>
    </div>

    <!-- Children -->
    <div v-if="isExpandable && shouldBeOpen">
      <JsonTreeNode
        v-for="(entry) in childEntries"
        :key="entry.key"
        :nodeKey="valueType === 'array' ? null : entry.key"
        :value="entry.value"
        :depth="depth + 1"
        :searchKeyword="searchKeyword"
        :lineNumber="childLineNumbers[entry.key]"
        :expandAll="expandAll"
      />
      <!-- Closing bracket -->
      <div style="display: flex; align-items: baseline; font-family: Consolas, monospace; font-size: 13px; line-height: 1.75; color: #57606a">
        <span style="flex-shrink: 0; width: 40px; text-align: right; padding-right: 10px; color: #9ca3af; font-size: 12px; border-right: 1px solid #e5e7eb; margin-right: 6px; user-select: none">
          {{ lineNumber + subtreeLineCount(value) - 1 }}
        </span>
        <span style="padding-left: 22px">{{ valueType === 'array' ? ']' : '}' }}</span>
      </div>
    </div>
  </div>
</template>
