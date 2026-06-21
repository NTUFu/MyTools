#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="python_api/.venv"
PYTHON_BIN="python_api/.venv/bin/python"
PYTHON_CMD=""

ask_yes_no() {
  local prompt="$1"
  local answer=""

  while true; do
    read -r -p "$prompt [y/N]: " answer
    case "$answer" in
      y|Y|yes|YES)
        return 0
        ;;
      n|N|no|NO|"")
        return 1
        ;;
      *)
        echo "請輸入 y 或 n。"
        ;;
    esac
  done
}

try_auto_install_python() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi

  if ! command -v brew >/dev/null 2>&1; then
    return 1
  fi

  if ! ask_yes_no "[setup] 未找到 Python 3.10+，是否自動用 Homebrew 安裝 python@3.12？"; then
    return 1
  fi

  echo "[setup] 安裝 python@3.12（可能需要幾分鐘）..."
  brew install python@3.12

  if command -v python3.12 >/dev/null 2>&1 && is_python_compatible python3.12; then
    PYTHON_CMD="python3.12"
    return 0
  fi

  local brew_prefix=""
  brew_prefix="$(brew --prefix python@3.12 2>/dev/null || true)"
  if [[ -n "$brew_prefix" && -x "$brew_prefix/bin/python3.12" ]] && is_python_compatible "$brew_prefix/bin/python3.12"; then
    PYTHON_CMD="$brew_prefix/bin/python3.12"
    return 0
  fi

  return 1
}

is_python_compatible() {
  local candidate="$1"
  "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
}

select_python_cmd() {
  if [[ -n "${MYTOOLS_PYTHON:-}" ]]; then
    if ! command -v "$MYTOOLS_PYTHON" >/dev/null 2>&1; then
      echo "[error] MYTOOLS_PYTHON=$MYTOOLS_PYTHON 找不到可執行檔。"
      exit 1
    fi
    if ! is_python_compatible "$MYTOOLS_PYTHON"; then
      echo "[error] MYTOOLS_PYTHON=$MYTOOLS_PYTHON 版本小於 3.10，無法使用 MarkItDown。"
      exit 1
    fi
    PYTHON_CMD="$MYTOOLS_PYTHON"
    return
  fi

  local candidates=(python3.12 python3.11 python3.10)
  for cmd in "${candidates[@]}"; do
    if command -v "$cmd" >/dev/null 2>&1 && is_python_compatible "$cmd"; then
      PYTHON_CMD="$cmd"
      return
    fi
  done

  if [[ -t 0 ]] && try_auto_install_python; then
    return
  fi

  echo "[error] 找不到 Python 3.10+，無法啟動本地 MarkItDown API。"
  echo "[hint] 請先安裝 Python 3.10 以上（例如：brew install python@3.12）。"
  echo "[hint] 安裝後可用 MYTOOLS_PYTHON 指定版本，例如：MYTOOLS_PYTHON=python3.12 npm run dev:local"
  exit 1
}

ensure_python_deps() {
  if "$PYTHON_BIN" -c "import fastapi, uvicorn, markitdown" >/dev/null 2>&1; then
    return
  fi

  echo "[setup] 偵測到缺少 Python 依賴，安裝中..."
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r python_api/requirements.txt
}

select_python_cmd

if [[ -x "$PYTHON_BIN" ]] && ! "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
then
  echo "[setup] 既有 venv 使用 Python < 3.10，重新建立中..."
  rm -rf "$VENV_DIR"
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "[setup] 使用 $PYTHON_CMD 建立 python_api/.venv..."
  "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

ensure_python_deps

if [[ "${1:-}" == "--setup-only" ]]; then
  echo "[setup] Python API 環境已就緒。"
  exit 0
fi

echo "[start] 啟動 Vite + Python API..."
exec npx concurrently -k -n WEB,API -c blue,green "npm:dev" "npm:dev:api"
