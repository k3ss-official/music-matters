"""Path confinement and local-only request helpers.

Every FileResponse and local ingest source must go through confined_file().
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import HTTPException, Request

AUDIO_SUFFIXES = {".wav", ".mp3", ".flac", ".aiff", ".aif", ".m4a", ".ogg"}
EXPORT_SUFFIXES = AUDIO_SUFFIXES | {".als", ".xml", ".m3u", ".m3u8", ".json", ".mid"}
BLOCKED_NAMES = {"library.db", "music_matters.db"}


def confined_file(
    root: Path,
    user_path: str | Path,
    *,
    suffixes: set[str] | None = None,
) -> Path:
    """Resolve user_path and require it to be a file under root."""
    root_resolved = Path(root).expanduser().resolve()
    resolved = Path(user_path).expanduser().resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
    if resolved.name in BLOCKED_NAMES:
        raise HTTPException(status_code=403, detail="Access denied")
    if suffixes and resolved.suffix.lower() not in suffixes:
        raise HTTPException(status_code=403, detail="Forbidden file type")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return resolved


def safe_name(value: str) -> str:
    """Reject path separators / parent segments in a single path component."""
    name = Path(value).name
    if not name or name != value or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid name")
    return name


def is_localhost(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    return host in {"127.0.0.1", "::1", "localhost", "testclient"}


def copy_into_library(src: Path, dest_dir: Path) -> Path:
    """Copy an audio file into dest_dir under a uuid name. Never keep the original path."""
    import shutil
    import uuid

    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = src.suffix.lower() if src.suffix.lower() in AUDIO_SUFFIXES else ".wav"
    dest = dest_dir / f"{uuid.uuid4().hex}{suffix}"
    shutil.copy2(src, dest)
    return dest


def is_self_or_init(pid: int) -> bool:
    return pid in {0, 1, os.getpid(), os.getppid()}
