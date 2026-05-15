#!/usr/bin/env bash
# Double-click this file in Finder to launch Music Matters.
# macOS will open Terminal and run it automatically.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Open browser after a short delay
(sleep 6 && open http://localhost:5173) &

exec ./start.sh
