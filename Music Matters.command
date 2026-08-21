#!/usr/bin/env bash
# Double-click in Finder to launch in a Terminal window.
# Prefer the installed app after `./scripts/install-macos.sh`:
#   open ~/Applications/Music\ Matters.app

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "$SCRIPT_DIR/frontend/dist/index.html" ]; then
    (sleep 4 && open http://127.0.0.1:8010) &
    exec ./start.sh --app
fi

(sleep 6 && open http://127.0.0.1:5173) &
exec ./start.sh
