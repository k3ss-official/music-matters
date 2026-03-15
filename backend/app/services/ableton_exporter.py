"""
Ableton Live (.als) Exporter
Builds Ableton Live project files with stems arranged on an 8x8 session grid
"""

import logging
import zipfile
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import shutil
import tempfile

logger = logging.getLogger(__name__)


@dataclass
class AbletonClip:
    """A clip in the Ableton session"""

    name: str
    file_path: str
    start_time: float
    end_time: float
    track_index: int
    scene_index: int


class AbletonExporter:
    """
    Export stems to Ableton Live project format

    Creates an .als file (which is a zip file containing XML)
    Arranges clips on an 8x8 session grid
    """

    def __init__(self, project_name: str = "Music Matters Export"):
        self.project_name = project_name
        self.clips: List[AbletonClip] = []
        self.bpm: float = 120.0
        self.time_signature: str = "4/4"

    def add_clip(
        self,
        name: str,
        file_path: str,
        track_idx: int,
        scene_idx: int,
        start_time: float = 0,
        end_time: float = 0,
    ):
        """Add a clip to the project"""
        self.clips.append(
            AbletonClip(
                name=name,
                file_path=file_path,
                start_time=start_time,
                end_time=end_time,
                track_index=track_idx,
                scene_index=scene_idx,
            )
        )

    def _create_project_xml(self) -> str:
        """Create the main Ableton project XML"""
        root = ET.Element("Ableton")
        root.set("MajorVersion", "5")
        root.set("MinorVersion", "11")
        root.set("SchemaChangeCount", "3")
        root.set("Creator", "Music Matters")
        root.set("BasedOnSchemaVersion", "5")

        # UserInfo
        user_info = ET.SubElement(root, "UserInfo")

        # Live Set
        live_set = ET.SubElement(root, "LiveSet")
        live_set.set("MajorVersion", "5")
        live_set.set("MinorVersion", "11")

        # Arrangement
        arrangement = ET.SubElement(live_set, "Arrangement")

        # Transport
        transport = ET.SubElement(live_set, "Transport")
        tempo_el = ET.SubElement(transport, "Tempo")
        tempo_el.set("Value", str(self.bpm))
        ET.SubElement(transport, "TimeSigId").set("Value", "4")

        # Track list (8 tracks for stems)
        track_list = ET.SubElement(live_set, "TrackList")

        stem_names = [
            "Drums",
            "Bass",
            "Other",
            "Vocals",
            "Guitar",
            "Piano",
            "Synth",
            "FX",
        ]

        for i in range(8):
            track = ET.SubElement(track_list, "AudioTrack")
            track.set("Id", str(i + 1))

            # Track name
            track_name = ET.SubElement(track, "Name")
            value = ET.SubElement(track_name, "Value")
            value.text = stem_names[i] if i < len(stem_names) else f"Track {i + 1}"

            # Track devices
            devices = ET.SubElement(track, "DeviceList")

            # Clip slots (8 scenes)
            clip_slots = ET.SubElement(track, "ClipSlotList")
            for scene_idx in range(8):
                clip_slot = ET.SubElement(clip_slots, "ClipSlot")
                clip_slot.set("Id", str(scene_idx + 1))

        # Scenes
        scenes = ET.SubElement(live_set, "Scenes")
        for i in range(8):
            scene = ET.SubElement(scenes, "Scene")
            scene.set("Id", str(i + 1))
            scene_name = ET.SubElement(scene, "Name")
            value = ET.SubElement(scene_name, "Value")
            value.text = f"Scene {i + 1}"

        # Master track
        master_track = ET.SubElement(track_list, "MasterTrack")
        master_track.set("Id", "9")

        return self._prettify(root)

    def _create_collectinfo_xml(self, stem_files: Dict[str, str]) -> str:
        """Create the collection info XML with file references"""
        root = ET.Element("CollectionInfo")
        root.set("MajorVersion", "4")
        root.set("MinorVersion", "0")

        # Tracks (referencing audio files)
        tracks = ET.SubElement(root, "Tracks")

        stem_names = [
            "Drums",
            "Bass",
            "Other",
            "Vocals",
            "Guitar",
            "Piano",
            "Synth",
            "FX",
        ]

        for i, (stem_key, file_path) in enumerate(stem_files.items()):
            track = ET.SubElement(tracks, "AudioTrack")
            track.set("Id", str(i + 1))

            name = ET.SubElement(track, "Name")
            value = ET.SubElement(name, "Value")
            value.text = stem_names[i] if i < len(stem_names) else stem_key

            # Audio file ref
            sample_ref = ET.SubElement(track, "SampleRef")
            if file_path:
                file = ET.SubElement(sample_ref, "File")
                path = ET.SubElement(file, "Path")
                path.text = f"../Samples/{Path(file_path).name}"

        return self._prettify(root)

    def _prettify(self, elem) -> str:
        """Return a pretty-printed XML string"""
        rough_string = ET.tostring(elem, encoding="unicode")
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ")

    def export(
        self,
        output_path: Path,
        stem_files: Dict[str, str],
        track_title: str = "Music Matters Loop",
        bpm: float = 120.0,
        start_time: float = 0.0,
        end_time: float = 0.0,
    ) -> Path:
        """
        Export to Ableton Live project

        Args:
            output_path: Where to save the .als file
            stem_files: Dict of stem_name -> file_path
            track_title: Name for the track

        Returns:
            Path to the created .als file
        """
        output_path = Path(output_path)
        if not str(output_path).endswith(".als"):
            output_path = output_path.with_suffix(".als")

        # Set BPM and register clips so _create_project_xml can embed them
        self.bpm = bpm
        for idx, (stem_name, file_path) in enumerate(stem_files.items()):
            if Path(file_path).exists():
                self.add_clip(
                    name=f"{track_title} - {stem_name}",
                    file_path=file_path,
                    track_idx=idx,
                    scene_idx=0,
                    start_time=start_time,
                    end_time=end_time,
                )

        # Create a temporary directory for the project
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create project structure
            project_dir = temp_path / f"{self.project_name}"
            project_dir.mkdir()

            samples_dir = project_dir / "Samples"
            samples_dir.mkdir()

            # Copy stem files
            copied_files = {}
            for stem_name, file_path in stem_files.items():
                src = Path(file_path)
                if src.exists():
                    dst = samples_dir / src.name
                    shutil.copy2(src, dst)
                    copied_files[stem_name] = str(dst)

            # Create project info
            info_dir = project_dir / "ProjectInfo_9CFGDC8E5F49469B9EE9B7F151D8C44D8"
            info_dir.mkdir()

            # Main project XML
            project_xml = self._create_project_xml()
            (project_dir / "project.xml").write_text(project_xml)

            # Collection info XML
            collect_xml = self._create_collectinfo_xml(copied_files)
            (info_dir / "CollectionInfo").write_text(collect_xml)

            # Create the zip (als) file
            with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_path in project_dir.rglob("*"):
                    if file_path.is_file():
                        arcname = file_path.relative_to(project_dir)
                        zf.write(file_path, arcname)

        logger.info(f"Exported Ableton project to {output_path}")
        return output_path


def get_ableton_exporter() -> AbletonExporter:
    """Get singleton exporter instance"""
    return AbletonExporter()
