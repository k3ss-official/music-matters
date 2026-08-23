# Audio library on disk

Default root: `~/music-matters` (`MUSIC_LIBRARY`). This is **not** the git clone.

```
~/music-matters/
├── library.db              # SQLite (WAL + shm next to it)
├── downloads/              # ingested copies — UUID filenames
├── stems/<slug>/           # Demucs (or HPSS) stems
├── loops/<slug>/           # beat-aligned slices
├── projects/<slug>/        # session.json scaffold
└── Library/
    └── Isolation/<uuid>/   # isolation sessions
        ├── session.json
        ├── extracted_region.wav
        ├── sub_1.wav … sub_5.wav
        └── export.wav
```

## SQLite

`library.db` — `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.

Tables: `tracks`, `loop_records`, `jobs`.

The API will not serve `library.db` (or `music_matters.db`) through download/audio routes.

## Back up / wipe

Copy the whole `~/music-matters` folder. To start clean, quit the app and delete that folder — the clone and the `.app` stay put. Next launch recreates an empty DB.

## Override

```env
MUSIC_LIBRARY=/path/to/library
```

Do not point this at the clone. Do not clone the repo into `~/music-matters`.
