"""
Traktor NML beatgrid importer.

Parses a Traktor Pro 4 collection.nml file, extracts BPM + beatgrid anchor
(INIZIO) per track, matches them to the local library by filename, and writes
the data into each track's metadata.  Optionally triggers a loop re-slice so
loops align to the Traktor-verified beatgrid immediately.

Traktor stores its beatgrid in the TEMPO element:
    <TEMPO BPM="128.000" BPM_QUALITY="100.000" INIZIO="0.023" />

INIZIO is the beatgrid anchor in **seconds** — the position of the first beat
of bar 1.  All bar positions derive from: anchor + N * (60/bpm).
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class TraktorEntry:
    filename: str          # bare filename, e.g. "my_track.wav"
    title: str
    artist: str
    bpm: float
    anchor: float          # beatgrid anchor in seconds (INIZIO)
    bpm_quality: float     # 0–100; Traktor sets 100 after user confirmation


def parse_traktor_nml(nml_path: Path) -> list[TraktorEntry]:
    """Parse a Traktor collection.nml and return entries that have TEMPO data."""
    tree = ET.parse(str(nml_path))
    root = tree.getroot()

    entries: list[TraktorEntry] = []
    for entry in root.iter("ENTRY"):
        location = entry.find("LOCATION")
        tempo = entry.find("TEMPO")
        if location is None or tempo is None:
            continue

        filename = location.get("FILE", "").strip()
        bpm_str = tempo.get("BPM", "")
        inizio_str = tempo.get("INIZIO", "")
        if not filename or not bpm_str or not inizio_str:
            continue

        try:
            bpm = float(bpm_str)
            anchor = float(inizio_str)
            bpm_quality = float(tempo.get("BPM_QUALITY", "0") or "0")
        except ValueError:
            continue

        entries.append(
            TraktorEntry(
                filename=filename,
                title=entry.get("TITLE", "").strip(),
                artist=entry.get("ARTIST", "").strip(),
                bpm=bpm,
                anchor=anchor,
                bpm_quality=bpm_quality,
            )
        )

    logger.info("Parsed %d Traktor entries from %s", len(entries), nml_path.name)
    return entries


def match_and_apply(
    entries: list[TraktorEntry],
    pipeline,  # PipelineOrchestrator — avoid circular import
) -> dict:
    """
    Match NML entries to library tracks by filename (case-insensitive),
    write BPM + beatgrid_anchor into track metadata, and return a report.
    """
    from app.services.db import db

    # Build a lookup: bare filename (lower) → track record
    track_by_filename: dict[str, object] = {}
    for track in pipeline._tracks.values():
        if track.original_path:
            track_by_filename[track.original_path.name.lower()] = track

    matched: list[dict] = []
    skipped: list[str] = []

    for entry in entries:
        key = entry.filename.lower()
        track = track_by_filename.get(key)
        if track is None:
            skipped.append(entry.filename)
            continue

        # Apply Traktor's BPM and anchor
        track.bpm = entry.bpm
        track.metadata["beatgrid_anchor"] = entry.anchor
        track.metadata["traktor_bpm_quality"] = entry.bpm_quality
        db.save_track(track)

        matched.append(
            {
                "track_id": str(track.track_id),
                "title": track.title,
                "filename": entry.filename,
                "bpm": entry.bpm,
                "anchor": entry.anchor,
                "bpm_quality": entry.bpm_quality,
            }
        )
        logger.info(
            "Applied Traktor beatgrid to '%s': bpm=%.2f anchor=%.4fs quality=%.0f",
            track.title,
            entry.bpm,
            entry.anchor,
            entry.bpm_quality,
        )

    return {
        "matched": matched,
        "skipped": skipped,
        "matched_count": len(matched),
        "skipped_count": len(skipped),
    }
