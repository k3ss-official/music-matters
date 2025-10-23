#!/usr/bin/env python3
"""CLI helper to run Demucs jobs using repo configuration."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from app.core.settings import settings  # noqa: E402
from app.services.demucs import DemucsService  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run Demucs separation using project settings")
    parser.add_argument("--input", required=True, help="Path to the audio file to separate")
    parser.add_argument("--output", help="Optional override for output directory")
    parser.add_argument("--model", default=settings.demucs_model, help="Demucs model name")
    parser.add_argument("--device", default=settings.demucs_device, help="Compute device (mps/cpu/cuda)")
    parser.add_argument("--jobs", type=int, default=1, help="Parallel jobs for Demucs")
    parser.add_argument("--force", action="store_true", help="Overwrite existing stems")
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = settings.model_copy(update={
        "demucs_model": args.model,
        "demucs_device": args.device,
    })

    service = DemucsService(config)
    output = service.separate(
        input_path=Path(args.input),
        output_root=Path(args.output) if args.output else None,
        force=args.force,
        jobs=args.jobs,
    )
    print(f"Stems written to {output}")


if __name__ == "__main__":
    main()
