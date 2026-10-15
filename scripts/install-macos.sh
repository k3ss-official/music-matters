#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Music Matters — One-Shot macOS Installer
#
#  1. Ensures Homebrew & native system dependencies (python@3.11, node, ffmpeg,
#     libsndfile, chromaprint/fpcalc) are present — auto-installing any missing
#     packages via Homebrew when available.
#  2. Creates or reuses conda env `music-matters` or `$REPO/.venv` and installs
#     all Python backend & ML dependencies.
#  3. Installs frontend Node dependencies and builds `frontend/dist`.
#  4. Initializes default `~/music-matters` audio library directories.
#  5. Installs `Music Matters.app` into `/Applications` (so it appears directly
#     in Finder -> Applications, Launchpad, and Spotlight) AND `~/Applications`.
#  6. Runs a smoke test to verify backend + built frontend + `.app` bundle.
#
#  Usage:
#    ./scripts/install-macos.sh           # Install everything
#    ./scripts/install-macos.sh --open    # Install and immediately launch app
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
    echo "install-macos.sh is for macOS only. On Linux use ./start.sh" >&2
    exit 1
fi

OPEN_AFTER=0
for arg in "$@"; do
    case "$arg" in
        --open|-o) OPEN_AFTER=1 ;;
    esac
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Music Matters.app"
PRIMARY_APP_DIR="${MM_APP_DIR:-/Applications}"
USER_APP_DIR="$HOME/Applications"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'
log()  { echo -e "${CYAN}[install]${RESET} $*"; }
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
err()  { echo -e "${RED}[✗]${RESET} $*" >&2; }

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║         Music Matters — One-Shot macOS Installer           ║${RESET}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# Guard against cloning into ~/music-matters (reserved for the audio library)
if [ "$REPO" = "$HOME/music-matters" ]; then
    err "Do not clone the repository into ~/music-matters (that path is reserved for your audio library)."
    err "Move this folder to ~/Developer/music-matters and re-run ./scripts/install-macos.sh"
    exit 1
fi

# shellcheck disable=SC1091
source "$REPO/scripts/lib-env.sh"

# ── 0. System Dependencies (Homebrew auto-install) ───────────────────────────
HAVE_BREW=0
if command -v brew >/dev/null 2>&1; then
    HAVE_BREW=1
    ok "Homebrew detected: $(command -v brew)"
else
    warn "Homebrew not found on PATH. Checking standard locations..."
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$b" ]; then
            eval "$("$b" shellenv)"
            HAVE_BREW=1
            ok "Homebrew detected: $b"
            break
        fi
    done
fi

brew_ensure() {
    local cmd="$1"
    local formula="$2"
    local label="${3:-$formula}"
    if command -v "$cmd" >/dev/null 2>&1; then
        ok "$label ready ($(command -v "$cmd"))"
        return 0
    fi
    if [ "$HAVE_BREW" -eq 1 ]; then
        log "Installing missing dependency: $label (brew install $formula)..."
        HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula"
        # Refresh PATH after brew install
        # shellcheck disable=SC1091
        source "$REPO/scripts/lib-env.sh"
        ok "$label installed"
    else
        err "Missing required command '$cmd' ($label) and Homebrew is not installed."
        err "Install Homebrew from https://brew.sh and re-run ./scripts/install-macos.sh"
        exit 1
    fi
}

brew_ensure_lib() {
    local formula="$1"
    if [ "$HAVE_BREW" -eq 1 ]; then
        if ! brew list --versions "$formula" >/dev/null 2>&1; then
            log "Installing native audio library: $formula..."
            HOMEBREW_NO_AUTO_UPDATE=1 brew install "$formula" || warn "Optional brew install $formula skipped"
        else
            ok "Native library $formula present"
        fi
    fi
}

# Ensure Python >= 3.11
if ! mm_find_python "$REPO" >/dev/null 2>&1 && ! mm_find_system_python311 >/dev/null 2>&1; then
    if [ "$HAVE_BREW" -eq 1 ]; then
        log "Python 3.11+ not found — installing python@3.11 via Homebrew..."
        HOMEBREW_NO_AUTO_UPDATE=1 brew install python@3.11
        # shellcheck disable=SC1091
        source "$REPO/scripts/lib-env.sh"
    else
        err "Python 3.11+ is required. Install Homebrew (https://brew.sh) or Python 3.11+ from https://python.org"
        exit 1
    fi
fi

# Ensure Node.js & npm
brew_ensure node node "Node.js"
brew_ensure npm  node "npm"

# Ensure FFmpeg, libsndfile, and Chromaprint (fpcalc)
brew_ensure ffmpeg ffmpeg "FFmpeg"
brew_ensure_lib libsndfile
if ! command -v fpcalc >/dev/null 2>&1 && [ "$HAVE_BREW" -eq 1 ]; then
    log "Installing chromaprint (fpcalc) for audio fingerprinting..."
    HOMEBREW_NO_AUTO_UPDATE=1 brew install chromaprint || warn "chromaprint install skipped (local fingerprinting still works)"
fi

# ── 1. Python Environment & Dependencies ─────────────────────────────────────
if PY="$(mm_find_python "$REPO")"; then
    # Verify existing venv python is still valid and >= 3.11
    if ! "$PY" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
        warn "Existing virtualenv uses Python < 3.11; recreating $REPO/.venv..."
        rm -rf "$REPO/.venv"
        SYS_PY="$(mm_find_system_python311)"
        "$SYS_PY" -m venv "$REPO/.venv"
        PY="$REPO/.venv/bin/python"
    fi
    ok "Using Python environment: $PY ($("$PY" --version 2>&1))"
else
    SYS_PY="$(mm_find_system_python311 || true)"
    if [ -z "$SYS_PY" ]; then
        err "Python 3.11+ is required."
        exit 1
    fi
    log "Creating virtualenv at $REPO/.venv using $SYS_PY ($("$SYS_PY" --version 2>&1))..."
    "$SYS_PY" -m venv "$REPO/.venv"
    PY="$REPO/.venv/bin/python"
    ok "Created $REPO/.venv"
fi

log "Installing Python backend & ML packages (first run may take a few minutes for PyTorch/Demucs)..."
"$PY" -m pip install --upgrade pip setuptools wheel --quiet
"$PY" -m pip install -e "$REPO"
# Attempt optional shazamio install (non-fatal if binary wheel unavailable on newer Python ABI)
if ! "$PY" -c "import shazamio" >/dev/null 2>&1; then
    log "Installing optional Shazam recognition engine (shazamio)..."
    "$PY" -m pip install "shazamio>=0.6.0" >/dev/null 2>&1 && ok "shazamio installed" || warn "shazamio optional package skipped (AcoustID + local fingerprinting active)"
fi
ok "Python packages installed"

# ── 2. Frontend Build ────────────────────────────────────────────────────────
log "Building frontend -> frontend/dist..."
cd "$REPO/frontend"
if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
    npm install --no-audit --no-fund
fi
npm run build
if [ ! -f "$REPO/frontend/dist/index.html" ]; then
    err "Frontend build failed: $REPO/frontend/dist/index.html not found"
    exit 1
fi
ok "Frontend built ($REPO/frontend/dist)"

# ── 3. Initialize Audio Library & Default Config ─────────────────────────────
MUSIC_LIB="${MUSIC_LIBRARY:-$HOME/music-matters}"
mkdir -p "$MUSIC_LIB/uploads" "$MUSIC_LIB/stems" "$MUSIC_LIB/loops" "$MUSIC_LIB/projects" "$MUSIC_LIB/isolation"
ok "Audio library ready ($MUSIC_LIB)"

# ── 4. Build & Install Music Matters.app Bundle ──────────────────────────────
build_app_bundle() {
    local target_app="$1"
    local contents="$target_app/Contents"
    rm -rf "$target_app"
    mkdir -p "$contents/MacOS" "$contents/Resources"

    cp "$REPO/scripts/macos-app/Info.plist" "$contents/Info.plist"
    cp "$REPO/scripts/macos-app/launcher.sh" "$contents/MacOS/Music Matters"
    chmod +x "$contents/MacOS/Music Matters"
    printf '%s\n' "$REPO" >"$contents/Resources/repo_path"

    local icon_src="$REPO/frontend/src-tauri/icons/icon.icns"
    if [ -f "$icon_src" ]; then
        cp "$icon_src" "$contents/Resources/AppIcon.icns"
    fi

    # Clear quarantine attributes and register with LaunchServices + Spotlight
    xattr -cr "$target_app" 2>/dev/null || true
    touch "$target_app"
    local lsreg="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    if [ -x "$lsreg" ]; then
        "$lsreg" -f "$target_app" >/dev/null 2>&1 || true
    fi
}

INSTALLED_PATHS=()

# Install to primary Applications directory (/Applications by default so it shows in Finder -> Applications)
if [ -w "$PRIMARY_APP_DIR" ] || mkdir -p "$PRIMARY_APP_DIR" 2>/dev/null; then
    if [ -w "$PRIMARY_APP_DIR" ]; then
        log "Installing $PRIMARY_APP_DIR/$APP_NAME..."
        build_app_bundle "$PRIMARY_APP_DIR/$APP_NAME"
        INSTALLED_PATHS+=("$PRIMARY_APP_DIR/$APP_NAME")
        ok "Installed: $PRIMARY_APP_DIR/$APP_NAME"
    fi
fi

# Also install into ~/Applications (ensures compatibility with ~/Applications references and non-admin accounts)
if [ "$PRIMARY_APP_DIR" != "$USER_APP_DIR" ]; then
    mkdir -p "$USER_APP_DIR"
    log "Installing $USER_APP_DIR/$APP_NAME..."
    build_app_bundle "$USER_APP_DIR/$APP_NAME"
    INSTALLED_PATHS+=("$USER_APP_DIR/$APP_NAME")
    ok "Installed: $USER_APP_DIR/$APP_NAME"
fi

# Choose primary app path to report/launch
FINAL_APP="${INSTALLED_PATHS[0]}"

# ── 5. Smoke Test ────────────────────────────────────────────────────────────
log "Running post-install verification..."
PYTHONPATH="$REPO/backend" "$PY" -c "
import app.main
assert app.main.app is not None
"
chmod +x "$REPO/start.sh" "$REPO/Music Matters.command" 2>/dev/null || true
ok "Smoke test passed (FastAPI app + frontend/dist + Music Matters.app verified)"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Music Matters is installed and ready!${RESET}"
echo -e "${GREEN}  App:      $FINAL_APP${RESET}"
echo -e "${GREEN}  Library:  $MUSIC_LIB${RESET}"
echo -e "${GREEN}  Launch:   Open 'Music Matters' from Applications or Spotlight${RESET}"
echo -e "${GREEN}            or run: open \"$FINAL_APP\"${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${RESET}"
echo ""

if [ "$OPEN_AFTER" -eq 1 ]; then
    log "Launching $FINAL_APP..."
    open "$FINAL_APP"
fi
