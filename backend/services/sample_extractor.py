"""
Intelligent Sample Extraction Service
Extracts the best samples from tracks based on section analysis
"""
import logging
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np
import soundfile as sf

from config import (
    SAMPLES_DIR, SAMPLE_RATE, DEFAULT_SAMPLE_BARS,
    SAMPLE_BAR_OPTIONS, MIN_SAMPLE_BARS, MAX_SAMPLE_BARS
)
from services.audio_analyzer import get_audio_analyzer, AnalysisResult, Section
from services.stem_separator import get_stem_manager

logger = logging.getLogger(__name__)


@dataclass
class Sample:
    """Represents an extracted sample"""
    id: str
    source_file: str
    source_track: str
    source_artist: str
    start_time: float
    end_time: float
    duration: float
    bar_count: int
    section_type: str
    energy_level: float
    bpm: float
    key: str
    file_path: str
    waveform_peaks: List[float]
    stems_available: bool = False
    stems: Dict[str, str] = None
    
    def __post_init__(self):
        if self.stems is None:
            self.stems = {}
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class ExtractionJob:
    """A sample extraction job"""
    track_path: str
    artist: str
    title: str
    bar_count: int = DEFAULT_SAMPLE_BARS
    section_preference: Optional[str] = None  # 'drop', 'chorus', 'breakdown', etc.
    extract_stems: bool = False
    selected_stems: Optional[List[str]] = None


class SampleExtractor:
    """
    Intelligently extracts DJ-ready samples from tracks
    """
    
    def __init__(self):
        self.samples_dir = SAMPLES_DIR
        self.analyzer = get_audio_analyzer()
        self.stem_manager = get_stem_manager()
    
    def extract_samples(
        self,
        track_path: Path,
        artist: str,
        title: str,
        bar_count: int = DEFAULT_SAMPLE_BARS,
        section_preference: Optional[str] = None,
        extract_stems: bool = False,
        selected_stems: Optional[List[str]] = None,
        max_samples: int = 3
    ) -> List[Sample]:
        """
        Extract intelligent samples from a track
        
        Args:
            track_path: Path to the audio file
            artist: Artist name
            title: Track title
            bar_count: Number of bars per sample (4, 8, 16, 32, 64)
            section_preference: Preferred section type ('drop', 'chorus', etc.)
            extract_stems: Whether to also extract stems for each sample
            selected_stems: Which stems to extract (default: all)
            max_samples: Maximum number of samples to extract
        
        Returns:
            List of Sample objects
        """
        if bar_count not in SAMPLE_BAR_OPTIONS:
            bar_count = DEFAULT_SAMPLE_BARS
        
        logger.info(f"Extracting samples from: {track_path}")
        
        # Analyze the track
        analysis = self.analyzer.analyze(track_path)
        
        # Calculate sample duration based on BPM and bar count
        beats_per_bar = 4
        bar_duration = (60 / analysis.bpm) * beats_per_bar
        sample_duration = bar_duration * bar_count
        
        # Get best sample points
        sample_points = self._select_best_sample_points(
            analysis,
            sample_duration,
            section_preference,
            max_samples
        )
        
        samples = []
        
        for i, point in enumerate(sample_points):
            # Generate unique ID
            sample_id = self._generate_sample_id(track_path, point['start_time'], bar_count)
            
            # Create output path
            safe_name = self._safe_filename(f"{artist} - {title}")
            sample_filename = f"{safe_name}_sample{i+1}_{point['section_type']}_{bar_count}bars.wav"
            sample_path = self.samples_dir / sample_filename
            
            # Extract the sample
            success = self._extract_audio_segment(
                track_path,
                point['start_time'],
                sample_duration,
                sample_path
            )
            
            if not success:
                logger.error(f"Failed to extract sample {i+1}")
                continue
            
            # Generate waveform for this sample
            waveform = self._generate_sample_waveform(sample_path)
            
            # Extract stems if requested
            stems_dict = {}
            stems_available = False
            
            if extract_stems:
                stem_result = self.stem_manager.get_or_create_stems(
                    sample_path,
                    selected_stems
                )
                if stem_result.success:
                    stems_dict = stem_result.stems
                    stems_available = True
            
            sample = Sample(
                id=sample_id,
                source_file=str(track_path),
                source_track=title,
                source_artist=artist,
                start_time=point['start_time'],
                end_time=point['start_time'] + sample_duration,
                duration=sample_duration,
                bar_count=bar_count,
                section_type=point['section_type'],
                energy_level=point['energy_level'],
                bpm=analysis.bpm,
                key=analysis.key,
                file_path=str(sample_path),
                waveform_peaks=waveform,
                stems_available=stems_available,
                stems=stems_dict
            )
            
            samples.append(sample)
            logger.info(f"Extracted sample: {sample_path}")
        
        return samples
    
    def _select_best_sample_points(
        self,
        analysis: AnalysisResult,
        sample_duration: float,
        section_preference: Optional[str],
        max_samples: int
    ) -> List[Dict]:
        """Select the best points to extract samples from"""
        
        # Start with analyzed best points
        candidates = analysis.best_sample_points.copy()
        
        # If section preference specified, prioritize those
        if section_preference:
            # Move preferred sections to front
            preferred = [p for p in candidates if p['section_type'] == section_preference]
            others = [p for p in candidates if p['section_type'] != section_preference]
            candidates = preferred + others
        
        # Add more candidates from sections if needed
        if len(candidates) < max_samples:
            for section in analysis.sections:
                if section.duration >= sample_duration:
                    # Calculate bar-aligned start time
                    bpm = analysis.bpm
                    bar_duration = (60 / bpm) * 4
                    aligned_start = int(section.start_time / bar_duration) * bar_duration
                    
                    # Check if this point is already in candidates
                    is_duplicate = any(
                        abs(c['start_time'] - aligned_start) < bar_duration
                        for c in candidates
                    )
                    
                    if not is_duplicate:
                        candidates.append({
                            'start_time': aligned_start,
                            'section_type': section.type,
                            'energy_level': section.energy_level,
                            'is_drop': section.is_drop,
                            'is_breakdown': section.is_breakdown
                        })
        
        # Ensure samples don't exceed track duration
        valid_candidates = []
        for c in candidates:
            if c['start_time'] + sample_duration <= analysis.duration:
                valid_candidates.append(c)
            elif c['start_time'] < analysis.duration:
                # Adjust start time to fit
                adjusted_start = analysis.duration - sample_duration
                if adjusted_start >= 0:
                    c['start_time'] = adjusted_start
                    valid_candidates.append(c)
        
        # Score and sort candidates
        def score_candidate(c):
            score = 0
            
            # Higher energy = better (for most DJ use cases)
            score += c['energy_level'] * 10
            
            # Prefer drops and choruses
            if c.get('is_drop'):
                score += 20
            elif c['section_type'] == 'chorus':
                score += 15
            elif c['section_type'] == 'breakdown':
                score += 5  # Breakdowns useful for mixing
            
            # If preference matches, big bonus
            if section_preference and c['section_type'] == section_preference:
                score += 30
            
            return score
        
        valid_candidates.sort(key=score_candidate, reverse=True)
        
        # Remove duplicates (samples too close together)
        final_candidates = []
        min_gap = sample_duration * 0.5  # At least 50% of sample duration apart
        
        for c in valid_candidates:
            is_too_close = any(
                abs(c['start_time'] - fc['start_time']) < min_gap
                for fc in final_candidates
            )
            if not is_too_close:
                final_candidates.append(c)
            
            if len(final_candidates) >= max_samples:
                break
        
        return final_candidates
    
    def _extract_audio_segment(
        self,
        source_path: Path,
        start_time: float,
        duration: float,
        output_path: Path
    ) -> bool:
        """Extract an audio segment with proper fades"""
        return self.analyzer.extract_sample(
            source_path,
            start_time,
            duration,
            output_path
        )
    
    def _generate_sample_waveform(self, sample_path: Path, num_points: int = 200) -> List[float]:
        """Generate waveform peaks for a sample"""
        try:
            import librosa
            y, sr = librosa.load(str(sample_path), sr=SAMPLE_RATE, mono=True)
            
            samples_per_point = len(y) // num_points
            peaks = []
            
            for i in range(num_points):
                start = i * samples_per_point
                end = start + samples_per_point
                segment = np.abs(y[start:end])
                peaks.append(float(np.max(segment)))
            
            # Normalize
            max_peak = max(peaks) if peaks else 1
            peaks = [p / max_peak for p in peaks]
            
            return peaks
        except Exception as e:
            logger.error(f"Waveform generation error: {e}")
            return [0.5] * num_points
    
    def _generate_sample_id(self, track_path: Path, start_time: float, bar_count: int) -> str:
        """Generate unique sample ID"""
        unique_string = f"{track_path}_{start_time}_{bar_count}"
        return hashlib.md5(unique_string.encode()).hexdigest()[:12]
    
    def _safe_filename(self, name: str) -> str:
        """Generate safe filename"""
        import re
        safe = re.sub(r'[<>:"/\\|?*]', '', name)
        safe = re.sub(r'\s+', ' ', safe).strip()
        return safe[:100]
    
    def extract_custom_sample(
        self,
        track_path: Path,
        start_time: float,
        end_time: float,
        artist: str,
        title: str,
        extract_stems: bool = False
    ) -> Optional[Sample]:
        """
        Extract a custom sample with user-specified start/end times
        """
        duration = end_time - start_time
        if duration <= 0:
            return None
        
        # Analyze for metadata
        analysis = self.analyzer.analyze(track_path)
        
        # Calculate bar count (approximate)
        bar_duration = (60 / analysis.bpm) * 4
        bar_count = int(round(duration / bar_duration))
        bar_count = max(MIN_SAMPLE_BARS, min(bar_count, MAX_SAMPLE_BARS))
        
        # Determine section type based on position
        section_type = 'custom'
        for section in analysis.sections:
            if section.start_time <= start_time < section.end_time:
                section_type = section.type
                break
        
        # Calculate energy level for this region
        energy_arr = np.array(analysis.energy_profile)
        start_idx = int((start_time / analysis.duration) * len(energy_arr))
        end_idx = int((end_time / analysis.duration) * len(energy_arr))
        energy_level = float(np.mean(energy_arr[start_idx:end_idx])) if end_idx > start_idx else 0.5
        
        # Generate ID and paths
        sample_id = self._generate_sample_id(track_path, start_time, bar_count)
        safe_name = self._safe_filename(f"{artist} - {title}")
        sample_filename = f"{safe_name}_custom_{start_time:.1f}s.wav"
        sample_path = self.samples_dir / sample_filename
        
        # Extract
        success = self._extract_audio_segment(
            track_path, start_time, duration, sample_path
        )
        
        if not success:
            return None
        
        waveform = self._generate_sample_waveform(sample_path)
        
        # Stems
        stems_dict = {}
        stems_available = False
        if extract_stems:
            stem_result = self.stem_manager.get_or_create_stems(sample_path)
            if stem_result.success:
                stems_dict = stem_result.stems
                stems_available = True
        
        return Sample(
            id=sample_id,
            source_file=str(track_path),
            source_track=title,
            source_artist=artist,
            start_time=start_time,
            end_time=end_time,
            duration=duration,
            bar_count=bar_count,
            section_type=section_type,
            energy_level=energy_level,
            bpm=analysis.bpm,
            key=analysis.key,
            file_path=str(sample_path),
            waveform_peaks=waveform,
            stems_available=stems_available,
            stems=stems_dict
        )


# Singleton
_extractor = None

def get_sample_extractor() -> SampleExtractor:
    global _extractor
    if _extractor is None:
        _extractor = SampleExtractor()
    return _extractor
