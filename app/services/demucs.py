"""Wrapper around the demucs CLI."""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path
from typing import Iterable, Sequence

from app.core.settings import Settings, settings
from app.services.library import LibraryPaths

logger = logging.getLogger(__name__)


class DemucsService:
    def __init__(self, config: Settings = settings) -> None:
        self.config = config
        self.library = LibraryPaths(config)

    def separate(
        self,
        input_path: Path,
        output_root: Path | None = None,
        stems: Sequence[str] | None = None,
        force: bool = False,
        jobs: int = 1,
    ) -> Path:
        """Run Demucs on the provided file.

        Returns the directory containing rendered stems.
        """

        input_path = Path(input_path).expanduser()
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        demucs_bin = shutil.which("demucs")
        if demucs_bin is None:
            raise RuntimeError("demucs executable not found. Install via `pip install demucs`." )

        slug = self.library.slugify(input_path.stem)
        output_dir = Path(output_root).expanduser() if output_root else self.library.stems_dir(slug)

        cmd: list[str] = [
            demucs_bin,
            "--name",
            slug,
            "--model",
            self.config.demucs_model,
            "--device",
            self.config.demucs_device,
            "--two-stems",
            "false",
            "--jobs",
            str(jobs),
            "--out",
            str(output_dir.parent),
        ]

        if stems:
            for stem in stems:
                cmd.extend(["--stem", stem])

        if force:
            cmd.append("--overwrite")

        cmd.append(str(input_path))

        logger.info("Running Demucs", extra={"cmd": cmd, "input": str(input_path), "output": str(output_dir)})
        subprocess.run(cmd, check=True)

        return output_dir / slug


__all__ = ["DemucsService"]
