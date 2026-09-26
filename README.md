# Music Matters

<div align="center">

<p>
  <a href="https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode"><img src="https://img.shields.io/badge/Hermes-Bot_Mode-6d28d9?style=for-the-badge&labelColor=0a0a0a" alt="Hermes Bot Mode" /></a>
  <img src="https://img.shields.io/badge/Python-3-3776AB?style=for-the-badge&labelColor=0a0a0a&logo=python&logoColor=white" alt="Python-3" />
  <img src="https://img.shields.io/badge/license-MIT-fbbf24?style=for-the-badge&labelColor=0a0a0a" alt="MIT" />
  <img src="https://img.shields.io/badge/private-111111?style=for-the-badge&labelColor=0a0a0a" alt="private" />
</p>

</div>


Local-first DJ and producer studio. Ingest audio, analyse structure, separate stems, slice loops, isolate substems, export to Ableton.

This is a **localhost app for you**, not a hosted service. The API binds `127.0.0.1` only.

**Docs:** [docs/README.md](docs/README.md) · [Install](docs/INSTALL.md) · [Usage](docs/USAGE.md) · [API](docs/API.md) · [macOS app](docs/MACOS-APP.md)

## Install as a Mac app (`~/Applications`)

Do **not** clone into `~/music-matters` — that path is the default **audio library**. Clone next to it:

```bash
git clone https://github.com/anwhelan01/music-matters.git ~/Developer/music-matters
cd ~/Developer/music-matters
./scripts/install-macos.sh
open ~/Applications/Music\ Matters.app
```

That script creates/uses conda env `music-matters` (or a repo `.venv`), installs Python + Node deps, builds the UI, and writes **`~/Applications/Music Matters.app`**.

Double-click after that. Quit from the power button in the header. Logs: `~/Library/Logs/Music Matters.log`. Re-run the installer after `git pull`.

### Requirements

- macOS 13+
- Python 3.11+
- Node.js 18+
- FFmpeg (`brew install ffmpeg`)
- ~4 GB disk for Demucs on first stem run
- Apple Silicon recommended (MPS); CPU fallback works

## Dev loop (Terminal)

```bash
./start.sh          # Vite :5173 + API :8010
./start.sh --app    # built UI on :8010
```

API docs: **http://127.0.0.1:8010/api/docs**.

## What it does

| Feature | Details |
|---|---|
| **Search & ingest** | Local files (copied into the library), URLs via yt-dlp, batch queue |
| **Analysis** | BPM, key, smart phrases |
| **Stem separation** | Demucs `htdemucs_6s` on Apple MPS — 6 stems; HPSS fallback |
| **Library** | Duration, loop counts, real waveform thumbs |
| **Loop editor** | WaveSurfer, beat-snap regions, phrase snap |
| **Isolation** | Region extract → 5-band substem split → mix/EQ → WAV |
| **Ableton export** | `.als` ZIP with stems on the session grid |
| **SQLite** | WAL + foreign keys; survives restarts |

## Configuration

`backend/.env` (optional):

```env
MUSIC_LIBRARY=~/music-matters
HOST=127.0.0.1
PORT=8010
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps
HF_HOME=~/.cache/huggingface
```

## Tests

```bash
pip install -e ".[dev]"
pytest backend/tests --ignore=backend/tests/test_e2e.py
cd frontend && npx tsc --noEmit && npm run build
```

## License

MIT. See [LICENSE](LICENSE).

---

## Hermes Bot Mode

This desk is a named [Hermes](https://hermes-agent.nousresearch.com/) Bot — own model slot, memory, skills, routines, and `@mentions`.

```bash
# once
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# this repo
./scripts/install-hermes-bot.sh
hermes -p music-matters chat
```

In Hermes Desktop the Bot lands under **Bots**. Type `@music-matters` from any chat; group it with the rest of the k3ss roster (`studio`).

| File | Role |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Project harness Hermes loads at session start |
| [`.hermes/SOUL.md`](.hermes/SOUL.md) | Bot personality |
| [`.hermes/bot.yaml`](.hermes/bot.yaml) | Roster, skills, groups |
| [`.hermes/skills/music-matters/SKILL.md`](.hermes/skills/music-matters/SKILL.md) | Portable skill |

Docs: [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) · [Context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files) · [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
