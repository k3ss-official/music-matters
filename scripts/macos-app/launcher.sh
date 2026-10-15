#!/usr/bin/env bash
# Music Matters.app launcher — starts local FastAPI (serving frontend/dist) and opens UI.
set -uo pipefail

# Finder / LaunchServices provides a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
# Prepend Apple Silicon & Intel Homebrew paths and user-local bin so ffmpeg, fpcalc,
# python3, node, and conda are always discoverable.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$HOME/.local/bin:$PATH"

HERE="$(cd "$(dirname "$0")" && pwd)"
RESOURCES="$(cd "$HERE/../Resources" && pwd)"
URL="http://127.0.0.1:8010"
HEALTH="$URL/api/health"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/Music Matters.log"
SUP_DIR="$HOME/Library/Application Support/Music Matters"
PID_FILE="$SUP_DIR/uvicorn.pid"

mkdir -p "$LOG_DIR" "$SUP_DIR"

alert() {
    /usr/bin/osascript -e "display alert \"Music Matters\" message \"$1\" as critical" >/dev/null 2>&1 || true
}

open_ui() {
    local chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    local edge="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    local brave="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    if [ -x "$chrome" ]; then
        "$chrome" --app="$URL" >/dev/null 2>&1 &
    elif [ -x "$edge" ]; then
        "$edge" --app="$URL" >/dev/null 2>&1 &
    elif [ -x "$brave" ]; then
        "$brave" --app="$URL" >/dev/null 2>&1 &
    else
        open "$URL"
    fi
}

# Already running and healthy -> just focus/open a window.
if curl -sf "$HEALTH" >/dev/null 2>&1; then
    open_ui
    exit 0
fi

# Read repo_path while preserving spaces in directory names (only strip CR/LF).
if [ ! -f "$RESOURCES/repo_path" ]; then
    alert "Repository path missing inside app bundle. Re-run ./scripts/install-macos.sh from your music-matters clone."
    exit 1
fi
REPO="$(tr -d '\r\n' < "$RESOURCES/repo_path")"
if [ -z "$REPO" ] || [ ! -d "$REPO/backend/app" ]; then
    alert "Repository not found at:
${REPO:-<empty>}

If you moved the clone, run ./scripts/install-macos.sh again."
    exit 1
fi

# shellcheck disable=SC1091
source "$REPO/scripts/lib-env.sh"

if ! PY="$(mm_find_python "$REPO")"; then
    alert "Python environment not found. Run ./scripts/install-macos.sh inside $REPO."
    exit 1
fi

if [ ! -f "$REPO/frontend/dist/index.html" ]; then
    alert "Built UI missing ($REPO/frontend/dist). Run ./scripts/install-macos.sh inside $REPO."
    exit 1
fi

# If port 8010 is held by a stale/unresponsive process (since health check above failed), clean it up.
STALE_PIDS="$(lsof -ti tcp:8010 2>/dev/null || true)"
if [ -n "$STALE_PIDS" ]; then
    echo "$STALE_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 0.5
fi

{
    echo ""
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') — starting Music Matters ==="
    echo "REPO=$REPO"
    echo "PY=$PY"
    echo "PATH=$PATH"
} >>"$LOG"

cd "$REPO/backend" || exit 1
export MM_APP_MODE=1
export PYTHONPATH="$REPO/backend${PYTHONPATH:+:$PYTHONPATH}"

nohup "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --log-level info >>"$LOG" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

# Wait up to 90s (first import of torch/librosa can be slow on cold disk).
for _ in $(seq 1 180); do
    if curl -sf "$HEALTH" >/dev/null 2>&1; then
        open_ui
        exit 0
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi
    sleep 0.5
done

alert "Server failed to start on 127.0.0.1:8010. Check $LOG"
open -a Console "$LOG" 2>/dev/null || true
exit 1
