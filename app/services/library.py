"""Helpers for working with the managed audio library."""

from __future__ import annotations

import re
from pathlib import Path

from app.core.settings import Settings, settings

_SLUG_PATTERN = re.compile(r"[^a-z0-9-]+")


class LibraryPaths:
    def __init__(self, config: Settings = settings) -> None:
        self.config = config

    # ------------------------------------------------------------------
    # Setup helpers
    # ------------------------------------------------------------------
    def ensure_structure(self) -> None:
        self.config.ensure_directories()

    # ------------------------------------------------------------------
    # Path helpers
    # ------------------------------------------------------------------
    def slugify(self, value: str) -> str:
        slug = value.strip().lower().replace(" ", "-")
        slug = _SLUG_PATTERN.sub("-", slug)
        return re.sub(r"-+", "-", slug).strip("-")

    def downloads_dir(self) -> Path:
        return self.config.resolved_downloads_dir

    def stems_dir(self, slug: str) -> Path:
        path = self.config.resolved_stems_dir / slug
        path.mkdir(parents=True, exist_ok=True)
        return path

    def loops_dir(self, slug: str) -> Path:
        path = self.config.resolved_loops_dir / slug
        path.mkdir(parents=True, exist_ok=True)
        return path

    def project_dir(self, slug: str) -> Path:
        path = self.config.resolved_projects_dir / slug
        path.mkdir(parents=True, exist_ok=True)
        return path

    def metadata_path(self, slug: str) -> Path:
        return self.config.resolved_cache_dir / f"{slug}.metadata.json"
