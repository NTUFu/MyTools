<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { aiIsReady, generateAiText, refreshAiRuntimeConfig } from '../../utils/aiClient'
import { isLocalAiAvailable } from '../../utils/localAi'

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
const aiIsLocal = isLocalAiAvailable()
const aiDescription = ref('')
const aiCommitDraft = ref('')
const aiError = ref('')
const aiAction = ref(false)
let activeAiRequest: AbortController | null = null

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

const clearAiSuggestion = () => {
  const controller = activeAiRequest
  activeAiRequest = null
  aiAction.value = false
  aiCommitDraft.value = ''
  aiError.value = ''
  controller?.abort()
}

const requestCommitAi = async () => {
  refreshAiRuntimeConfig()
  aiError.value = ''
  aiCommitDraft.value = ''
  if (!aiDescription.value.trim()) {
    aiError.value = '請先描述變更內容。'
    return
  }

  const controller = new AbortController()
  activeAiRequest = controller
  aiAction.value = true
  try {
    const result = await generateAiText({
      tool: 'git-generators',
      action: 'commit-suggestion',
      prompt: '根據變更摘要產生一行 Conventional Commit subject。type 限 feat、fix、docs、refactor、test、chore；scope 可省略。只輸出 subject，不要 Markdown 或說明，不要加入 body 或 footer。',
      context: `變更摘要：\n${aiDescription.value.trim()}\n\n優先使用的 type：${commitType.value}`,
      signal: controller.signal,
    })
    const candidate = result.text.trim().split(/\r?\n/)[0]?.replace(/^`+|`+$/g, '').trim() ?? ''
    if (/^(feat|fix|docs|refactor|test|chore)(\([^)]+\))?: .+$/i.test(candidate)) {
      aiCommitDraft.value = candidate
    } else {
      aiError.value = 'AI 回覆不是有效的 Conventional Commit subject，原產生器內容未變更。'
    }
  } catch (error) {
    if (activeAiRequest === controller) {
      aiError.value = error instanceof Error
        ? error.name === 'AbortError' ? '已取消 AI 請求。' : error.message
        : 'AI 請求失敗。'
    }
  } finally {
    if (activeAiRequest === controller) {
      activeAiRequest = null
      aiAction.value = false
    }
  }
}

const applyAiCommitDraft = () => {
  const match = aiCommitDraft.value.match(/^(feat|fix|docs|refactor|test|chore)(?:\(([^)]+)\))?: (.+)$/i)
  if (!match) return
  commitType.value = match[1]!.toLowerCase()
  commitScope.value = match[2] ?? ''
  commitDescription.value = match[3]!
}

const cancelCommitAi = () => activeAiRequest?.abort()

onBeforeUnmount(clearAiSuggestion)
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
      <select v-model="commitType" @change="clearAiSuggestion"><option>feat</option><option>fix</option><option>docs</option><option>refactor</option><option>test</option><option>chore</option></select>
      <input v-model="commitScope" class="tool-input" style="max-width: 180px" placeholder="scope（選填）" />
    </div>
    <input v-model="commitDescription" class="tool-input" placeholder="描述變更內容" />
    <pre class="tool-output">{{ generatedCommit }}</pre>
    <button class="tool-button" @click="copy(generatedCommit)">複製 Commit</button>
    <section v-if="aiIsLocal" style="display: grid; gap: 10px; padding: 14px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff">
      <div>
        <strong>AI Commit 助手</strong>
        <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.5">只傳送你輸入的變更摘要與所選 type；不會讀取 Git 狀態或執行 Git 操作。AI subject 是獨立草稿，需手動套用。</p>
      </div>
      <textarea v-model="aiDescription" class="tool-textarea" rows="2" maxlength="4000" placeholder="描述這次變更的目的與內容" @input="clearAiSuggestion" />
      <div class="tool-actions">
        <button class="tool-button tool-button--compact" type="button" :disabled="!aiIsReady || aiAction" @click="requestCommitAi">
          {{ aiAction ? '產生中…' : '產生 Commit 建議' }}
        </button>
        <button v-if="aiAction" class="tool-button tool-button--compact" type="button" @click="cancelCommitAi">取消請求</button>
        <RouterLink v-if="!aiIsReady" to="/settings/ai">前往 AI 設定</RouterLink>
      </div>
      <p v-if="aiError" class="tool-error" role="status">{{ aiError }}</p>
      <div v-if="aiCommitDraft" style="display: grid; gap: 8px">
        <pre class="tool-output">{{ aiCommitDraft }}</pre>
        <button class="tool-button tool-button--compact" type="button" @click="applyAiCommitDraft">將建議帶入 Commit 欄位</button>
      </div>
    </section>
  </div>
</template>
