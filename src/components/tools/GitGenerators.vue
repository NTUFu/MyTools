<script setup lang="ts">
import { computed, ref } from 'vue'

const gitignoreTemplates: Record<string, string> = {
  Node: 'node_modules/\ndist/\n.env\n.env.*\ncoverage/\n',
  Vue: 'node_modules/\ndist/\n.env\n.env.*\n.vscode/*.code-snippets\n',
  Python: '__pycache__/\n*.py[cod]\n.venv/\n.env\n.pytest_cache/\n',
  Windows: 'Thumbs.db\nDesktop.ini\n',
}
const selectedTemplates = ref(['Node', 'Vue'])
const commitType = ref('feat')
const commitScope = ref('')
const commitDescription = ref('')
const generatedCommit = computed(() => {
  const scope = commitScope.value.trim() ? `(${commitScope.value.trim()})` : ''
  return `${commitType.value}${scope}: ${commitDescription.value.trim() || 'describe the change'}`
})
const generatedGitignore = computed(() =>
  Array.from(new Set(selectedTemplates.value.flatMap((name) => gitignoreTemplates[name]?.split('\n') ?? [])))
    .filter(Boolean)
    .join('\n') + '\n',
)
const copy = async (value: string) => navigator.clipboard.writeText(value)
</script>

<template>
  <div class="tool-page">
    <h2>Git Generators</h2>
    <h3>.gitignore Generator</h3>
    <div class="tool-actions">
      <label v-for="name in Object.keys(gitignoreTemplates)" :key="name">
        <input v-model="selectedTemplates" type="checkbox" :value="name" /> {{ name }}
      </label>
    </div>
    <pre class="tool-output">{{ generatedGitignore }}</pre>
    <button class="tool-button" @click="copy(generatedGitignore)">複製 .gitignore</button>
    <h3>Conventional Commit Generator</h3>
    <div class="tool-actions">
      <select v-model="commitType"><option>feat</option><option>fix</option><option>docs</option><option>refactor</option><option>test</option><option>chore</option></select>
      <input v-model="commitScope" class="tool-input" style="max-width: 180px" placeholder="scope（選填）" />
    </div>
    <input v-model="commitDescription" class="tool-input" placeholder="描述變更內容" />
    <pre class="tool-output">{{ generatedCommit }}</pre>
    <button class="tool-button" @click="copy(generatedCommit)">複製 Commit</button>
  </div>
</template>
