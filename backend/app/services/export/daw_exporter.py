"""
DAW Exporter - Rekordbox & Serato Crate Export
Export samples and playlists to DJ software formats
"""
import logging
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import json
import os
import hashlib

logger = logging.getLogger(__name__)


@dataclass
class ExportedTrack:
    """A track to be exported"""
    title: str
    artist: str
    file_path: str
    bpm: float
    key: str
    duration_seconds: float
    energy: float = 0.5
    genre: str = ""
    comment: str = ""
    rating: int = 0  # 0-5 stars
    color: str = ""  # Hex color for crate organization
    cue_points: List[Dict] = None  # List of {time: float, name: str, color: str}
    
    def __post_init__(self):
        if self.cue_points is None:
            self.cue_points = []
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class Crate:
    """A crate/playlist container"""
    name: str
    tracks: List[ExportedTrack]
    color: str = "#00FF00"
    
    def to_dict(self) -> Dict:
        return {
            'name': self.name,
            'color': self.color,
            'track_count': len(self.tracks),
            'tracks': [t.to_dict() for t in self.tracks]
        }


class DAWExporter:
    """
    Export to DJ Software Formats
    
    Supports:
    - Rekordbox XML
    - Serato CSV (for Smart Crates)
    - M3U Playlists
    - JSON (for backup/transfer)
    """
    
    # Rekordbox color codes
    REKORDBOX_COLORS = {
        'pink': 1,
        'red': 2,
        'orange': 3,
        'yellow': 4,
        'green': 5,
        'aqua': 6,
        'blue': 7,
        'purple': 8,
    }
    
    # Serato color codes (RGB)
    SERATO_COLORS = {
        'red': 'CC0000',
        'orange': 'CC8800',
        'yellow': 'CCCC00',
        'green': '00CC00',
        'teal': '00CC88',
        'blue': '0088CC',
        'purple': '8800CC',
        'pink': 'CC0088',
    }
    
    def __init__(self, export_dir: Path):
        self.export_dir = export_dir
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    def export_rekordbox_xml(
        self,
        crates: List[Crate],
        output_name: str = "dj_samples_rekordbox"
    ) -> Path:
        """
        Export tracks and crates to Rekordbox XML format
        
        This XML can be imported into Rekordbox via:
        File > Import > Import Library > rekordbox xml
        """
        logger.info(f"Exporting {len(crates)} crates to Rekordbox XML")
        
        # Create root element
        root = ET.Element('DJ_PLAYLISTS')
        root.set('Version', '1.0.0')
        
        # Product info
        product = ET.SubElement(root, 'PRODUCT')
        product.set('Name', 'DJ Sample Discovery')
        product.set('Version', '1.0.0')
        product.set('Company', 'DJ Sample Discovery')
        
        # Collection
        collection = ET.SubElement(root, 'COLLECTION')
        
        # Track all unique tracks
        all_tracks = {}
        track_id = 1
        
        for crate in crates:
            for track in crate.tracks:
                # Generate unique key
                track_key = f"{track.artist}_{track.title}_{track.file_path}"
                if track_key not in all_tracks:
                    all_tracks[track_key] = {
                        'id': track_id,
                        'track': track
                    }
                    track_id += 1
        
        collection.set('Entries', str(len(all_tracks)))
        
        # Add tracks to collection
        for track_key, track_data in all_tracks.items():
            track = track_data['track']
            track_elem = ET.SubElement(collection, 'TRACK')
            
            # Generate track ID
            track_elem.set('TrackID', str(track_data['id']))
            track_elem.set('Name', track.title)
            track_elem.set('Artist', track.artist)
            track_elem.set('Kind', 'WAV File')
            
            # File location (Rekordbox needs file:// URI on macOS)
            file_uri = self._path_to_file_uri(track.file_path)
            track_elem.set('Location', file_uri)
            
            # Duration in seconds
            track_elem.set('TotalTime', str(int(track.duration_seconds)))
            
            # BPM
            track_elem.set('AverageBpm', f"{track.bpm:.2f}")
            
            # Key (Rekordbox uses different notation)
            rekordbox_key = self._convert_key_to_rekordbox(track.key)
            track_elem.set('Tonality', rekordbox_key)
            
            # Genre and comments
            if track.genre:
                track_elem.set('Genre', track.genre)
            if track.comment:
                track_elem.set('Comments', track.comment)
            
            # Rating (0-255 scale in Rekordbox)
            track_elem.set('Rating', str(track.rating * 51))  # 0-5 to 0-255
            
            # Color
            if track.color:
                color_code = self._hex_to_rekordbox_color(track.color)
                track_elem.set('Colour', str(color_code))
            
            # Add cue points
            for i, cue in enumerate(track.cue_points[:8]):  # Max 8 hot cues
                if cue.get('time') is not None:
                    position_mark = ET.SubElement(track_elem, 'POSITION_MARK')
                    position_mark.set('Name', cue.get('name', f'Cue {i+1}'))
                    position_mark.set('Type', '0')  # 0 = cue, 4 = loop
                    position_mark.set('Start', f"{cue['time']:.3f}")
                    position_mark.set('Num', str(i))
                    
                    cue_color = cue.get('color', '#FF0000')
                    position_mark.set('Red', str(int(cue_color[1:3], 16)))
                    position_mark.set('Green', str(int(cue_color[3:5], 16)))
                    position_mark.set('Blue', str(int(cue_color[5:7], 16)))
        
        # Playlists
        playlists = ET.SubElement(root, 'PLAYLISTS')
        root_folder = ET.SubElement(playlists, 'NODE')
        root_folder.set('Type', '0')  # 0 = folder
        root_folder.set('Name', 'ROOT')
        root_folder.set('Count', str(len(crates)))
        
        # DJ Sample Discovery folder
        dj_folder = ET.SubElement(root_folder, 'NODE')
        dj_folder.set('Type', '0')
        dj_folder.set('Name', 'DJ Sample Discovery')
        dj_folder.set('Count', str(len(crates)))
        
        # Add each crate as a playlist
        for crate in crates:
            playlist_node = ET.SubElement(dj_folder, 'NODE')
            playlist_node.set('Type', '1')  # 1 = playlist
            playlist_node.set('Name', crate.name)
            playlist_node.set('KeyType', '0')  # Track IDs
            playlist_node.set('Entries', str(len(crate.tracks)))
            
            for track in crate.tracks:
                track_key = f"{track.artist}_{track.title}_{track.file_path}"
                if track_key in all_tracks:
                    track_ref = ET.SubElement(playlist_node, 'TRACK')
                    track_ref.set('Key', str(all_tracks[track_key]['id']))
        
        # Write to file with pretty formatting
        xml_string = ET.tostring(root, encoding='unicode')
        dom = minidom.parseString(xml_string)
        pretty_xml = dom.toprettyxml(indent='  ')
        
        # Remove extra whitespace from minidom
        lines = [line for line in pretty_xml.split('\n') if line.strip()]
        final_xml = '\n'.join(lines)
        
        output_path = self.export_dir / f"{output_name}.xml"
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_xml)
        
        logger.info(f"Rekordbox XML exported: {output_path}")
        return output_path
    
    def export_serato_crates(
        self,
        crates: List[Crate],
        output_name: str = "dj_samples_serato"
    ) -> Path:
        """
        Export tracks to Serato-compatible format
        
        Creates:
        - CSV files for Smart Crate rules
        - M3U8 playlists for direct import
        - Subcrates directory structure
        """
        logger.info(f"Exporting {len(crates)} crates for Serato")
        
        serato_dir = self.export_dir / output_name
        serato_dir.mkdir(parents=True, exist_ok=True)
        
        # Create main index
        index = {
            'created': datetime.now().isoformat(),
            'software': 'DJ Sample Discovery',
            'crates': []
        }
        
        for crate in crates:
            # Create M3U8 playlist
            m3u_path = serato_dir / f"{self._safe_filename(crate.name)}.m3u8"
            self._write_m3u8(crate.tracks, m3u_path)
            
            # Create CSV for potential Smart Crate import
            csv_path = serato_dir / f"{self._safe_filename(crate.name)}.csv"
            self._write_serato_csv(crate.tracks, csv_path)
            
            index['crates'].append({
                'name': crate.name,
                'track_count': len(crate.tracks),
                'm3u_file': m3u_path.name,
                'csv_file': csv_path.name
            })
        
        # Write index file
        index_path = serato_dir / 'index.json'
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=2)
        
        logger.info(f"Serato crates exported: {serato_dir}")
        return serato_dir
    
    def export_m3u_playlist(
        self,
        tracks: List[ExportedTrack],
        playlist_name: str
    ) -> Path:
        """Export a simple M3U8 playlist"""
        output_path = self.export_dir / f"{self._safe_filename(playlist_name)}.m3u8"
        self._write_m3u8(tracks, output_path)
        logger.info(f"M3U8 playlist exported: {output_path}")
        return output_path
    
    def export_json_backup(
        self,
        crates: List[Crate],
        output_name: str = "dj_samples_backup"
    ) -> Path:
        """Export complete backup in JSON format for transfer/restore"""
        backup = {
            'version': '1.0',
            'created': datetime.now().isoformat(),
            'software': 'DJ Sample Discovery',
            'crates': [crate.to_dict() for crate in crates]
        }
        
        output_path = self.export_dir / f"{output_name}.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(backup, f, indent=2, ensure_ascii=False)
        
        logger.info(f"JSON backup exported: {output_path}")
        return output_path
    
    def _write_m3u8(self, tracks: List[ExportedTrack], output_path: Path):
        """Write M3U8 playlist file"""
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('#EXTM3U\n')
            f.write('#EXTENC:UTF-8\n')
            f.write(f'# Generated by DJ Sample Discovery - {datetime.now().isoformat()}\n')
            
            for track in tracks:
                # Extended info line
                duration = int(track.duration_seconds)
                f.write(f'#EXTINF:{duration},{track.artist} - {track.title}\n')
                
                # Additional metadata as comments
                f.write(f'#EXTBPM:{track.bpm:.1f}\n')
                f.write(f'#EXTKEY:{track.key}\n')
                
                # File path
                f.write(f'{track.file_path}\n')
    
    def _write_serato_csv(self, tracks: List[ExportedTrack], output_path: Path):
        """Write Serato-compatible CSV file"""
        import csv
        
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            
            # Header row
            writer.writerow([
                'Name', 'Artist', 'BPM', 'Key', 'Duration', 'Genre',
                'Comment', 'Rating', 'File Path'
            ])
            
            for track in tracks:
                writer.writerow([
                    track.title,
                    track.artist,
                    f"{track.bpm:.1f}",
                    track.key,
                    self._format_duration(track.duration_seconds),
                    track.genre,
                    track.comment,
                    track.rating,
                    track.file_path
                ])
    
    def _path_to_file_uri(self, path: str) -> str:
        """Convert file path to file:// URI for Rekordbox"""
        abs_path = os.path.abspath(path)
        # URL encode spaces and special chars
        encoded = abs_path.replace(' ', '%20')
        return f"file://localhost{encoded}"
    
    def _convert_key_to_rekordbox(self, key: str) -> str:
        """Convert key notation to Rekordbox format"""
        # Rekordbox uses standard notation like "Am", "C", "F#m"
        key_clean = key
        
        # Extract key from format like "A minor (8A)"
        if '(' in key:
            key_clean = key.split('(')[0].strip()
        
        # Convert to Rekordbox style
        key_clean = key_clean.replace(' major', '')
        key_clean = key_clean.replace(' minor', 'm')
        
        return key_clean
    
    def _hex_to_rekordbox_color(self, hex_color: str) -> int:
        """Convert hex color to Rekordbox color code (1-8)"""
        # Simplified mapping based on hue
        hex_color = hex_color.lstrip('#')
        try:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            # Simple hue detection
            if r > g and r > b:
                return 2 if g < 100 else 3  # red or orange
            elif g > r and g > b:
                return 5  # green
            elif b > r and b > g:
                return 7  # blue
            elif r > 200 and g > 200:
                return 4  # yellow
            elif r > 200 and b > 200:
                return 1 if g < 100 else 8  # pink or purple
            elif g > 200 and b > 200:
                return 6  # aqua
            else:
                return 0  # no color
        except (ValueError, IndexError):
            return 0
    
    def _safe_filename(self, name: str) -> str:
        """Create a safe filename"""
        import re
        safe = re.sub(r'[<>:"/\\|?*]', '', name)
        safe = re.sub(r'\s+', '_', safe).strip('_')
        return safe[:100]
    
    def _format_duration(self, seconds: float) -> str:
        """Format duration as mm:ss"""
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"


# Helper function to create crates from samples
def create_crates_from_samples(
    samples: List[Dict],
    grouping: str = 'section'  # 'section', 'artist', 'key', 'bpm_range'
) -> List[Crate]:
    """
    Create organized crates from a list of samples
    
    Args:
        samples: List of sample dicts with metadata
        grouping: How to group samples into crates
    
    Returns:
        List of Crate objects
    """
    crates = {}
    
    for sample in samples:
        # Determine crate name based on grouping
        if grouping == 'section':
            crate_name = f"Samples - {sample.get('section_type', 'Unknown').title()}"
        elif grouping == 'artist':
            crate_name = f"Samples - {sample.get('source_artist', 'Unknown')}"
        elif grouping == 'key':
            key = sample.get('key', 'Unknown')
            # Extract Camelot if present
            if '(' in key:
                camelot = key.split('(')[1].rstrip(')')
                crate_name = f"Key {camelot}"
            else:
                crate_name = f"Key {key}"
        elif grouping == 'bpm_range':
            bpm = sample.get('bpm', 0)
            bpm_range = (int(bpm) // 10) * 10
            crate_name = f"BPM {bpm_range}-{bpm_range + 9}"
        else:
            crate_name = "All Samples"
        
        # Create track object
        track = ExportedTrack(
            title=f"{sample.get('source_track', 'Unknown')} ({sample.get('section_type', '').title()} {sample.get('bar_count', 16)}bars)",
            artist=sample.get('source_artist', 'Unknown'),
            file_path=sample.get('file_path', ''),
            bpm=sample.get('bpm', 0),
            key=sample.get('key', ''),
            duration_seconds=sample.get('duration', 0),
            energy=sample.get('energy_level', 0.5),
            comment=f"Section: {sample.get('section_type', '')} | Bars: {sample.get('bar_count', 0)}",
            rating=min(5, int(sample.get('energy_level', 0.5) * 5) + 1)
        )
        
        # Add to crate
        if crate_name not in crates:
            crates[crate_name] = []
        crates[crate_name].append(track)
    
    # Convert to Crate objects
    return [Crate(name=name, tracks=tracks) for name, tracks in crates.items()]


# Singleton
_exporter = None

def get_daw_exporter(export_dir: Path = None) -> DAWExporter:
    global _exporter
    if _exporter is None:
        if export_dir is None:
            from config import DATA_DIR
            export_dir = DATA_DIR / 'exports'
        _exporter = DAWExporter(export_dir)
    return _exporter
