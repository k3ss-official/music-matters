# macOS app

The supported desktop path is a thin `.app` wrapper, not a Tauri sidecar. Tauri v2 is version-aligned in the repo if you want a native webview later; it is not required to run the product.

## What gets installed

```
/Applications/Music Matters.app/   (and ~/Applications/Music Matters.app/)
  Contents/
    Info.plist                  # io.k3ss.music-matters, version 2.0.0
    MacOS/Music Matters         # launcher (bash)
    Resources/
      repo_path                 # absolute path to the clone
      AppIcon.icns              # copied from frontend/src-tauri/icons
```

The clone stays where you put it (`~/Developer/music-matters` recommended). The `.app` stores that path in `Contents/Resources/repo_path`.

## Launch sequence

1. Prepend `/opt/homebrew/bin`, `/usr/local/bin`, and `~/.local/bin` to `PATH` (Finder launches `.app` bundles with a minimal PATH).
2. If `http://127.0.0.1:8010/api/health` already responds, just open the UI.
3. Else resolve Python (`scripts/lib-env.sh`: conda `music-matters`, then `backend/.venv`, then repo `.venv`).
4. Require `frontend/dist/index.html` (installer builds it).
5. Clean up any stale process holding port `8010`.
6. `MM_APP_MODE=1 uvicorn app.main:app --host 127.0.0.1 --port 8010`
7. Wait up to 90s for health.
8. Open Chrome / Edge / Brave `--app=http://127.0.0.1:8010`, else `open` that URL.

PID: `~/Library/Application Support/Music Matters/uvicorn.pid`  
Log: `~/Library/Logs/Music Matters.log`

FastAPI serves `frontend/dist` at `/` when that folder exists, so app mode is **one process**. Vite is not used.

`MM_APP_MODE=1` makes `/api/health` return `"app_mode": true`, which shows the header Quit button (`POST /api/system/shutdown`, localhost only).

## Installer internals

`scripts/install-macos.sh` is Darwin-only. By default it installs into `/Applications/Music Matters.app` (if writable) and `~/Applications/Music Matters.app`. Override the primary target with `MM_APP_DIR`:

```bash
./scripts/install-macos.sh --open
```

## Failures to expect

| Symptom | Cause |
|---|---|
| Alert: repo not found | Clone moved; re-run `./scripts/install-macos.sh` from the new path |
| Alert: Python not found | Re-run `./scripts/install-macos.sh` to provision `.venv` |
| Alert: frontend not built | Re-run `./scripts/install-macos.sh` or `cd frontend && npm ci && npm run build` |
| Alert: server failed to start | Read `~/Library/Logs/Music Matters.log` |
| Empty library | Audio is in `~/music-matters`, not inside the clone |
