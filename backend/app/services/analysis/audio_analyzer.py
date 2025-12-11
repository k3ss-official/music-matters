"""
Audio Analysis Service
BPM detection, key detection, section segmentation, and energy analysis
"""
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np

import librosa
import soundfile as sf

from config import (
    SAMPLE_RATE, ENERGY_HOP_LENGTH, ENERGY_FRAME_LENGTH,
    MIN_SECTION_LENGTH_SECONDS, SECTION_TYPES, DEFAULT_SAMPLE_BARS
)

logger = logging.getLogger(__name__)


@dataclass
class Section:
    """Represents a detected section of a track"""
    type: str  # intro, verse, chorus, breakdown, drop, bridge, outro
    start_time: float  # seconds
    end_time: float  # seconds
    energy_level: float  # 0-1 normalized
    is_breakdown: bool = False
    is_drop: bool = False
    confidence: float = 1.0
    
    @property
    def duration(self) -> float:
        return self.end_time - self.start_time
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AnalysisResult:
    """Complete analysis result for a track"""
    file_path: str
    duration: float  # seconds
    bpm: float
    key: str  # e.g., "C major", "A minor"
    time_signature: int  # e.g., 4 for 4/4
    energy_profile: List[float]  # normalized energy values
    sections: List[Section]
    best_sample_points: List[Dict]  # Best points to take samples from
    waveform_peaks: List[float]  # For visualization
    
    def to_dict(self) -> Dict:
        return {
            'file_path': self.file_path,
            'duration': self.duration,
            'bpm': self.bpm,
            'key': self.key,
            'time_signature': self.time_signature,
            'energy_profile': self.energy_profile,
            'sections': [s.to_dict() for s in self.sections],
            'best_sample_points': self.best_sample_points,
            'waveform_peaks': self.waveform_peaks
        }


class AudioAnalyzer:
    """Analyzes audio files for DJ-relevant features"""
    
    # Key mappings for Camelot wheel compatibility
    CAMELOT_KEYS = {
        'C major': '8B', 'A minor': '8A',
        'G major': '9B', 'E minor': '9A',
        'D major': '10B', 'B minor': '10A',
        'A major': '11B', 'F# minor': '11A',
        'E major': '12B', 'C# minor': '12A',
        'B major': '1B', 'G# minor': '1A',
        'F# major': '2B', 'D# minor': '2A',
        'Db major': '3B', 'Bb minor': '3A',
        'Ab major': '4B', 'F minor': '4A',
        'Eb major': '5B', 'C minor': '5A',
        'Bb major': '6B', 'G minor': '6A',
        'F major': '7B', 'D minor': '7A',
    }
    
    # Chroma to key mapping
    PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    def __init__(self):
        self.sample_rate = SAMPLE_RATE
    
    def analyze(self, file_path: Path) -> AnalysisResult:
        """Perform complete analysis of an audio file"""
        logger.info(f"Analyzing: {file_path}")
        
        # Load audio
        y, sr = librosa.load(str(file_path), sr=self.sample_rate, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Detect tempo/BPM
        bpm = self._detect_bpm(y, sr)
        
        # Detect key
        key = self._detect_key(y, sr)
        
        # Detect time signature (basic: assume 4/4 for now)
        time_signature = 4
        
        # Calculate energy profile
        energy_profile = self._calculate_energy_profile(y, sr)
        
        # Detect sections
        sections = self._detect_sections(y, sr, energy_profile, bpm)
        
        # Find best sample points
        best_sample_points = self._find_best_sample_points(
            y, sr, sections, energy_profile, bpm, duration
        )
        
        # Generate waveform peaks for visualization (downsampled)
        waveform_peaks = self._generate_waveform_peaks(y, num_points=500)
        
        return AnalysisResult(
            file_path=str(file_path),
            duration=duration,
            bpm=bpm,
            key=key,
            time_signature=time_signature,
            energy_profile=energy_profile,
            sections=sections,
            best_sample_points=best_sample_points,
            waveform_peaks=waveform_peaks
        )
    
    def _detect_bpm(self, y: np.ndarray, sr: int) -> float:
        """Detect tempo in BPM"""
        try:
            # Use librosa's beat tracking
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            
            # Handle array return type in newer librosa
            if isinstance(tempo, np.ndarray):
                tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
            
            # Round to 1 decimal
            return round(float(tempo), 1)
        except Exception as e:
            logger.error(f"BPM detection error: {e}")
            return 120.0  # Default fallback
    
    def _detect_key(self, y: np.ndarray, sr: int) -> str:
        """Detect musical key using chroma features"""
        try:
            # Compute chroma features
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            
            # Average chroma across time
            chroma_avg = np.mean(chroma, axis=1)
            
            # Find dominant pitch class
            dominant_pitch = np.argmax(chroma_avg)
            root_note = self.PITCH_CLASS_NAMES[dominant_pitch]
            
            # Determine major/minor using chord template matching
            # Major template: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
            # Minor template: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
            
            major_template = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0])
            minor_template = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0])
            
            # Roll templates to match detected root
            major_template = np.roll(major_template, dominant_pitch)
            minor_template = np.roll(minor_template, dominant_pitch)
            
            # Calculate correlation
            major_corr = np.corrcoef(chroma_avg, major_template)[0, 1]
            minor_corr = np.corrcoef(chroma_avg, minor_template)[0, 1]
            
            mode = 'major' if major_corr > minor_corr else 'minor'
            key = f"{root_note} {mode}"
            
            # Add Camelot notation if available
            camelot = self.CAMELOT_KEYS.get(key, '')
            if camelot:
                key = f"{key} ({camelot})"
            
            return key
            
        except Exception as e:
            logger.error(f"Key detection error: {e}")
            return "Unknown"
    
    def _calculate_energy_profile(self, y: np.ndarray, sr: int) -> List[float]:
        """Calculate energy profile over time"""
        try:
            # Calculate RMS energy
            rms = librosa.feature.rms(
                y=y,
                frame_length=ENERGY_FRAME_LENGTH,
                hop_length=ENERGY_HOP_LENGTH
            )[0]
            
            # Normalize to 0-1
            rms_normalized = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)
            
            # Smooth with moving average
            window = 10
            rms_smoothed = np.convolve(rms_normalized, np.ones(window)/window, mode='same')
            
            return rms_smoothed.tolist()
            
        except Exception as e:
            logger.error(f"Energy calculation error: {e}")
            return []
    
    def _detect_sections(
        self,
        y: np.ndarray,
        sr: int,
        energy_profile: List[float],
        bpm: float
    ) -> List[Section]:
        """Detect sections (intro, verse, chorus, breakdown, drop, outro)"""
        sections = []
        duration = len(y) / sr
        
        try:
            # Use librosa's segmentation based on spectral clustering
            # Compute beat-synchronous chroma
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            
            # Build recurrence matrix for structure analysis
            rec = librosa.segment.recurrence_matrix(
                chroma,
                mode='affinity',
                metric='cosine',
                sparse=True
            )
            
            # Get segment boundaries using spectral clustering
            bounds = librosa.segment.agglomerative(chroma, k=None)
            bound_times = librosa.frames_to_time(bounds, sr=sr)
            
            # Ensure we have at least start and end
            if len(bound_times) == 0:
                bound_times = [0, duration]
            else:
                # Add start and end if needed
                if bound_times[0] > 1.0:
                    bound_times = np.insert(bound_times, 0, 0)
                if bound_times[-1] < duration - 1.0:
                    bound_times = np.append(bound_times, duration)
            
            # Calculate energy for each segment
            energy_arr = np.array(energy_profile) if energy_profile else np.ones(100)
            
            # Classify each segment
            for i in range(len(bound_times) - 1):
                start = bound_times[i]
                end = bound_times[i + 1]
                
                # Skip very short segments
                if end - start < MIN_SECTION_LENGTH_SECONDS:
                    continue
                
                # Calculate average energy for this segment
                start_idx = int((start / duration) * len(energy_arr))
                end_idx = int((end / duration) * len(energy_arr))
                segment_energy = np.mean(energy_arr[start_idx:end_idx]) if end_idx > start_idx else 0.5
                
                # Classify section type based on position and energy
                section_type = self._classify_section(
                    start, end, duration, segment_energy, i, len(bound_times) - 2
                )
                
                sections.append(Section(
                    type=section_type,
                    start_time=float(start),
                    end_time=float(end),
                    energy_level=float(segment_energy),
                    is_breakdown=section_type == 'breakdown',
                    is_drop=section_type == 'drop'
                ))
            
            # If no sections detected, create basic structure
            if not sections:
                sections = self._create_basic_sections(duration, energy_profile)
                
        except Exception as e:
            logger.error(f"Section detection error: {e}")
            sections = self._create_basic_sections(duration, energy_profile)
        
        return sections
    
    def _classify_section(
        self,
        start: float,
        end: float,
        duration: float,
        energy: float,
        index: int,
        total_sections: int
    ) -> str:
        """Classify a section based on its characteristics"""
        position_ratio = start / duration
        
        # Intro: first 10% of track
        if position_ratio < 0.1 and index == 0:
            return 'intro'
        
        # Outro: last 10% of track
        if position_ratio > 0.85 and index == total_sections - 1:
            return 'outro'
        
        # High energy sections
        if energy > 0.7:
            # Drops typically occur after breakdowns
            return 'drop' if index > 0 else 'chorus'
        
        # Low energy sections
        if energy < 0.4:
            return 'breakdown'
        
        # Medium energy
        if energy > 0.5:
            return 'chorus'
        else:
            return 'verse'
    
    def _create_basic_sections(self, duration: float, energy_profile: List[float]) -> List[Section]:
        """Create basic section structure when detection fails"""
        sections = []
        
        # Create simple intro/main/outro structure
        intro_end = min(duration * 0.1, 30)
        outro_start = max(duration * 0.9, duration - 30)
        
        sections.append(Section(
            type='intro',
            start_time=0,
            end_time=intro_end,
            energy_level=0.3
        ))
        
        sections.append(Section(
            type='main',
            start_time=intro_end,
            end_time=outro_start,
            energy_level=0.7
        ))
        
        sections.append(Section(
            type='outro',
            start_time=outro_start,
            end_time=duration,
            energy_level=0.3
        ))
        
        return sections
    
    def _find_best_sample_points(
        self,
        y: np.ndarray,
        sr: int,
        sections: List[Section],
        energy_profile: List[float],
        bpm: float,
        duration: float
    ) -> List[Dict]:
        """Find the best points to extract samples from"""
        sample_points = []
        
        # Calculate bar duration
        beats_per_bar = 4
        bar_duration = (60 / bpm) * beats_per_bar
        
        # Calculate default sample duration (16 bars)
        sample_duration = bar_duration * DEFAULT_SAMPLE_BARS
        
        # Priority: drop > chorus > verse > breakdown
        priority_order = ['drop', 'chorus', 'verse', 'breakdown', 'bridge', 'main']
        
        # Find onset strength for beat-aligned sampling
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        
        for priority, section_type in enumerate(priority_order):
            for section in sections:
                if section.type != section_type:
                    continue
                
                # Skip if section too short for sample
                if section.duration < sample_duration:
                    continue
                
                # Find best starting point within section (on beat)
                section_start_sample = int(section.start_time * sr)
                section_end_sample = int(section.end_time * sr)
                
                # Look for energy peaks within section
                energy_arr = np.array(energy_profile)
                start_idx = int((section.start_time / duration) * len(energy_arr))
                end_idx = int((section.end_time / duration) * len(energy_arr))
                
                if end_idx > start_idx:
                    segment_energy = energy_arr[start_idx:end_idx]
                    
                    # Find local maxima
                    peak_idx = np.argmax(segment_energy)
                    peak_time = section.start_time + (peak_idx / len(segment_energy)) * section.duration
                    
                    # Align to bar boundary
                    bars_from_start = peak_time / bar_duration
                    aligned_bar = int(bars_from_start)
                    aligned_time = aligned_bar * bar_duration
                    
                    # Ensure we have room for full sample
                    if aligned_time + sample_duration > duration:
                        aligned_time = duration - sample_duration
                    
                    if aligned_time < 0:
                        aligned_time = 0
                    
                    sample_points.append({
                        'start_time': aligned_time,
                        'end_time': aligned_time + sample_duration,
                        'duration': sample_duration,
                        'section_type': section_type,
                        'energy_level': float(section.energy_level),
                        'priority': priority,
                        'bar_count': DEFAULT_SAMPLE_BARS,
                        'is_drop': section.is_drop,
                        'is_breakdown': section.is_breakdown
                    })
        
        # Sort by priority (lower = better)
        sample_points.sort(key=lambda x: (x['priority'], -x['energy_level']))
        
        # Return top 5 sample points
        return sample_points[:5]
    
    def _generate_waveform_peaks(self, y: np.ndarray, num_points: int = 500) -> List[float]:
        """Generate downsampled waveform peaks for visualization"""
        try:
            # Calculate samples per point
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
            return []
    
    def extract_sample(
        self,
        file_path: Path,
        start_time: float,
        duration: float,
        output_path: Path
    ) -> bool:
        """Extract a sample from an audio file"""
        try:
            # Load full audio
            y, sr = librosa.load(str(file_path), sr=self.sample_rate, mono=False)
            
            # Handle mono vs stereo
            if y.ndim == 1:
                y = np.stack([y, y])
            
            # Calculate sample indices
            start_sample = int(start_time * sr)
            end_sample = int((start_time + duration) * sr)
            
            # Extract segment
            segment = y[:, start_sample:end_sample]
            
            # Apply fade in/out to avoid clicks (50ms)
            fade_samples = int(0.05 * sr)
            fade_in = np.linspace(0, 1, fade_samples)
            fade_out = np.linspace(1, 0, fade_samples)
            
            segment[:, :fade_samples] *= fade_in
            segment[:, -fade_samples:] *= fade_out
            
            # Write to file (24-bit WAV)
            sf.write(str(output_path), segment.T, sr, subtype='PCM_24')
            
            return True
            
        except Exception as e:
            logger.error(f"Sample extraction error: {e}")
            return False


# Singleton
_analyzer = None

def get_audio_analyzer() -> AudioAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = AudioAnalyzer()
    return _analyzer
