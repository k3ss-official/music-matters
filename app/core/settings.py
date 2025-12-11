"""Application configuration utilities."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    project_name: str = "Music Matters"
    version: str = "0.1.0"
    log_level: str = "INFO"

    workspace_root: Path = ROOT
    library_root: Path = Path("/Volumes/hotblack-2tb/mm-files")
    downloads_dir: Path | None = None
    stems_dir: Path | None = None
    loops_dir: Path | None = None
    projects_dir: Path | None = None
    cache_dir: Path | None = None
    sqlite_path: Path = ROOT / ".local" / "music-matters.db"

    demucs_model: str = "htdemucs_ft"
    demucs_device: str = "mps"
    normalise_lufs: float = -14.0
    target_sample_rate: int = 48_000
    chunk_size: int = 1_048_576

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", env_nested_delimiter="__")

    @property
    def resolved_downloads_dir(self) -> Path:
        return (self.downloads_dir or (self.library_root / "downloads")).expanduser()

    @property
    def resolved_stems_dir(self) -> Path:
        return (self.stems_dir or (self.library_root / "stems" / "separated")).expanduser()

    @property
    def resolved_loops_dir(self) -> Path:
        return (self.loops_dir or (self.library_root / "loops" / "generated")).expanduser()

    @property
    def resolved_projects_dir(self) -> Path:
        return (self.projects_dir or (self.library_root / "projects")).expanduser()

    @property
    def resolved_cache_dir(self) -> Path:
        return (self.cache_dir or (self.library_root / "cache")).expanduser()

    def ensure_directories(self) -> None:
        for path in {
            self.workspace_root,
            self.library_root,
            self.resolved_downloads_dir,
            self.resolved_stems_dir,
            self.resolved_loops_dir,
            self.resolved_projects_dir,
            self.resolved_cache_dir,
        }:
            path.expanduser().mkdir(parents=True, exist_ok=True)

        db_parent = self.sqlite_path.expanduser().parent
        db_parent.mkdir(parents=True, exist_ok=True)


def _load_yaml_settings() -> Dict[str, Any]:
    yaml_path = ROOT / "config" / "settings.yaml"
    if not yaml_path.exists():
        return {}

    with yaml_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    flattened: Dict[str, Any] = {}
    for section, values in data.items():
        if isinstance(values, dict):
            for key, value in values.items():
                flattened[f"{section}_{key}"] = value
        else:
            flattened[section] = values
    return flattened


def _merge_settings() -> Dict[str, Any]:
    payload = _load_yaml_settings()
    merged: Dict[str, Any] = {}
    for key, value in payload.items():
        if key.startswith("paths_"):
            merged[key.replace("paths_", "")] = value
        elif key.startswith("processing_"):
            merged[key.replace("processing_", "")] = value
        elif key.startswith("metadata_"):
            merged[key.replace("metadata_", "")] = value
        else:
            merged[key] = value
    return merged


def configure_logging(level: str | None = None) -> None:
    target = (level or settings.log_level).upper()
    numeric_level = getattr(logging, target, logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def build_settings() -> Settings:
    merged = _merge_settings()
    return Settings(**merged)


settings = build_settings()
