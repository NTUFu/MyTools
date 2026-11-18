import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pythonApiDir = path.join(rootDir, 'python_api')
const venvDir = path.join(pythonApiDir, '.venv')
const venvPython = path.join(
  venvDir,
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
)

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    ...options,
  })

  if (result.error) {
    throw result.error
  }
  return result
}

const isSupportedPython = (command, args) => {
  try {
    const result = run(command, [...args, '--version'])
    if (result.status !== 0) return false
    const version = `${result.stdout ?? ''} ${result.stderr ?? ''}`.match(/Python\s+(\d+)\.(\d+)/i)
    return Boolean(version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 10)))
  } catch {
    return false
  }
}

const findPython = () => {
  const candidates = process.env.MYTOOLS_PYTHON
    ? [{ command: process.env.MYTOOLS_PYTHON, args: [] }]
    : [
        { command: 'py', args: ['-3'] },
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ]

  return candidates.find(({ command, args }) => isSupportedPython(command, args)) ?? null
}

const python = findPython()
if (!python) {
  console.error('[error] 找不到 Python 3.10+，無法啟動本機 AI / MarkItDown API。')
  console.error('[hint] 安裝 Python 3.10 以上，或設定 MYTOOLS_PYTHON 指向 Python 執行檔。')
  process.exit(1)
}

if (!existsSync(venvPython)) {
  console.log('[setup] 建立 Python 虛擬環境...')
  const result = run(python.command, [...python.args, '-m', 'venv', venvDir], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const dependencies = run(venvPython, [
  '-c',
  'import fastapi, uvicorn, markitdown, httpx',
])
if (dependencies.status !== 0) {
  console.log('[setup] 安裝 Python API 依賴...')
  const result = run(venvPython, ['-m', 'pip', 'install', '-r', path.join(pythonApiDir, 'requirements.txt')], {
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const vite = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(vite)) {
  console.error('[error] 找不到 Vite，請先執行 npm install。')
  process.exit(1)
}

console.log('[start] 啟動 Vite 與本機 Python API...')
const children = [
  spawn(process.execPath, [vite], { cwd: rootDir, stdio: 'inherit' }),
  spawn(venvPython, ['-m', 'uvicorn', 'app:app', '--app-dir', pythonApiDir, '--host', '127.0.0.1', '--port', '8000', '--reload'], {
    cwd: rootDir,
    stdio: 'inherit',
  }),
]

let stopping = false
const stopChildren = (except, exitCode) => {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child !== except && child.exitCode === null) child.kill()
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`[error] 無法啟動子程序：${error.message}`)
    stopChildren(child, 1)
  })
  child.on('exit', (code) => {
    if (!stopping) stopChildren(child, code ?? 1)
  })
}

process.on('SIGINT', () => stopChildren(null, 130))
process.on('SIGTERM', () => stopChildren(null, 143))
