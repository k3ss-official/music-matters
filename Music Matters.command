#!/usr/bin/env bash
# Double-click in Finder to launch Music Matters.
# If the macOS app is not yet built, runs the one-shot installer first.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "$SCRIPT_DIR/frontend/dist/index.html" ] || { [ ! -d "/Applications/Music Matters.app" ] && [ ! -d "$HOME/Applications/Music Matters.app" ]; }; then
    ./scripts/install-macos.sh --open
    exit $?
fi

if [ -d "/Applications/Music Matters.app" ]; then
    open "/Applications/Music Matters.app"
    exit 0
elif [ -d "$HOME/Applications/Music Matters.app" ]; then
    open "$HOME/Applications/Music Matters.app"
    exit 0
fi

(sleep 4 && open http://127.0.0.1:8010) &
exec ./start.sh --app
