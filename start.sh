#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Music Matters — Single-command local dev launcher
#  Starts:  FastAPI backend  →  http://localhost:8010
#           Vite frontend    →  http://localhost:5173
#
#  Usage:
#    chmod +x start.sh   (first time only)
#    ./start.sh
#
#  Stop:  Ctrl+C  (kills both processes)
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

# ── Python venv ─────────────────────────────────────────────────────────────
VENV_DIR="$BACKEND_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    log "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    ok "Virtual environment created at backend/.venv"
fi

PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

# Only reinstall if requirements.txt is newer than the venv marker
MARKER="$VENV_DIR/.deps_installed"
if [ ! -f "$MARKER" ] || [ "$BACKEND_DIR/requirements.txt" -nt "$MARKER" ]; then
    log "Installing / updating backend dependencies..."
    "$PIP" install --quiet --upgrade pip
    "$PIP" install --quiet -r "$BACKEND_DIR/requirements.txt"
    touch "$MARKER"
    ok "Backend dependencies ready"
else
    ok "Backend dependencies up to date (skipping install)"
fi

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

# ── Start backend ─────────────────────────────────────────────────────────────
log "Starting FastAPI backend on http://localhost:8010 ..."
cd "$BACKEND_DIR"
"$PYTHON" -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8010 \
    --reload \
    --log-level warning &
BACKEND_PID=$!

# Give it a moment to bind
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend failed to start — check for port conflicts or import errors"
    exit 1
fi
ok "Backend running  →  http://localhost:8010"
ok "API docs         →  http://localhost:8010/docs"

# ── Start frontend ────────────────────────────────────────────────────────────
log "Starting Vite frontend on http://localhost:5173 ..."
cd "$FRONTEND_DIR"
npm run dev -- --host &
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
echo -e "${GREEN}  Open:  http://localhost:5173${RESET}"
echo -e "${GREEN}  API:   http://localhost:8010/docs${RESET}"
echo -e "${GREEN}  Stop:  Ctrl+C${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════${RESET}"
echo ""

# ── Keep alive ────────────────────────────────────────────────────────────────
wait
