# CLAUDE.md — Music Matters

## Role
You are a specialist coder working under orchestrator direction.
Do exactly what the directive says. No scope creep. No unsolicited refactors.
If a directive is ambiguous, ask one clarifying question before touching anything.

## Project
Local-first DJ automation platform — ingest → analyse → stem separate → loop edit → export.
FastAPI backend (port 8010) + React/Vite frontend (port 5173).
Target machine: Apple M4. Python 3.11. Conda env: `music-matters`.

## Repo root
`~/k3ss-official/music-matters`

## Setup
```bash
conda activate music-matters
pip install -e .
cd frontend && npm install && cd ..
./start.sh
```

## Hard rules
- Never commit audio files — `*.wav *.mp3 *.flac *.m4a` are gitignored, keep it that way.
- Never touch `demucs` model weights.
- No new external API calls without flagging to orchestrator first.
- WaveSurfer is v7.12.1 — do NOT use `ws.play(start, end)`, that API is gone. Use `ws.setTime(start)` + `ws.play()` + audioprocess loop check.
- All colours must use existing design tokens (see `docs/STATUS.md` → Design Tokens section). No new hex values.

## Stack
| Layer | Tech |
|---|---|
| Backend | FastAPI 0.115, Python 3.11, uvicorn |
| Frontend | React 18, TypeScript 5.3, Vite 7, Tailwind 3.4 |
| Audio | WaveSurfer.js v7.12.1 + RegionsPlugin |
| Icons | lucide-react |
| DB | SQLite via `backend/app/services/db.py` |
| Stem separation | demucs-mlx (Apple Silicon MLX) |

## Key files
- `backend/app/api/routes/library.py` — track/loop CRUD
- `backend/app/services/pipeline.py` — ingest → analyse → separate orchestrator
- `frontend/src/components/WaveformCanvas.tsx` — WaveSurfer v7 waveform, bidirectional region sync
- `frontend/src/components/TransportBar.tsx` — play/stop/loop/volume controls
- `frontend/src/components/LoopEditorToolbar.tsx` — IN/OUT editor, nudge, quantize, bar presets
- `frontend/src/components/CentreWorkspace.tsx` — state owner, wires all waveform components
- `frontend/src/services/api.ts` — all API calls

## Commit convention
```
type: short description
```
Types: `fix` `feat` `chore` `docs` `refactor`
Keep messages under 72 chars. Push to `main` directly — no branches unless told otherwise.

## Active known issues (fix only when directed)
- `library.py` line 59: `@router.delete` with `status_code=204` crashes FastAPI 0.115 — needs `response_class=Response`
- `Any` import in one service file — flag if you encounter it
- Tauri scaffolding present but not wired — leave alone
