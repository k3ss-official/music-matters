"""Download helpers for ingest stage."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from app.core.settings import Settings, settings
from app.services.library import LibraryPaths

logger = logging.getLogger(__name__)

try:
    import yt_dlp
except ImportError as exc:  # pragma: no cover - optional dependency check
    yt_dlp = None
    logger.warning("yt_dlp not installed. Remote ingestion disabled: %s", exc)


class DownloadService:
    def __init__(self, config: Settings = settings) -> None:
        self.config = config
        self.library = LibraryPaths(config)

    def download(self, source: str, target_dir: Path | None = None) -> Path:
        if yt_dlp is None:
            raise RuntimeError("yt_dlp is required for remote downloads. Install via `pip install yt-dlp`.")

        target_root = Path(target_dir) if target_dir else self.library.downloads_dir()
        target_root.mkdir(parents=True, exist_ok=True)

        output_template = str(target_root / "%(title).200s.%(ext)s")
        options: Dict[str, Any] = {
            "outtmpl": output_template,
            "format": "bestaudio/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "wav",
                    "preferredquality": "0",
                },
                {
                    "key": "FFmpegMetadata"
                },
            ],
        }

        logger.info("Downloading source", extra={"source": source, "target": output_template})
        with yt_dlp.YoutubeDL(options) as ydl:  # type: ignore[attr-defined]
            result = ydl.extract_info(source, download=True)

        if isinstance(result, dict) and "requested_downloads" in result:
            download = result["requested_downloads"][0]
            file_path = Path(download["_filename"]).with_suffix(".wav")
        elif isinstance(result, dict) and "_filename" in result:
            file_path = Path(result["_filename"]).with_suffix(".wav")
        else:
            raise RuntimeError("Failed to determine download output path")

        return file_path


__all__ = ["DownloadService"]
