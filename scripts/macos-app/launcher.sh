#!/bin/bash
# Executable inside ~/Applications/Music Matters.app/Contents/MacOS/
# Starts the local API (which also serves the built UI) and opens a window.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RESOURCES="$HERE/../Resources"
REPO="$(tr -d '[:space:]' < "$RESOURCES/repo_path")"
LOG_DIR="$HOME/Library/Logs"
SUPPORT="$HOME/Library/Application Support/Music Matters"
PIDFILE="$SUPPORT/uvicorn.pid"
LOG="$LOG_DIR/Music Matters.log"
PORT="${MM_PORT:-8010}"
URL="http://127.0.0.1:${PORT}"

mkdir -p "$LOG_DIR" "$SUPPORT"
touch "$LOG"

open_ui() {
    if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
        open -na "Google Chrome" --args --app="$URL" --new-window >/dev/null 2>&1 || open "$URL"
    elif [ -d "/Applications/Microsoft Edge.app" ]; then
        open -na "Microsoft Edge" --args --app="$URL" --new-window >/dev/null 2>&1 || open "$URL"
    elif [ -d "/Applications/Brave Browser.app" ]; then
        open -na "Brave Browser" --args --app="$URL" --new-window >/dev/null 2>&1 || open "$URL"
    else
        open "$URL"
    fi
}

already_up() {
    curl -sf "$URL/api/health" >/dev/null 2>&1
}

if [ ! -d "$REPO" ]; then
    osascript -e "display alert \"Music Matters\" message \"Repo not found at $REPO. Re-run scripts/install-macos.sh from a clone.\" as critical" >/dev/null 2>&1 || true
    exit 1
fi

if already_up; then
    open_ui
    exit 0
fi

if [ -f "$PIDFILE" ]; then
    oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "${oldpid:-}" ] && kill -0 "$oldpid" 2>/dev/null; then
        # Process exists but health failed — give it a moment
        for _ in 1 2 3 4 5; do
            already_up && open_ui && exit 0
            sleep 1
        done
    fi
    rm -f "$PIDFILE"
fi

# shellcheck disable=SC1091
source "$REPO/scripts/lib-env.sh"
mm_resolve_python "$REPO"

if ! command -v "$MM_PYTHON" >/dev/null 2>&1; then
    osascript -e "display alert \"Music Matters\" message \"Python 3.11+ not found. Install Python or create the music-matters conda env, then re-run install-macos.sh.\" as critical" >/dev/null 2>&1 || true
    exit 1
fi

DIST="$REPO/frontend/dist/index.html"
if [ ! -f "$DIST" ]; then
    osascript -e "display alert \"Music Matters\" message \"Frontend is not built. From the clone run: cd frontend && npm ci && npm run build\" as critical" >/dev/null 2>&1 || true
    exit 1
fi

export MM_APP_MODE=1
export PYTHONUNBUFFERED=1

{
    echo "----- $(date) starting -----"
    echo "repo=$REPO python=$MM_PYTHON"
} >> "$LOG"

cd "$REPO/backend"
nohup "$MM_PYTHON" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "$PORT" \
    --log-level info >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"

# First boot can be slow (imports). Wait up to 90s.
ok=0
for _ in $(seq 1 90); do
    if already_up; then
        ok=1
        break
    fi
    sleep 1
done

if [ "$ok" != "1" ]; then
    osascript -e "display alert \"Music Matters\" message \"Server failed to start. Check ~/Library/Logs/Music Matters.log\" as critical" >/dev/null 2>&1 || true
    exit 1
fi

open_ui
exit 0
