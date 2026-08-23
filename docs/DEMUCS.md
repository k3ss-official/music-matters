# Stem separation (Demucs)

Separation runs **inside the ingest pipeline**, not as a standalone worker. Default model is `htdemucs_6s` (six stems) on Apple Silicon `mps`.

Stems: `drums`, `bass`, `vocals`, `guitar`, `piano`, `other`.

## How it actually runs

`backend/app/services/pipeline.py` (stage `separation`):

1. Prefer `demucs-mlx` on Apple Silicon if that extra is installed
2. Else official `demucs` CLI / Python API via `backend/app/services/processing/stem_separator.py` and `audio_processor.py`
3. Else HPSS fallback (harmonic/percussive) so the rest of the pipeline can continue

Output: `$MUSIC_LIBRARY/stems/<slug>/`. First run downloads weights into `HF_HOME` (`~/.cache/huggingface`, ~4 GB).

Config (`backend/.env` or environment):

```env
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps    # mps | cuda | cpu
DEMUCS_SHIFTS=1      # 1 = faster; 2+ = slightly cleaner, slower
HF_HOME=~/.cache/huggingface
```

## Devices

| Device | When |
|---|---|
| `mps` | Apple Silicon (default) |
| `cuda` | NVIDIA |
| `cpu` | Anything else; slow |

Jobs are capped by `MAX_CONCURRENT_JOBS` (default 3). Do not fire several 6-stem jobs at once on a 16 GB Mac — unified memory will spike.

## What this is not

- Isolation Workspace substems are **FFT bands** on a sliced region, not a second Demucs pass. See [isolation-workspace.md](isolation-workspace.md).
- `scripts/run_demucs.py` is leftover CLI that imports a removed `app.core.settings` module. Do not use it; ingest a track in the app instead.
- `docs/archive/` MLX notes are a 2026 research draft (Roformer / SAM Audio). Not wired.

## Troubleshooting

| Symptom | Fix |
|---|---|
| First job hangs 10+ min | Model download. Watch `~/Library/Logs/Music Matters.log` or the Terminal |
| `MPS backend out of memory` | Wait for other jobs; drop `MAX_CONCURRENT_JOBS` to 1; or `DEMUCS_DEVICE=cpu` |
| `demucs` missing | `pip install -e .` from the clone (package lists `demucs>=4`) |
| Stems folder empty, status error | Open the job in Processing; HPSS may have run instead — re-run after fixing device |
