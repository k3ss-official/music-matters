# Security (local-first)

This is a studio tool on your machine. The bar is: nothing on the LAN should read your disk or kill processes.

## Bind

`HOST=127.0.0.1`. `start.sh`, the Mac launcher, and Vite all bind loopback. Do not set `0.0.0.0` unless you know you want that.

## Path jail

Every `FileResponse` and local ingest source goes through `backend/app/security.py`:

- `confined_file(root, path, suffixes=…)` — resolve, `relative_to(root)`, block `library.db` / `music_matters.db`, suffix allowlist
- `safe_name()` — one path component, no `..`
- Local ingest uses `copy_into_library()` (UUID filename under the library)

Uploads: audio suffixes only, 200 MB cap, UUID names.

## Process kill

`POST /api/system/kill/{pid}`:

- `is_localhost` (`127.0.0.1`, `::1`, `localhost`, Starlette `testclient`)
- refuse pid `0`, `1`, self, parent
- process name must match `KNOWN_HEAVY_APPS` (Ableton, Chrome, Docker, …)

`POST /api/system/shutdown` is also localhost-only.

## Errors

Route handlers must not return `traceback.format_exc()` to clients. 500s are short strings.

## CORS

Dev Vite origins + `http://127.0.0.1:8010` + Tauri origins. Credentials allowed because this never leaves the box.
