#!/usr/bin/env bash
# Install Music Matters as a double-clickable app in ~/Applications.
#
# Usage (from a clone — do NOT clone into ~/music-matters, that's the audio library):
#   git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters
#   cd ~/Developer/music-matters
#   ./scripts/install-macos.sh
#
# Then open ~/Applications/Music Matters.app
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${MM_APP_DIR:-$HOME/Applications}"
APP="$APP_DIR/Music Matters.app"
FRONTEND="$REPO/frontend"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'
log()  { echo -e "${CYAN}[MM]${RESET} $*"; }
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
err()  { echo -e "${RED}[✗]${RESET} $*"; }

if [ "$(uname -s)" != "Darwin" ]; then
    err "This installer builds a macOS .app. On this OS use ./start.sh instead."
    exit 1
fi

if [ "$REPO" = "$HOME/music-matters" ]; then
    warn "This clone lives at ~/music-matters — that's also the default audio library path."
    warn "It works, but a separate clone (e.g. ~/Developer/music-matters) is cleaner."
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║   Music Matters — install to ~/Applications  ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo ""
log "Repo: $REPO"
log "App:  $APP"

need() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "Missing $1 — $2"
        exit 1
    fi
}
need python3 "install Python 3.11+ (python.org or brew install python@3.11)"
need node    "brew install node"
need npm     "comes with node"

if ! command -v ffmpeg >/dev/null 2>&1; then
    warn "ffmpeg not on PATH. Stem ingest from YouTube needs it: brew install ffmpeg"
fi

# shellcheck disable=SC1091
source "$REPO/scripts/lib-env.sh"
mm_resolve_python "$REPO"

if [ "$MM_PYTHON" = "python3" ] && [ ! -x "$REPO/.venv/bin/python" ] && [ ! -x "$REPO/backend/.venv/bin/python" ]; then
    log "Creating $REPO/.venv"
    python3 -m venv "$REPO/.venv"
    mm_resolve_python "$REPO"
fi

ok "Python: $MM_PYTHON ($("$MM_PYTHON" --version 2>&1))"

log "Installing Python package (this may take a while the first time)..."
"$MM_PYTHON" -m pip install -q -U pip wheel
"$MM_PYTHON" -m pip install -e "$REPO"

log "Installing frontend deps..."
if [ -f "$FRONTEND/package-lock.json" ]; then
    (cd "$FRONTEND" && npm ci --silent)
else
    (cd "$FRONTEND" && npm install --silent)
fi

log "Building UI..."
(cd "$FRONTEND" && npm run build)

if [ ! -f "$FRONTEND/dist/index.html" ]; then
    err "frontend/dist/index.html missing after build"
    exit 1
fi
ok "UI built"

log "Writing $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$REPO/scripts/macos-app/Info.plist" "$APP/Contents/Info.plist"
cp "$REPO/scripts/macos-app/launcher.sh" "$APP/Contents/MacOS/Music Matters"
chmod +x "$APP/Contents/MacOS/Music Matters"
printf '%s\n' "$REPO" > "$APP/Contents/Resources/repo_path"

ICON_SRC="$REPO/frontend/src-tauri/icons/icon.icns"
if [ -f "$ICON_SRC" ]; then
    cp "$ICON_SRC" "$APP/Contents/Resources/AppIcon.icns"
fi

# Register with Launch Services so Spotlight / the Applications folder picks it up
if command -v /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister >/dev/null 2>&1; then
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true
fi

ok "Installed"
echo ""
echo -e "${GREEN}  Double-click:${RESET}  $APP"
echo -e "${GREEN}  Or run:${RESET}        open \"$APP\""
echo -e "${GREEN}  Audio library:${RESET}  ~/music-matters   (override with MUSIC_LIBRARY)"
echo -e "${GREEN}  Logs:${RESET}           ~/Library/Logs/Music Matters.log"
echo -e "${GREEN}  Quit:${RESET}           Quit button in the app header, or: kill \$(lsof -ti :8010)"
echo ""
echo "Re-run this script after git pull to rebuild the UI and refresh the app."
echo ""
