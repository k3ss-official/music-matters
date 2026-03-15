import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
from uuid import UUID

from app.config import settings
from app.api import schemas

# Use the music library dir for the DB
DB_PATH = settings.MUSIC_LIBRARY / "library.db"


class DatabaseService:
    """SQLite Persistence layer for Music Matters tracks and loops."""
    _local = threading.local()

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn"):
            # isolation_level=None for autocommit mode
            conn = sqlite3.connect(str(self.db_path), isolation_level=None, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                track_id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                bpm REAL,
                musical_key TEXT,
                original_path TEXT,
                stems_dir TEXT,
                loops_dir TEXT,
                metadata TEXT,
                stems TEXT,
                loops TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS loop_records (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                label TEXT NOT NULL,
                path TEXT NOT NULL,
                start_bar INTEGER NOT NULL,
                bar_count INTEGER NOT NULL,
                stem TEXT NOT NULL,
                bpm REAL NOT NULL,
                musical_key TEXT,
                energy REAL,
                FOREIGN KEY(track_id) REFERENCES tracks(track_id) ON DELETE CASCADE
            )
        """)

    def save_track(self, track) -> None:
        """Upsert a TrackRecord."""
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO tracks (
                track_id, slug, title, artist, status, created_at, bpm, musical_key,
                original_path, stems_dir, loops_dir, metadata, stems, loops
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(track_id) DO UPDATE SET
                slug=excluded.slug,
                title=excluded.title,
                artist=excluded.artist,
                status=excluded.status,
                bpm=excluded.bpm,
                musical_key=excluded.musical_key,
                original_path=excluded.original_path,
                stems_dir=excluded.stems_dir,
                loops_dir=excluded.loops_dir,
                metadata=excluded.metadata,
                stems=excluded.stems,
                loops=excluded.loops
            """,
            (
                str(track.track_id),
                track.slug,
                track.title,
                track.artist,
                track.status,
                track.created_at.isoformat(),
                track.bpm,
                track.musical_key,
                str(track.original_path) if track.original_path else None,
                str(track.stems_dir) if track.stems_dir else None,
                str(track.loops_dir) if track.loops_dir else None,
                json.dumps(track.metadata or {}),
                json.dumps(track.stems or []),
                json.dumps(track.loops or [])
            )
        )

    def load_all_tracks(self) -> Dict[UUID, Any]:
        """Load all tracks from DB to bootstrap pipeline._tracks."""
        # Note: We return raw dicts that pipeline can inflate into TrackRecord objects
        conn = self._get_conn()
        cursor = conn.execute("SELECT * FROM tracks")
        tracks = {}
        for row in cursor.fetchall():
            track_id = UUID(row['track_id'])
            tracks[track_id] = {
                "track_id": track_id,
                "slug": row['slug'],
                "title": row['title'],
                "artist": row['artist'],
                "status": row['status'],
                "created_at": datetime.fromisoformat(row['created_at']),
                "bpm": row['bpm'],
                "musical_key": row['musical_key'],
                "original_path": Path(row['original_path']) if row['original_path'] else None,
                "stems_dir": Path(row['stems_dir']) if row['stems_dir'] else None,
                "loops_dir": Path(row['loops_dir']) if row['loops_dir'] else None,
                "metadata": json.loads(row['metadata']) if row['metadata'] else {},
                "stems": json.loads(row['stems']) if row['stems'] else [],
                "loops": json.loads(row['loops']) if row['loops'] else []
            }
        return tracks

    def delete_track(self, track_id: UUID) -> None:
        conn = self._get_conn()
        conn.execute("DELETE FROM tracks WHERE track_id = ?", (str(track_id),))

    def save_loop(self, track_id: UUID, loop) -> None:
        """Upsert a LoopRecord."""
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO loop_records (
                id, track_id, label, path, start_bar, bar_count, stem, bpm, musical_key, energy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                path=excluded.path,
                start_bar=excluded.start_bar,
                bar_count=excluded.bar_count,
                stem=excluded.stem,
                bpm=excluded.bpm,
                musical_key=excluded.musical_key,
                energy=excluded.energy
            """,
            (
                loop.id,
                str(track_id),
                loop.label,
                str(loop.path),
                loop.start_bar,
                loop.bar_count,
                loop.stem,
                loop.bpm,
                loop.musical_key,
                loop.energy
            )
        )

    def load_all_loops(self) -> Dict[UUID, Dict[str, Any]]:
        """Load loops organized by track_id."""
        conn = self._get_conn()
        cursor = conn.execute("SELECT * FROM loop_records")
        loops = {}
        for row in cursor.fetchall():
            tid = UUID(row['track_id'])
            if tid not in loops:
                loops[tid] = {}
            loops[tid][row['id']] = {
                "id": row['id'],
                "label": row['label'],
                "path": Path(row['path']),
                "start_bar": row['start_bar'],
                "bar_count": row['bar_count'],
                "stem": row['stem'],
                "bpm": row['bpm'],
                "musical_key": row['musical_key'],
                "energy": row['energy']
            }
        return loops

db = DatabaseService()
