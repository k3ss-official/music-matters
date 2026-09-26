# Roadmap

Status: **usable local studio** on macOS. Not a hosted product.

Repo: [k3ss-official/music-matters](https://github.com/k3ss-official/music-matters)

## Done

- Isolation Workspace + Library dashboard
- Production hardening: path jail, localhost bind, CI, LICENSE, tsc
- `~/Applications` installer; FastAPI serves the built UI
- Real isolation DSP (extract + 5-band split + mix export)
- Docs rewritten to match the code (no `/api/v1`, no old volume paths)

## Next (when you need it)

1. Isolation: learned substem split (Demucs/MDX on the extracted region) instead of FFT bands
2. Wire peaks into isolation parent waveform (still a fake SVG there)
3. Drop or finish Tauri as a real native window (spawn backend from Rust)
4. Trim unused pyproject extras; keep `strict` frontend when you have time
5. Traktor beatgrid → isolation session BPM (partially ingested already)
6. Delete leftover `scripts/run_demucs.py` (imports a removed module)

## Won't do unless the product changes

- Accounts, cloud sync, bind-on-LAN, multi-user
- Docker-for-its-own-sake
