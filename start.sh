#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Music Matters — Single-command local dev launcher
#  Starts:  FastAPI backend  →  http://127.0.0.1:8010
#           Vite frontend    →  http://127.0.0.1:5173
#
#  Usage:
#    ./start.sh          Vite UI + API
#    ./start.sh --app    built UI served by FastAPI on :8010
#
#  Stop:  Ctrl+C  (kills both processes). App mode: power button in the header.
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Colour helpers ──────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[MM]${RESET} $*"; }
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
err()  { echo -e "${RED}[✗]${RESET} $*"; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║       Music Matters — Dev Server         ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── Prereq checks ───────────────────────────────────────────────────────────
check_command() {
    if ! command -v "$1" &>/dev/null; then
        err "Required command not found: $1"
        echo "    Install it and re-run: $2"
        exit 1
    fi
}

check_command python3  "brew install python3  OR  https://python.org"
check_command node     "brew install node     OR  https://nodejs.org"
check_command npm      "comes with node"

# ── Python env (conda: music-matters, else venv) ─────────────────────────────
# shellcheck disable=SC1091
source "$SCRIPT_DIR/scripts/lib-env.sh"
mm_resolve_python "$SCRIPT_DIR"
if [ "$MM_PYTHON" = "python3" ] && [ ! -d "$BACKEND_DIR/.venv" ] && [ ! -d "$SCRIPT_DIR/.venv" ]; then
    warn "No conda env or venv — creating $SCRIPT_DIR/.venv"
    python3 -m venv "$SCRIPT_DIR/.venv"
    mm_resolve_python "$SCRIPT_DIR"
    "$MM_PYTHON" -m pip install -e "$SCRIPT_DIR"
fi
PYTHON="$MM_PYTHON"
ok "Python: $PYTHON ($("$PYTHON" --version 2>&1))"

# ── Node modules ─────────────────────────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "Installing frontend dependencies (npm install)..."
    (cd "$FRONTEND_DIR" && npm install --silent)
    ok "Frontend dependencies ready"
else
    ok "Frontend node_modules already present"
fi

# ── Data directories ─────────────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/data/library"
mkdir -p "$SCRIPT_DIR/data/stems"
mkdir -p "$SCRIPT_DIR/data/uploads"
mkdir -p "$SCRIPT_DIR/data/cache"

# ── Cleanup on Ctrl+C ────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    log "Shutting down..."
    [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    wait 2>/dev/null
    ok "Bye."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Kill anything already on these ports so restarts are clean
lsof -ti :8010 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

# ── App mode: one uvicorn process serving the built UI (no Vite) ─────────────
APP_MODE=0
if [ "${1:-}" = "--app" ] || [ "${MM_APP_MODE:-}" = "1" ]; then
    APP_MODE=1
    export MM_APP_MODE=1
fi

if [ "$APP_MODE" = "1" ]; then
    if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
        log "Building UI for app mode..."
        (cd "$FRONTEND_DIR" && npm run build)
    fi
    log "Starting Music Matters on http://127.0.0.1:8010 (app mode)..."
    cd "$BACKEND_DIR"
    exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --log-level info
fi

log "Starting FastAPI backend on http://localhost:8010 ..."
cd "$BACKEND_DIR"
"$PYTHON" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8010 \
    --reload \
    --log-level warning 2>&1 | sed "s/^/${CYAN}[backend]${RESET} /" &
BACKEND_PID=$!

sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend failed to start — check for port conflicts or import errors"
    exit 1
fi
ok "Backend running  →  http://127.0.0.1:8010"
ok "API docs         →  http://127.0.0.1:8010/api/docs"

# ── Start frontend ────────────────────────────────────────────────────────────
log "Starting Vite frontend on http://127.0.0.1:5173 ..."
cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 2>&1 | sed "s/^/${GREEN}[frontend]${RESET} /" &
FRONTEND_PID=$!

sleep 2
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    err "Frontend failed to start"
    kill "$BACKEND_PID" 2>/dev/null
    exit 1
fi
ok "Frontend running →  http://localhost:5173"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Music Matters is running!${RESET}"
echo -e "${GREEN}  Open:  http://127.0.0.1:5173${RESET}"
echo -e "${GREEN}  API:   http://127.0.0.1:8010/api/docs${RESET}"
echo -e "${GREEN}  Stop:  Ctrl+C${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════${RESET}"
echo ""

# ── Keep alive (restart frontend if it dies) ─────────────────────────────────
while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        warn "Backend died — restarting..."
        cd "$BACKEND_DIR"
        "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload --log-level warning 2>&1 | sed "s/^/${CYAN}[backend]${RESET} /" &
        BACKEND_PID=$!
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        warn "Frontend died — restarting..."
        cd "$FRONTEND_DIR"
        npm run dev -- --host 127.0.0.1 2>&1 | sed "s/^/${GREEN}[frontend]${RESET} /" &
        FRONTEND_PID=$!
    fi
    sleep 5
done
