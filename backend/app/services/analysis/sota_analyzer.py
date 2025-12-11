"""
SOTA Audio Analyzer - State of the Art Music Structure Analysis
Uses advanced segmentation algorithms for intelligent section detection
"""
import logging
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict, field
import numpy as np
import json

import librosa
import soundfile as sf
from scipy import signal
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.distance import cdist

logger = logging.getLogger(__name__)


@dataclass
class BeatGrid:
    """Beat and downbeat information"""
    bpm: float
    beats: List[float]  # Beat timestamps in seconds
    downbeats: List[float]  # Downbeat (bar start) timestamps
    time_signature: int  # Beats per bar (usually 4)
    confidence: float
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass 
class StructureSegment:
    """A detected structural segment with rich metadata"""
    label: str  # intro, verse, chorus, bridge, breakdown, drop, outro
    start_time: float
    end_time: float
    start_beat: int
    end_beat: int
    start_bar: int
    end_bar: int
    energy_mean: float
    energy_std: float
    spectral_centroid: float  # Brightness
    spectral_contrast: float  # Harmonic richness
    onset_density: float  # Rhythmic activity
    is_silent: bool
    is_transition: bool
    confidence: float
    feature_vector: List[float] = field(default_factory=list)
    
    @property
    def duration(self) -> float:
        return self.end_time - self.start_time
    
    @property
    def bar_count(self) -> int:
        return self.end_bar - self.start_bar
    
    def to_dict(self) -> Dict:
        d = asdict(self)
        d['duration'] = self.duration
        d['bar_count'] = self.bar_count
        return d


@dataclass
class HarmonicInfo:
    """Harmonic analysis with Camelot wheel compatibility"""
    key: str  # e.g., "C major"
    camelot: str  # e.g., "8B"
    confidence: float
    compatible_keys: List[Dict[str, str]]  # List of harmonically compatible keys
    energy_keys: List[Dict[str, str]]  # Keys for energy boost mixing
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SamplePoint:
    """An optimal sample extraction point"""
    start_time: float
    end_time: float
    start_bar: int
    end_bar: int
    bar_count: int
    section_type: str
    score: float  # Overall quality score 0-100
    energy_score: float
    beat_alignment_score: float
    section_coherence_score: float
    silence_score: float  # 0 = lots of silence, 100 = no silence
    loop_score: float  # How well it loops
    feature_summary: Dict[str, float]
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SOTAAnalysisResult:
    """Complete SOTA analysis result"""
    file_path: str
    duration: float
    beat_grid: BeatGrid
    harmonic: HarmonicInfo
    segments: List[StructureSegment]
    sample_points: List[SamplePoint]
    waveform_peaks: List[float]
    energy_curve: List[float]
    loudness_curve: List[float]
    spectral_curve: List[float]
    fingerprint: str  # Audio fingerprint for similarity matching
    
    def to_dict(self) -> Dict:
        return {
            'file_path': self.file_path,
            'duration': self.duration,
            'beat_grid': self.beat_grid.to_dict(),
            'harmonic': self.harmonic.to_dict(),
            'segments': [s.to_dict() for s in self.segments],
            'sample_points': [s.to_dict() for s in self.sample_points],
            'waveform_peaks': self.waveform_peaks,
            'energy_curve': self.energy_curve,
            'loudness_curve': self.loudness_curve,
            'spectral_curve': self.spectral_curve,
            'fingerprint': self.fingerprint
        }


class SOTAAudioAnalyzer:
    """
    State-of-the-Art Audio Analyzer
    
    Features:
    - Advanced beat tracking with downbeat detection
    - Self-similarity matrix-based structure segmentation
    - Camelot wheel harmonic analysis with mix suggestions
    - Intelligent sample point detection avoiding silence
    - Audio fingerprinting for similarity matching
    - Loop quality scoring
    """
    
    # Full Camelot Wheel - 24 keys
    CAMELOT_WHEEL = {
        # Minor keys (A column)
        'A minor': '8A', 'E minor': '9A', 'B minor': '10A', 'F# minor': '11A',
        'C# minor': '12A', 'G# minor': '1A', 'D# minor': '2A', 'A# minor': '3A',
        'Bb minor': '3A', 'F minor': '4A', 'C minor': '5A', 'G minor': '6A', 'D minor': '7A',
        # Major keys (B column)
        'C major': '8B', 'G major': '9B', 'D major': '10B', 'A major': '11B',
        'E major': '12B', 'B major': '1B', 'F# major': '2B', 'Gb major': '2B',
        'Db major': '3B', 'Ab major': '4B', 'Eb major': '5B', 'Bb major': '6B', 'F major': '7B',
    }
    
    # Reverse mapping
    CAMELOT_TO_KEY = {v: k for k, v in CAMELOT_WHEEL.items()}
    
    # Pitch classes
    PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # Section classification thresholds
    SILENCE_THRESHOLD = 0.02
    LOW_ENERGY_THRESHOLD = 0.25
    HIGH_ENERGY_THRESHOLD = 0.7
    
    def __init__(self, sample_rate: int = 44100):
        self.sr = sample_rate
        
    def analyze(self, file_path: Path, bar_options: List[int] = None) -> SOTAAnalysisResult:
        """Perform comprehensive SOTA analysis"""
        if bar_options is None:
            bar_options = [8, 16, 32]
            
        logger.info(f"🎯 SOTA Analysis: {file_path}")
        
        # Load audio
        y, sr = librosa.load(str(file_path), sr=self.sr, mono=True)
        y_stereo, _ = librosa.load(str(file_path), sr=self.sr, mono=False)
        duration = librosa.get_duration(y=y, sr=sr)
        
        logger.info(f"  Duration: {duration:.1f}s")
        
        # === BEAT GRID ===
        beat_grid = self._detect_beat_grid(y, sr)
        logger.info(f"  BPM: {beat_grid.bpm:.1f}, {len(beat_grid.beats)} beats, {len(beat_grid.downbeats)} bars")
        
        # === HARMONIC ANALYSIS ===
        harmonic = self._analyze_harmony(y, sr)
        logger.info(f"  Key: {harmonic.key} ({harmonic.camelot})")
        
        # === FEATURE EXTRACTION ===
        features = self._extract_features(y, sr, beat_grid)
        
        # === STRUCTURE SEGMENTATION ===
        segments = self._segment_structure(y, sr, beat_grid, features, duration)
        logger.info(f"  Segments: {len(segments)} detected")
        
        # === SAMPLE POINT DETECTION ===
        sample_points = self._find_optimal_sample_points(
            y, sr, beat_grid, segments, features, bar_options, duration
        )
        logger.info(f"  Sample Points: {len(sample_points)} optimal locations")
        
        # === VISUALIZATION DATA ===
        waveform = self._generate_waveform(y, num_points=1000)
        energy_curve = self._smooth_curve(features['energy'], num_points=500)
        loudness_curve = self._smooth_curve(features['loudness'], num_points=500)
        spectral_curve = self._smooth_curve(features['spectral_centroid'], num_points=500)
        
        # === AUDIO FINGERPRINT ===
        fingerprint = self._generate_fingerprint(y, sr)
        
        return SOTAAnalysisResult(
            file_path=str(file_path),
            duration=duration,
            beat_grid=beat_grid,
            harmonic=harmonic,
            segments=segments,
            sample_points=sample_points,
            waveform_peaks=waveform,
            energy_curve=energy_curve,
            loudness_curve=loudness_curve,
            spectral_curve=spectral_curve,
            fingerprint=fingerprint
        )
    
    def _detect_beat_grid(self, y: np.ndarray, sr: int) -> BeatGrid:
        """Advanced beat and downbeat detection"""
        try:
            # Tempo detection with multiple methods for robustness
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr, onset_envelope=onset_env)
            
            # Handle newer librosa return types
            if isinstance(tempo, np.ndarray):
                tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
            tempo = float(tempo)
            
            # Convert beat frames to times
            beat_times = librosa.frames_to_time(beats, sr=sr)
            
            # Estimate downbeats (assume 4/4 time signature)
            # Use spectral flux to find strong beats
            downbeats = []
            time_sig = 4
            
            if len(beat_times) >= 4:
                # Calculate beat strength
                beat_strengths = []
                for beat_frame in beats:
                    if beat_frame < len(onset_env):
                        beat_strengths.append(onset_env[beat_frame])
                    else:
                        beat_strengths.append(0)
                
                # Find strongest beats at regular intervals
                for i in range(0, len(beat_times), time_sig):
                    if i < len(beat_times):
                        downbeats.append(beat_times[i])
            else:
                downbeats = beat_times.tolist()
            
            # Calculate confidence based on beat regularity
            if len(beat_times) > 1:
                intervals = np.diff(beat_times)
                expected_interval = 60.0 / tempo
                variance = np.std(intervals - expected_interval)
                confidence = max(0, 1 - variance / expected_interval)
            else:
                confidence = 0.5
            
            return BeatGrid(
                bpm=round(tempo, 1),
                beats=beat_times.tolist(),
                downbeats=downbeats,
                time_signature=time_sig,
                confidence=float(confidence)
            )
            
        except Exception as e:
            logger.error(f"Beat detection error: {e}")
            return BeatGrid(
                bpm=120.0,
                beats=[],
                downbeats=[],
                time_signature=4,
                confidence=0.0
            )
    
    def _analyze_harmony(self, y: np.ndarray, sr: int) -> HarmonicInfo:
        """Advanced key detection with Camelot wheel mapping"""
        try:
            # Use Constant-Q chromagram for better frequency resolution
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            
            # Key profiles (Krumhansl-Schmuckler)
            major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            
            # Average chroma over time
            chroma_avg = np.mean(chroma, axis=1)
            
            # Correlate with all possible keys
            correlations = []
            for i in range(12):
                major_corr = np.corrcoef(chroma_avg, np.roll(major_profile, i))[0, 1]
                minor_corr = np.corrcoef(chroma_avg, np.roll(minor_profile, i))[0, 1]
                correlations.append((self.PITCH_NAMES[i] + ' major', major_corr))
                correlations.append((self.PITCH_NAMES[i] + ' minor', minor_corr))
            
            # Find best match
            correlations.sort(key=lambda x: x[1], reverse=True)
            best_key, best_corr = correlations[0]
            
            # Get Camelot notation
            camelot = self.CAMELOT_WHEEL.get(best_key, '?')
            
            # Find harmonically compatible keys
            compatible = self._get_compatible_keys(camelot)
            energy_boost = self._get_energy_boost_keys(camelot)
            
            return HarmonicInfo(
                key=best_key,
                camelot=camelot,
                confidence=float(max(0, min(1, (best_corr + 1) / 2))),
                compatible_keys=compatible,
                energy_keys=energy_boost
            )
            
        except Exception as e:
            logger.error(f"Harmony analysis error: {e}")
            return HarmonicInfo(
                key="Unknown",
                camelot="?",
                confidence=0.0,
                compatible_keys=[],
                energy_keys=[]
            )
    
    def _get_compatible_keys(self, camelot: str) -> List[Dict[str, str]]:
        """Get harmonically compatible keys using Camelot wheel rules"""
        if not camelot or camelot == '?':
            return []
        
        compatible = []
        try:
            num = int(camelot[:-1])
            letter = camelot[-1]
            
            # Same position (perfect match)
            same_key = self.CAMELOT_TO_KEY.get(camelot, '')
            if same_key:
                compatible.append({'key': same_key, 'camelot': camelot, 'type': 'perfect'})
            
            # +1 (energy boost)
            next_num = (num % 12) + 1
            next_camelot = f"{next_num}{letter}"
            next_key = self.CAMELOT_TO_KEY.get(next_camelot, '')
            if next_key:
                compatible.append({'key': next_key, 'camelot': next_camelot, 'type': 'energy_up'})
            
            # -1 (energy down)
            prev_num = ((num - 2) % 12) + 1
            prev_camelot = f"{prev_num}{letter}"
            prev_key = self.CAMELOT_TO_KEY.get(prev_camelot, '')
            if prev_key:
                compatible.append({'key': prev_key, 'camelot': prev_camelot, 'type': 'energy_down'})
            
            # Relative major/minor (same number, different letter)
            other_letter = 'A' if letter == 'B' else 'B'
            rel_camelot = f"{num}{other_letter}"
            rel_key = self.CAMELOT_TO_KEY.get(rel_camelot, '')
            if rel_key:
                compatible.append({'key': rel_key, 'camelot': rel_camelot, 'type': 'relative'})
            
        except (ValueError, IndexError):
            pass
        
        return compatible
    
    def _get_energy_boost_keys(self, camelot: str) -> List[Dict[str, str]]:
        """Get keys for energy boost mixing (+7 semitones)"""
        if not camelot or camelot == '?':
            return []
        
        energy_keys = []
        try:
            num = int(camelot[:-1])
            letter = camelot[-1]
            
            # +7 semitones = +7 on camelot wheel
            boost_num = ((num + 6) % 12) + 1
            boost_camelot = f"{boost_num}{letter}"
            boost_key = self.CAMELOT_TO_KEY.get(boost_camelot, '')
            if boost_key:
                energy_keys.append({'key': boost_key, 'camelot': boost_camelot, 'type': 'energy_boost'})
            
        except (ValueError, IndexError):
            pass
        
        return energy_keys
    
    def _extract_features(self, y: np.ndarray, sr: int, beat_grid: BeatGrid) -> Dict[str, np.ndarray]:
        """Extract comprehensive audio features"""
        features = {}
        
        # Energy (RMS)
        features['energy'] = librosa.feature.rms(y=y)[0]
        
        # Loudness (perceptual)
        features['loudness'] = features['energy'] ** 0.5  # Approximate loudness
        
        # Spectral features
        features['spectral_centroid'] = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        features['spectral_contrast'] = np.mean(librosa.feature.spectral_contrast(y=y, sr=sr), axis=0)
        features['spectral_rolloff'] = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        
        # Onset strength (rhythmic activity)
        features['onset_strength'] = librosa.onset.onset_strength(y=y, sr=sr)
        
        # Zero crossing rate (noisiness/percussiveness)
        features['zcr'] = librosa.feature.zero_crossing_rate(y)[0]
        
        # MFCCs for timbral analysis
        features['mfcc'] = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        
        # Chroma (harmonic content)
        features['chroma'] = librosa.feature.chroma_cqt(y=y, sr=sr)
        
        return features
    
    def _segment_structure(
        self,
        y: np.ndarray,
        sr: int,
        beat_grid: BeatGrid,
        features: Dict[str, np.ndarray],
        duration: float
    ) -> List[StructureSegment]:
        """Advanced structure segmentation using self-similarity"""
        segments = []
        
        try:
            # Build feature matrix for self-similarity
            # Use MFCCs and chroma stacked
            mfcc = features['mfcc']
            chroma = features['chroma']
            
            # Normalize features
            mfcc_norm = librosa.util.normalize(mfcc, axis=1)
            chroma_norm = librosa.util.normalize(chroma, axis=1)
            
            # Combine features
            combined = np.vstack([mfcc_norm, chroma_norm])
            
            # Compute self-similarity matrix
            ssm = 1 - cdist(combined.T, combined.T, metric='cosine')
            
            # Apply gaussian smoothing
            ssm = gaussian_filter1d(ssm, sigma=3, axis=0)
            ssm = gaussian_filter1d(ssm, sigma=3, axis=1)
            
            # Detect segment boundaries using novelty function
            novelty = self._compute_novelty(ssm)
            
            # Find peaks in novelty (segment boundaries)
            peaks, _ = signal.find_peaks(novelty, height=0.1, distance=20)
            
            # Convert frame indices to times
            hop_length = 512
            peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop_length)
            
            # Add start and end
            boundary_times = [0.0] + peak_times.tolist() + [duration]
            
            # Snap boundaries to nearest bar
            if len(beat_grid.downbeats) > 0:
                boundary_times = [self._snap_to_bar(t, beat_grid.downbeats) for t in boundary_times]
            
            # Remove duplicates and sort
            boundary_times = sorted(set(boundary_times))
            
            # Create segments
            energy = features['energy']
            spectral_centroid = features['spectral_centroid']
            onset_strength = features['onset_strength']
            
            for i in range(len(boundary_times) - 1):
                start_time = boundary_times[i]
                end_time = boundary_times[i + 1]
                
                # Skip very short segments
                if end_time - start_time < 2.0:
                    continue
                
                # Calculate frame indices
                start_frame = int((start_time / duration) * len(energy))
                end_frame = int((end_time / duration) * len(energy))
                
                # Ensure valid range
                start_frame = max(0, min(start_frame, len(energy) - 1))
                end_frame = max(start_frame + 1, min(end_frame, len(energy)))
                
                # Extract segment features
                seg_energy = energy[start_frame:end_frame]
                seg_spectral = spectral_centroid[start_frame:end_frame]
                seg_onset = onset_strength[min(start_frame, len(onset_strength)-1):min(end_frame, len(onset_strength))]
                
                energy_mean = float(np.mean(seg_energy)) if len(seg_energy) > 0 else 0
                energy_std = float(np.std(seg_energy)) if len(seg_energy) > 0 else 0
                spectral_mean = float(np.mean(seg_spectral)) if len(seg_spectral) > 0 else 0
                contrast = float(np.std(seg_spectral)) if len(seg_spectral) > 0 else 0
                onset_density = float(np.mean(seg_onset)) if len(seg_onset) > 0 else 0
                
                # Detect silence
                is_silent = energy_mean < self.SILENCE_THRESHOLD
                
                # Classify segment
                label = self._classify_segment(
                    start_time, end_time, duration,
                    energy_mean, energy_std, onset_density, i, len(boundary_times) - 2
                )
                
                # Determine beat/bar positions
                start_beat = self._time_to_beat(start_time, beat_grid.beats)
                end_beat = self._time_to_beat(end_time, beat_grid.beats)
                start_bar = self._time_to_bar(start_time, beat_grid.downbeats)
                end_bar = self._time_to_bar(end_time, beat_grid.downbeats)
                
                # Is this a transition (high variance, short)?
                is_transition = (end_time - start_time < 8.0) and energy_std > 0.15
                
                # Create feature vector for similarity matching
                feature_vec = [energy_mean, energy_std, spectral_mean, contrast, onset_density]
                
                segments.append(StructureSegment(
                    label=label,
                    start_time=start_time,
                    end_time=end_time,
                    start_beat=start_beat,
                    end_beat=end_beat,
                    start_bar=start_bar,
                    end_bar=end_bar,
                    energy_mean=energy_mean,
                    energy_std=energy_std,
                    spectral_centroid=spectral_mean,
                    spectral_contrast=contrast,
                    onset_density=onset_density,
                    is_silent=is_silent,
                    is_transition=is_transition,
                    confidence=0.8,
                    feature_vector=feature_vec
                ))
            
        except Exception as e:
            logger.error(f"Segmentation error: {e}")
            # Create basic fallback segmentation
            segments = self._create_fallback_segments(duration, beat_grid, features)
        
        return segments
    
    def _compute_novelty(self, ssm: np.ndarray) -> np.ndarray:
        """Compute novelty function from self-similarity matrix"""
        # Use checkerboard kernel convolution
        kernel_size = 16
        half = kernel_size // 2
        
        # Create checkerboard kernel
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[:half, :half] = 1
        kernel[half:, half:] = 1
        kernel[:half, half:] = -1
        kernel[half:, :half] = -1
        
        # Convolve along diagonal
        novelty = np.zeros(ssm.shape[0])
        for i in range(half, ssm.shape[0] - half):
            patch = ssm[i-half:i+half, i-half:i+half]
            novelty[i] = np.abs(np.sum(patch * kernel))
        
        # Normalize
        if np.max(novelty) > 0:
            novelty = novelty / np.max(novelty)
        
        return novelty
    
    def _classify_segment(
        self,
        start: float,
        end: float,
        duration: float,
        energy: float,
        energy_std: float,
        onset_density: float,
        index: int,
        total: int
    ) -> str:
        """Classify segment type based on features and position"""
        position = start / duration
        seg_duration = end - start
        
        # Position-based classification
        if position < 0.1 and index == 0:
            return 'intro'
        if position > 0.85 and index >= total - 1:
            return 'outro'
        
        # Energy-based classification
        if energy < self.LOW_ENERGY_THRESHOLD:
            if onset_density < 0.1:
                return 'breakdown'
            return 'verse'
        
        if energy > self.HIGH_ENERGY_THRESHOLD:
            if energy_std > 0.1:
                return 'drop'
            return 'chorus'
        
        # Medium energy
        if onset_density > 0.5:
            return 'chorus'
        
        return 'verse'
    
    def _find_optimal_sample_points(
        self,
        y: np.ndarray,
        sr: int,
        beat_grid: BeatGrid,
        segments: List[StructureSegment],
        features: Dict[str, np.ndarray],
        bar_options: List[int],
        duration: float
    ) -> List[SamplePoint]:
        """Find optimal sample extraction points"""
        sample_points = []
        
        bar_duration = (60.0 / beat_grid.bpm) * beat_grid.time_signature
        
        for bar_count in bar_options:
            sample_duration = bar_duration * bar_count
            
            # Priority: drop > chorus > verse > breakdown
            section_priority = {'drop': 4, 'chorus': 3, 'verse': 2, 'breakdown': 1, 'bridge': 1}
            
            for segment in segments:
                # Skip silent, intro, outro segments
                if segment.is_silent or segment.label in ['intro', 'outro']:
                    continue
                
                # Skip if segment too short
                if segment.duration < sample_duration:
                    continue
                
                # Find best start point within segment
                best_start = self._find_best_start_in_segment(
                    segment, sample_duration, beat_grid, features, y, sr, duration
                )
                
                if best_start is None:
                    continue
                
                end_time = best_start + sample_duration
                
                # Calculate scores
                energy_score = self._calculate_energy_score(
                    best_start, end_time, features['energy'], duration
                )
                
                beat_score = self._calculate_beat_alignment_score(
                    best_start, end_time, beat_grid
                )
                
                coherence_score = segment.confidence * 100
                
                silence_score = self._calculate_silence_score(
                    best_start, end_time, y, sr
                )
                
                loop_score = self._calculate_loop_score(
                    best_start, end_time, y, sr, beat_grid
                )
                
                # Overall score (weighted)
                section_bonus = section_priority.get(segment.label, 0) * 10
                overall_score = (
                    energy_score * 0.25 +
                    beat_score * 0.2 +
                    coherence_score * 0.15 +
                    silence_score * 0.25 +
                    loop_score * 0.15 +
                    section_bonus
                )
                
                # Get bar positions
                start_bar = self._time_to_bar(best_start, beat_grid.downbeats)
                end_bar = self._time_to_bar(end_time, beat_grid.downbeats)
                
                sample_points.append(SamplePoint(
                    start_time=best_start,
                    end_time=end_time,
                    start_bar=start_bar,
                    end_bar=end_bar,
                    bar_count=bar_count,
                    section_type=segment.label,
                    score=overall_score,
                    energy_score=energy_score,
                    beat_alignment_score=beat_score,
                    section_coherence_score=coherence_score,
                    silence_score=silence_score,
                    loop_score=loop_score,
                    feature_summary={
                        'energy': segment.energy_mean,
                        'brightness': segment.spectral_centroid,
                        'rhythm': segment.onset_density
                    }
                ))
        
        # Sort by score and return top candidates
        sample_points.sort(key=lambda x: x.score, reverse=True)
        
        # Remove overlapping samples (keep best)
        filtered = []
        for sp in sample_points:
            overlaps = False
            for existing in filtered:
                if (sp.start_time < existing.end_time and sp.end_time > existing.start_time):
                    overlaps = True
                    break
            if not overlaps:
                filtered.append(sp)
        
        return filtered[:10]  # Return top 10
    
    def _find_best_start_in_segment(
        self,
        segment: StructureSegment,
        sample_duration: float,
        beat_grid: BeatGrid,
        features: Dict[str, np.ndarray],
        y: np.ndarray,
        sr: int,
        duration: float
    ) -> Optional[float]:
        """Find the best starting point within a segment"""
        if segment.duration < sample_duration:
            return None
        
        # Find downbeats within segment
        valid_starts = []
        for db in beat_grid.downbeats:
            if segment.start_time <= db <= segment.end_time - sample_duration:
                valid_starts.append(db)
        
        if not valid_starts:
            # No downbeats, use segment start aligned to nearest bar
            return self._snap_to_bar(segment.start_time, beat_grid.downbeats)
        
        # Score each valid start
        best_start = valid_starts[0]
        best_score = -1
        
        energy = features['energy']
        
        for start in valid_starts:
            end = start + sample_duration
            
            # Calculate energy in this region
            start_idx = int((start / duration) * len(energy))
            end_idx = int((end / duration) * len(energy))
            
            if end_idx <= start_idx:
                continue
            
            region_energy = energy[start_idx:end_idx]
            
            # Prefer higher energy, lower variance
            score = np.mean(region_energy) - 0.5 * np.std(region_energy)
            
            # Penalize if starts with low energy
            if len(region_energy) > 10:
                start_energy = np.mean(region_energy[:10])
                if start_energy < 0.1:
                    score -= 0.2
            
            if score > best_score:
                best_score = score
                best_start = start
        
        return best_start
    
    def _calculate_energy_score(
        self,
        start: float,
        end: float,
        energy: np.ndarray,
        duration: float
    ) -> float:
        """Calculate energy-based score (0-100)"""
        start_idx = int((start / duration) * len(energy))
        end_idx = int((end / duration) * len(energy))
        
        if end_idx <= start_idx:
            return 50.0
        
        region = energy[start_idx:end_idx]
        mean_energy = np.mean(region)
        
        # Normalize to 0-100
        return min(100, mean_energy * 150)
    
    def _calculate_beat_alignment_score(
        self,
        start: float,
        end: float,
        beat_grid: BeatGrid
    ) -> float:
        """Calculate how well aligned to beats/bars (0-100)"""
        score = 0
        
        # Check if start is on a downbeat
        for db in beat_grid.downbeats:
            if abs(start - db) < 0.05:
                score += 50
                break
        
        # Check if end is on a downbeat
        for db in beat_grid.downbeats:
            if abs(end - db) < 0.05:
                score += 50
                break
        
        return score
    
    def _calculate_silence_score(
        self,
        start: float,
        end: float,
        y: np.ndarray,
        sr: int
    ) -> float:
        """Calculate silence avoidance score (0-100, higher = less silence)"""
        start_sample = int(start * sr)
        end_sample = int(end * sr)
        
        segment = y[start_sample:end_sample]
        
        # Calculate RMS in small windows
        window_size = sr // 10  # 100ms windows
        silent_windows = 0
        total_windows = 0
        
        for i in range(0, len(segment) - window_size, window_size):
            window = segment[i:i+window_size]
            rms = np.sqrt(np.mean(window ** 2))
            total_windows += 1
            if rms < self.SILENCE_THRESHOLD:
                silent_windows += 1
        
        if total_windows == 0:
            return 100.0
        
        silence_ratio = silent_windows / total_windows
        return (1 - silence_ratio) * 100
    
    def _calculate_loop_score(
        self,
        start: float,
        end: float,
        y: np.ndarray,
        sr: int,
        beat_grid: BeatGrid
    ) -> float:
        """Calculate how well the sample loops (0-100)"""
        start_sample = int(start * sr)
        end_sample = int(end * sr)
        
        # Compare first and last 50ms
        compare_samples = int(0.05 * sr)
        
        if end_sample - start_sample < compare_samples * 2:
            return 50.0
        
        start_region = y[start_sample:start_sample + compare_samples]
        end_region = y[end_sample - compare_samples:end_sample]
        
        # Calculate correlation
        if len(start_region) == len(end_region):
            corr = np.corrcoef(start_region, end_region)[0, 1]
            return max(0, (corr + 1) * 50)  # Map -1..1 to 0..100
        
        return 50.0
    
    def _generate_waveform(self, y: np.ndarray, num_points: int = 1000) -> List[float]:
        """Generate waveform peaks for visualization"""
        samples_per_point = len(y) // num_points
        peaks = []
        
        for i in range(num_points):
            start = i * samples_per_point
            end = start + samples_per_point
            segment = np.abs(y[start:end])
            peaks.append(float(np.max(segment)))
        
        # Normalize
        max_peak = max(peaks) if peaks else 1
        return [p / max_peak for p in peaks]
    
    def _smooth_curve(self, data: np.ndarray, num_points: int) -> List[float]:
        """Smooth and downsample a curve for visualization"""
        # Normalize
        data_norm = (data - np.min(data)) / (np.max(data) - np.min(data) + 1e-6)
        
        # Resample
        if len(data_norm) != num_points:
            indices = np.linspace(0, len(data_norm) - 1, num_points).astype(int)
            data_resampled = data_norm[indices]
        else:
            data_resampled = data_norm
        
        # Smooth
        smoothed = gaussian_filter1d(data_resampled, sigma=2)
        
        return smoothed.tolist()
    
    def _generate_fingerprint(self, y: np.ndarray, sr: int) -> str:
        """Generate audio fingerprint for similarity matching"""
        # Use spectrogram-based fingerprinting
        spec = np.abs(librosa.stft(y))
        
        # Get peak positions
        peaks = []
        for i in range(spec.shape[1]):
            col = spec[:, i]
            peak_idx = np.argmax(col)
            peaks.append(peak_idx)
        
        # Hash the peak sequence
        peak_bytes = np.array(peaks[:1000], dtype=np.uint16).tobytes()
        fingerprint = hashlib.sha256(peak_bytes).hexdigest()[:32]
        
        return fingerprint
    
    def _snap_to_bar(self, time: float, downbeats: List[float]) -> float:
        """Snap a time to the nearest bar (downbeat)"""
        if not downbeats:
            return time
        
        closest = min(downbeats, key=lambda x: abs(x - time))
        return closest
    
    def _time_to_beat(self, time: float, beats: List[float]) -> int:
        """Convert time to beat number"""
        for i, beat_time in enumerate(beats):
            if beat_time >= time:
                return i
        return len(beats)
    
    def _time_to_bar(self, time: float, downbeats: List[float]) -> int:
        """Convert time to bar number"""
        for i, bar_time in enumerate(downbeats):
            if bar_time >= time:
                return i
        return len(downbeats)
    
    def _create_fallback_segments(
        self,
        duration: float,
        beat_grid: BeatGrid,
        features: Dict[str, np.ndarray]
    ) -> List[StructureSegment]:
        """Create basic fallback segmentation"""
        segments = []
        
        # Simple intro/main/outro split
        intro_end = min(duration * 0.1, 30)
        outro_start = max(duration * 0.9, duration - 30)
        
        energy = features['energy']
        
        for label, start, end in [
            ('intro', 0, intro_end),
            ('main', intro_end, outro_start),
            ('outro', outro_start, duration)
        ]:
            start_idx = int((start / duration) * len(energy))
            end_idx = int((end / duration) * len(energy))
            seg_energy = energy[start_idx:end_idx] if end_idx > start_idx else [0.5]
            
            segments.append(StructureSegment(
                label=label,
                start_time=start,
                end_time=end,
                start_beat=0,
                end_beat=0,
                start_bar=0,
                end_bar=0,
                energy_mean=float(np.mean(seg_energy)),
                energy_std=float(np.std(seg_energy)),
                spectral_centroid=0,
                spectral_contrast=0,
                onset_density=0,
                is_silent=False,
                is_transition=False,
                confidence=0.5
            ))
        
        return segments


# Singleton
_sota_analyzer = None

def get_sota_analyzer() -> SOTAAudioAnalyzer:
    global _sota_analyzer
    if _sota_analyzer is None:
        _sota_analyzer = SOTAAudioAnalyzer()
    return _sota_analyzer
