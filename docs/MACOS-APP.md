# macOS app

The supported desktop path is a thin `.app` wrapper, not a Tauri sidecar. Tauri v2 is version-aligned in the repo if you want a native webview later; it is not required to run the product.

## What gets installed

```
~/Applications/Music Matters.app/
  Contents/
    Info.plist                  # io.k3ss.music-matters, version 2.0.0
    MacOS/Music Matters         # launcher (bash)
    Resources/
      repo_path                 # absolute path to the clone
      AppIcon.icns              # copied from frontend/src-tauri/icons
```

The clone stays where you put it (`~/Developer/music-matters` recommended). The `.app` only stores that path.

## Launch sequence

1. If `http://127.0.0.1:8010/api/health` already responds, just open the UI.
2. Else resolve Python (`scripts/lib-env.sh`: conda `music-matters`, then `backend/.venv`, then repo `.venv`).
3. Require `frontend/dist/index.html` (installer builds it).
4. `MM_APP_MODE=1 uvicorn app.main:app --host 127.0.0.1 --port 8010`
5. Wait up to 90s for health.
6. Open Chrome / Edge / Brave `--app=http://127.0.0.1:8010`, else `open` that URL.

PID: `~/Library/Application Support/Music Matters/uvicorn.pid`  
Log: `~/Library/Logs/Music Matters.log`

FastAPI serves `frontend/dist` at `/` when that folder exists, so app mode is **one process**. Vite is not used.

`MM_APP_MODE=1` makes `/api/health` return `"app_mode": true`, which shows the header Quit button (`POST /api/system/shutdown`, localhost only).

## Installer internals

`scripts/install-macos.sh` is Darwin-only. Override the Applications folder with `MM_APP_DIR` if you want `/Applications` instead of `~/Applications`.

```bash
MM_APP_DIR=/Applications ./scripts/install-macos.sh
```

## Failures to expect

| Symptom | Cause |
|---|---|
| Alert: repo not found | Clone moved; re-run the installer from the new path |
| Alert: Python not found | Install 3.11+ or create conda env `music-matters` |
| Alert: frontend not built | `cd frontend && npm ci && npm run build` |
| Alert: server failed to start | Read the log; usually a missing native dep or port 8010 busy |
| Empty library | Audio is in `~/music-matters`, not inside the clone |
