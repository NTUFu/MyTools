<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

interface PomodoroSettings {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
  autoStartBreak: boolean
  autoStartFocus: boolean
  enableDesktopNotification: boolean
  enableSoundAlert: boolean
  focusLabel: string
  shortBreakLabel: string
  longBreakLabel: string
}

const SETTINGS_STORAGE_KEY = 'mytools:pomodoro-settings'

const settings = reactive<PomodoroSettings>({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  enableDesktopNotification: true,
  enableSoundAlert: true,
  focusLabel: '專注',
  shortBreakLabel: '短休息',
  longBreakLabel: '長休息',
})

const timerMode = ref<TimerMode>('focus')
const secondsLeft = ref(25 * 60)
const isRunning = ref(false)
const completedFocusSessions = ref(0)
const focusSessionsInCycle = ref(0)
const errorMessage = ref('')

let timerId: ReturnType<typeof setInterval> | null = null
let titleResetTimer: ReturnType<typeof setTimeout> | null = null
const originalTitle = typeof document !== 'undefined' ? document.title : ''

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, Math.trunc(value)))
}

const minutesToSeconds = (minutes: number) => clampNumber(minutes, 1, 180) * 60

const modeLabel = computed(() => {
  if (timerMode.value === 'focus') {
    return settings.focusLabel || '專注'
  }

  if (timerMode.value === 'shortBreak') {
    return settings.shortBreakLabel || '短休息'
  }

  return settings.longBreakLabel || '長休息'
})

const modeDurationSeconds = computed(() => {
  if (timerMode.value === 'focus') {
    return minutesToSeconds(settings.focusMinutes)
  }

  if (timerMode.value === 'shortBreak') {
    return minutesToSeconds(settings.shortBreakMinutes)
  }

  return minutesToSeconds(settings.longBreakMinutes)
})

const progressPercent = computed(() => {
  const total = modeDurationSeconds.value
  if (total <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, ((total - secondsLeft.value) / total) * 100))
})

const displayTime = computed(() => {
  const minutes = Math.floor(secondsLeft.value / 60)
  const seconds = secondsLeft.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const cycleSummary = computed(() => {
  return `${focusSessionsInCycle.value} / ${settings.sessionsBeforeLongBreak}`
})

const saveSettings = () => {
  const payload: PomodoroSettings = {
    focusMinutes: clampNumber(settings.focusMinutes, 1, 180),
    shortBreakMinutes: clampNumber(settings.shortBreakMinutes, 1, 120),
    longBreakMinutes: clampNumber(settings.longBreakMinutes, 1, 180),
    sessionsBeforeLongBreak: clampNumber(settings.sessionsBeforeLongBreak, 1, 12),
    autoStartBreak: Boolean(settings.autoStartBreak),
    autoStartFocus: Boolean(settings.autoStartFocus),
    enableDesktopNotification: Boolean(settings.enableDesktopNotification),
    enableSoundAlert: Boolean(settings.enableSoundAlert),
    focusLabel: settings.focusLabel.trim() || '專注',
    shortBreakLabel: settings.shortBreakLabel.trim() || '短休息',
    longBreakLabel: settings.longBreakLabel.trim() || '長休息',
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload))
}

const loadSettings = () => {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PomodoroSettings>
    settings.focusMinutes = clampNumber(Number(parsed.focusMinutes), 1, 180)
    settings.shortBreakMinutes = clampNumber(Number(parsed.shortBreakMinutes), 1, 120)
    settings.longBreakMinutes = clampNumber(Number(parsed.longBreakMinutes), 1, 180)
    settings.sessionsBeforeLongBreak = clampNumber(Number(parsed.sessionsBeforeLongBreak), 1, 12)
    settings.autoStartBreak = Boolean(parsed.autoStartBreak)
    settings.autoStartFocus = Boolean(parsed.autoStartFocus)
    settings.enableDesktopNotification = parsed.enableDesktopNotification !== false
    settings.enableSoundAlert = parsed.enableSoundAlert !== false
    settings.focusLabel = String(parsed.focusLabel || '專注')
    settings.shortBreakLabel = String(parsed.shortBreakLabel || '短休息')
    settings.longBreakLabel = String(parsed.longBreakLabel || '長休息')
    secondsLeft.value = minutesToSeconds(settings.focusMinutes)
  } catch {
    errorMessage.value = '讀取蕃茄鐘設定失敗，已使用預設值。'
  }
}

const clearTimer = () => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

const clearTitleResetTimer = () => {
  if (titleResetTimer) {
    clearTimeout(titleResetTimer)
    titleResetTimer = null
  }
}

const playAlertBeep = async () => {
  if (!settings.enableSoundAlert) {
    return
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    return
  }

  try {
    const context = new AudioContextCtor()
    const createSingleBeep = (startAt: number) => {
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gainNode.gain.setValueAtTime(0.0001, startAt)
      gainNode.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28)

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.3)
    }

    const now = context.currentTime
    createSingleBeep(now)
    createSingleBeep(now + 0.34)

    window.setTimeout(() => {
      void context.close()
    }, 900)
  } catch {
    // Ignore sound failures and keep timer flow uninterrupted.
  }
}

const notifyDesktop = async (title: string, body: string) => {
  if (!settings.enableDesktopNotification || !('Notification' in window)) {
    return
  }

  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    if (Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  } catch {
    // Ignore notification failures and keep timer flow uninterrupted.
  }
}

const flashDocumentTitle = (text: string) => {
  if (typeof document === 'undefined') {
    return
  }

  document.title = text
  clearTitleResetTimer()
  titleResetTimer = setTimeout(() => {
    document.title = originalTitle
    titleResetTimer = null
  }, 6000)
}

const notifyPhaseComplete = async (completedLabel: string, nextLabel: string) => {
  const title = `階段完成：${completedLabel}`
  const body = `下一階段：${nextLabel}`

  flashDocumentTitle(`⏰ ${completedLabel} 完成`)
  await Promise.all([notifyDesktop(title, body), playAlertBeep()])
}

const switchMode = (mode: TimerMode, autoStart = false) => {
  timerMode.value = mode
  secondsLeft.value = modeDurationSeconds.value
  isRunning.value = false

  if (autoStart) {
    startTimer()
  }
}

const handleTimerCompleted = () => {
  clearTimer()
  isRunning.value = false

  const completedLabel = modeLabel.value

  if (timerMode.value === 'focus') {
    completedFocusSessions.value += 1
    focusSessionsInCycle.value += 1

    if (focusSessionsInCycle.value >= settings.sessionsBeforeLongBreak) {
      focusSessionsInCycle.value = 0
      void notifyPhaseComplete(completedLabel, settings.longBreakLabel || '長休息')
      switchMode('longBreak', settings.autoStartBreak)
      return
    }

    void notifyPhaseComplete(completedLabel, settings.shortBreakLabel || '短休息')
    switchMode('shortBreak', settings.autoStartBreak)
    return
  }

  void notifyPhaseComplete(completedLabel, settings.focusLabel || '專注')
  switchMode('focus', settings.autoStartFocus)
}

const tick = () => {
  if (secondsLeft.value <= 1) {
    secondsLeft.value = 0
    handleTimerCompleted()
    return
  }

  secondsLeft.value -= 1
}

const startTimer = () => {
  errorMessage.value = ''
  if (isRunning.value) {
    return
  }

  if (secondsLeft.value <= 0) {
    secondsLeft.value = modeDurationSeconds.value
  }

  clearTimer()
  isRunning.value = true
  timerId = setInterval(tick, 1000)
}

const pauseTimer = () => {
  if (!isRunning.value) {
    return
  }

  isRunning.value = false
  clearTimer()
}

const resetCurrentMode = () => {
  pauseTimer()
  secondsLeft.value = modeDurationSeconds.value
}

const skipCurrentMode = () => {
  pauseTimer()

  if (timerMode.value === 'focus') {
    switchMode('shortBreak', false)
    return
  }

  switchMode('focus', false)
}

const applySettings = () => {
  errorMessage.value = ''

  settings.focusMinutes = clampNumber(settings.focusMinutes, 1, 180)
  settings.shortBreakMinutes = clampNumber(settings.shortBreakMinutes, 1, 120)
  settings.longBreakMinutes = clampNumber(settings.longBreakMinutes, 1, 180)
  settings.sessionsBeforeLongBreak = clampNumber(settings.sessionsBeforeLongBreak, 1, 12)
  settings.focusLabel = settings.focusLabel.trim() || '專注'
  settings.shortBreakLabel = settings.shortBreakLabel.trim() || '短休息'
  settings.longBreakLabel = settings.longBreakLabel.trim() || '長休息'

  secondsLeft.value = modeDurationSeconds.value
  saveSettings()

  if (settings.enableDesktopNotification && 'Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

const resetSession = () => {
  pauseTimer()
  timerMode.value = 'focus'
  secondsLeft.value = minutesToSeconds(settings.focusMinutes)
  completedFocusSessions.value = 0
  focusSessionsInCycle.value = 0
}

watch(
  () => ({ ...settings }),
  () => {
    saveSettings()
  },
  { deep: true },
)

loadSettings()

onBeforeUnmount(() => {
  clearTimer()
  clearTitleResetTimer()
  if (typeof document !== 'undefined') {
    document.title = originalTitle
  }
})
</script>

<template>
  <div class="pomodoro-page">
    <div class="pomodoro-shell">
      <div class="timer-panel">
        <div class="mode-chip">{{ modeLabel }}</div>
        <div class="time-text">{{ displayTime }}</div>

        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>

        <div class="summary-row">
          <span>已完成專注：{{ completedFocusSessions }} 次</span>
          <span>長休息循環：{{ cycleSummary }}</span>
        </div>

        <div class="button-row">
          <button class="muji-btn muji-btn-primary" @click="isRunning ? pauseTimer() : startTimer()">
            {{ isRunning ? '暫停' : '開始' }}
          </button>
          <button class="muji-btn" @click="resetCurrentMode">重置當前</button>
          <button class="muji-btn" @click="skipCurrentMode">略過</button>
          <button class="muji-btn" @click="resetSession">重設整輪</button>
        </div>
      </div>

      <div class="settings-panel">
        <h3>參數設定</h3>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div class="setting-grid">
          <label>
            <span>專注分鐘</span>
            <input v-model.number="settings.focusMinutes" type="number" min="1" max="180">
          </label>

          <label>
            <span>短休息分鐘</span>
            <input v-model.number="settings.shortBreakMinutes" type="number" min="1" max="120">
          </label>

          <label>
            <span>長休息分鐘</span>
            <input v-model.number="settings.longBreakMinutes" type="number" min="1" max="180">
          </label>

          <label>
            <span>幾次專注後長休息</span>
            <input v-model.number="settings.sessionsBeforeLongBreak" type="number" min="1" max="12">
          </label>

          <label>
            <span>專注標籤</span>
            <input v-model="settings.focusLabel" type="text" maxlength="20">
          </label>

          <label>
            <span>短休息標籤</span>
            <input v-model="settings.shortBreakLabel" type="text" maxlength="20">
          </label>

          <label>
            <span>長休息標籤</span>
            <input v-model="settings.longBreakLabel" type="text" maxlength="20">
          </label>
        </div>

        <div class="checkbox-row">
          <label><input v-model="settings.autoStartBreak" type="checkbox">休息自動開始</label>
          <label><input v-model="settings.autoStartFocus" type="checkbox">專注自動開始</label>
          <label><input v-model="settings.enableDesktopNotification" type="checkbox">啟用瀏覽器通知</label>
          <label><input v-model="settings.enableSoundAlert" type="checkbox">啟用提示音</label>
        </div>

        <div class="button-row">
          <button class="muji-btn muji-btn-primary" @click="applySettings">套用參數</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  color-scheme: light;
}

.pomodoro-page {
  padding: 20px;
}

.pomodoro-shell {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1fr);
  gap: 16px;
}

.timer-panel,
.settings-panel {
  background: #f6f2ea;
  border: 1px solid #d8cfbf;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 3px 10px rgba(78, 62, 44, 0.08);
}

.mode-chip {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e8ddca;
  color: #5c4c39;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.time-text {
  margin-top: 10px;
  font-size: clamp(44px, 8vw, 72px);
  line-height: 1;
  color: #3f3529;
  font-family: 'Avenir Next', 'Hiragino Mincho ProN', 'Noto Serif TC', serif;
  letter-spacing: 1px;
}

.progress-track {
  margin-top: 16px;
  height: 10px;
  border-radius: 999px;
  background: #ddd3c3;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #8f7a62, #b39a79);
  transition: width 0.3s ease;
}

.summary-row {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #6a5a46;
}

.settings-panel h3 {
  margin: 0 0 12px;
  font-weight: 600;
  color: #4b3f31;
}

.setting-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.setting-grid label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #5a4b3a;
}

.setting-grid input[type='number'],
.setting-grid input[type='text'] {
  height: 34px;
  border: 1px solid #cdbfa9;
  border-radius: 8px;
  padding: 0 10px;
  background: #fffdfa;
  color: #3f3529;
}

.checkbox-row {
  margin-top: 12px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  color: #5a4b3a;
  font-size: 13px;
}

.button-row {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.muji-btn {
  height: 34px;
  border: 1px solid #b7a58d;
  border-radius: 8px;
  background: #efe7da;
  color: #493e30;
  padding: 0 12px;
  cursor: pointer;
}

.muji-btn:hover {
  background: #e7dece;
}

.muji-btn-primary {
  background: #8f7a62;
  border-color: #7e6b57;
  color: #faf7f2;
}

.muji-btn-primary:hover {
  background: #7e6b57;
}

.error-text {
  margin: 0 0 10px;
  color: #9f2d22;
  background: #f9ece9;
  border: 1px solid #e3c0b9;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
}

@media (max-width: 920px) {
  .pomodoro-shell {
    grid-template-columns: 1fr;
  }
}
</style>
