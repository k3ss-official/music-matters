# Quickstart

## One-Shot Mac App Install (`Applications/Music Matters.app`)

Paste this single command in Terminal to clone, install all dependencies, build **`Music Matters.app`** into `/Applications` (and `~/Applications`), and launch it:

```bash
([ -d ~/Developer/music-matters ] || git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters) && cd ~/Developer/music-matters && ./scripts/install-macos.sh --open
```

Or from an existing clone:

```bash
./scripts/install-macos.sh --open
```

Then find **Music Matters** directly in your **Applications** folder or Spotlight.

*(Do not clone into `~/music-matters` — that folder is reserved for your audio library.)*

Full install notes: [docs/INSTALL.md](docs/INSTALL.md). Docs index: [docs/README.md](docs/README.md).

## Terminal

```bash
./start.sh          # Vite + API
./start.sh --app    # built UI on :8010
```

Open **http://127.0.0.1:5173** (dev) or **http://127.0.0.1:8010** (app).

API: [http://127.0.0.1:8010/api/docs](http://127.0.0.1:8010/api/docs)
