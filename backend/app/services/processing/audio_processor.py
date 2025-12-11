"""
DJ Library Tool - Audio Processor Service
The brain: Analyze, Separate, Section, Loop.
"""
import logging
import subprocess
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
import json

from app.core.config import (
    DJ_LIBRARY, TEMP_DIR, CACHE_DIR,
    SAMPLE_RATE, BIT_DEPTH, AUDIO_FORMAT,
    DEMUCS_MODEL, DEMUCS_DEVICE, DEMUCS_SHIFTS,
    LOOP_BAR_LENGTHS, DEFAULT_BAR_LENGTH,
    CAMELOT_WHEEL, get_compatible_keys, SECTION_NAMES,
    TrackOutput
)

logger = logging.getLogger(__name__)


@dataclass
class Section:
    """A detected section of the track."""
    name: str           # intro, verse, chorus, drop, etc.
    start_time: float   # seconds
    end_time: float     # seconds
    start_bar: int
    end_bar: int
    energy: float       # 0-1 energy level
    is_highlight: bool  # Is this a key moment (drop, main hook)?
    
    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


@dataclass 
class AnalysisResult:
    """Complete analysis of a track."""
    bpm: float
    key: str
    camelot: str
    duration: float
    sample_rate: int
    sections: List[Section] = field(default_factory=list)
    beats: List[float] = field(default_factory=list)  # Beat timestamps
    downbeats: List[float] = field(default_factory=list)  # Bar starts
    energy_profile: List[float] = field(default_factory=list)
    
    @property
    def compatible_keys(self) -> List[str]:
        return get_compatible_keys(self.camelot)
    
    @property
    def bar_duration(self) -> float:
        """Duration of one bar in seconds."""
        return 60.0 / self.bpm * 4  # Assuming 4/4
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "bpm": self.bpm,
            "key": self.key,
            "camelot": self.camelot,
            "duration": self.duration,
            "sample_rate": self.sample_rate,
            "compatible_keys": self.compatible_keys,
            "sections": [
                {
                    "name": s.name,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "duration": s.duration,
                    "energy": s.energy,
                    "is_highlight": s.is_highlight
                }
                for s in self.sections
            ]
        }


class AudioProcessor:
    """
    Full audio processing pipeline:
    1. Analyze (BPM, Key, Structure)
    2. Separate Stems (Demucs 6-stem)
    3. Extract Sections (Intro, Drop, Outro, etc.)
    4. Generate Loops (4, 8, 16, 32 bars)
    """
    
    def __init__(self):
        self._cache_dir = CACHE_DIR / "analysis"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
    
    # =========================================================================
    # MAIN ENTRY POINT: Process a track completely
    # =========================================================================
    
    def process_track(
        self,
        audio_path: Path,
        artist: str,
        title: str,
        year: Optional[int] = None
    ) -> TrackOutput:
        """
        Full processing pipeline:
        1. Analyze
        2. Separate stems
        3. Extract sections
        4. Generate loops
        
        Returns TrackOutput with all file paths.
        """
        logger.info(f"🎯 Processing: {artist} - {title}")
        
        # Create output structure
        output = TrackOutput(
            artist=artist,
            title=title,
            year=year,
            bpm=0, key="", camelot="", duration=0
        )
        
        # Set up output directory
        output.root_dir = DJ_LIBRARY / output.folder_name
        output.root_dir.mkdir(parents=True, exist_ok=True)
        
        # Step 1: Analyze
        logger.info("🔬 Step 1: Analyzing...")
        analysis = self.analyze(audio_path)
        output.bpm = analysis.bpm
        output.key = analysis.key
        output.camelot = analysis.camelot
        output.duration = analysis.duration
        logger.info(f"   ✓ BPM: {analysis.bpm:.1f}, Key: {analysis.key} ({analysis.camelot})")
        
        # Step 2: Copy/convert full track
        logger.info("📁 Step 2: Preparing full track...")
        output.full_track = self._prepare_full_track(audio_path, output.root_dir)
        logger.info(f"   ✓ Full track: {output.full_track.name}")
        
        # Step 3: Separate stems
        logger.info("🎛️  Step 3: Separating stems...")
        stems_dir = output.root_dir / "Stems"
        output.stems = self.separate_stems(audio_path, stems_dir)
        logger.info(f"   ✓ Stems: {', '.join(output.stems.keys())}")
        
        # Step 4: Extract sections
        logger.info("✂️  Step 4: Extracting sections...")
        sections_dir = output.root_dir / "Sections"
        output.sections = self.extract_sections(audio_path, analysis.sections, sections_dir)
        logger.info(f"   ✓ Sections: {', '.join(output.sections.keys())}")
        
        # Step 5: Generate loops
        logger.info("🔁 Step 5: Generating loops...")
        loops_dir = output.root_dir / "Loops"
        output.loops = self.generate_loops(audio_path, analysis, loops_dir)
        total_loops = sum(len(loops) for section_loops in output.loops.values() for loops in section_loops.values())
        logger.info(f"   ✓ Loops: {total_loops} total across {len(output.loops)} bar lengths")
        
        # Step 6: Write info.txt
        info_path = output.root_dir / "info.txt"
        info_path.write_text(output.to_info_txt())
        logger.info(f"   ✓ Info: {info_path.name}")
        
        # Step 7: Write JSON metadata
        metadata_path = output.root_dir / "metadata.json"
        metadata = {
            "artist": artist,
            "title": title,
            "year": year,
            "analysis": analysis.to_dict(),
            "stems": list(output.stems.keys()),
            "sections": list(output.sections.keys()),
            "loops": {str(k): list(v.keys()) for k, v in output.loops.items()}
        }
        metadata_path.write_text(json.dumps(metadata, indent=2))
        
        logger.info(f"✅ Complete: {output.root_dir}")
        return output
    
    # =========================================================================
    # STEP 1: Analyze
    # =========================================================================
    
    def analyze(self, audio_path: Path) -> AnalysisResult:
        """
        Analyze track for BPM, Key, and Structure.
        Uses librosa + custom section detection.
        """
        try:
            import librosa
            import numpy as np
            import soundfile as sf
        except ImportError:
            logger.error("librosa/soundfile not installed. Run: pip install librosa soundfile")
            raise
        
        # Load audio
        y, sr = librosa.load(str(audio_path), sr=None, mono=True)
        duration = len(y) / sr
        
        # BPM detection
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])
        
        # Beat timestamps
        beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        
        # Estimate downbeats (bar starts) - every 4 beats for 4/4
        downbeats = beats[::4] if beats else []
        
        # Key detection using chroma
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_idx = int(chroma.mean(axis=1).argmax())
        
        # Map to key name
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        key = keys[key_idx]
        
        # Determine major/minor using mode detection
        # Simple heuristic: check relative minor/major energy
        mode = self._detect_mode(chroma, key_idx)
        if mode == "minor":
            key = keys[(key_idx + 9) % 12] + "m"  # Relative minor
        
        # Get Camelot notation
        camelot = CAMELOT_WHEEL.get(key, CAMELOT_WHEEL.get(key.replace("m", ""), "?"))
        
        # Energy profile for section detection
        rms = librosa.feature.rms(y=y)[0]
        energy_profile = (rms / rms.max()).tolist() if rms.max() > 0 else []
        
        # Detect sections
        sections = self._detect_sections(y, sr, bpm, beats, downbeats, energy_profile, duration)
        
        return AnalysisResult(
            bpm=round(bpm, 1),
            key=key,
            camelot=camelot,
            duration=duration,
            sample_rate=sr,
            sections=sections,
            beats=beats,
            downbeats=downbeats,
            energy_profile=energy_profile
        )
    
    def _detect_mode(self, chroma, key_idx: int) -> str:
        """Detect major or minor mode."""
        import numpy as np
        
        # Check the third - major has 4 semitones, minor has 3
        major_third = (key_idx + 4) % 12
        minor_third = (key_idx + 3) % 12
        
        major_energy = chroma[major_third].mean()
        minor_energy = chroma[minor_third].mean()
        
        return "minor" if minor_energy > major_energy else "major"
    
    def _detect_sections(
        self,
        y,
        sr: int,
        bpm: float,
        beats: List[float],
        downbeats: List[float],
        energy_profile: List[float],
        duration: float
    ) -> List[Section]:
        """
        Detect track sections using energy and spectral analysis.
        """
        import numpy as np
        import librosa
        
        sections = []
        bar_duration = 60.0 / bpm * 4  # 4/4 time
        
        if len(downbeats) < 4:
            # Not enough structure detected, create basic sections
            return self._create_basic_sections(duration, bar_duration)
        
        # Calculate energy per bar
        hop_length = 512
        frame_duration = hop_length / sr
        
        bar_energies = []
        for i, db in enumerate(downbeats):
            start_frame = int(db / frame_duration)
            end_frame = int((db + bar_duration) / frame_duration)
            
            if start_frame < len(energy_profile) and end_frame <= len(energy_profile):
                bar_energy = np.mean(energy_profile[start_frame:end_frame])
                bar_energies.append(bar_energy)
            else:
                bar_energies.append(0.5)
        
        # Normalize
        bar_energies = np.array(bar_energies)
        if bar_energies.max() > 0:
            bar_energies = bar_energies / bar_energies.max()
        
        # Find energy transitions (section boundaries)
        transitions = self._find_transitions(bar_energies)
        
        # Create sections from transitions
        section_boundaries = [0] + transitions + [len(downbeats) - 1]
        
        for i in range(len(section_boundaries) - 1):
            start_bar = section_boundaries[i]
            end_bar = section_boundaries[i + 1]
            
            if end_bar <= start_bar:
                continue
            
            start_time = downbeats[start_bar] if start_bar < len(downbeats) else 0
            end_time = downbeats[end_bar] if end_bar < len(downbeats) else duration
            
            # Calculate section energy
            section_energy = float(np.mean(bar_energies[start_bar:end_bar+1]))
            
            # Determine section type
            section_name, is_highlight = self._classify_section(
                i, len(section_boundaries) - 1,
                section_energy, bar_energies.tolist(),
                start_bar, end_bar
            )
            
            sections.append(Section(
                name=section_name,
                start_time=start_time,
                end_time=end_time,
                start_bar=start_bar + 1,  # 1-indexed
                end_bar=end_bar + 1,
                energy=section_energy,
                is_highlight=is_highlight
            ))
        
        return sections
    
    def _find_transitions(self, bar_energies) -> List[int]:
        """Find significant energy transitions between bars."""
        import numpy as np
        
        if len(bar_energies) < 8:
            return []
        
        # Calculate energy derivative
        diff = np.diff(bar_energies)
        
        # Find significant changes (>20% jump)
        threshold = 0.2
        transitions = []
        
        for i, d in enumerate(diff):
            if abs(d) > threshold:
                # Check it's not too close to another transition
                if not transitions or (i - transitions[-1]) >= 8:
                    transitions.append(i + 1)
        
        return transitions
    
    def _classify_section(
        self,
        section_idx: int,
        total_sections: int,
        energy: float,
        all_energies: List[float],
        start_bar: int,
        end_bar: int
    ) -> Tuple[str, bool]:
        """Classify a section by type."""
        
        # First section is intro
        if section_idx == 0:
            return "intro", False
        
        # Last section is outro
        if section_idx == total_sections - 1:
            return "outro", False
        
        # High energy = drop or chorus
        avg_energy = sum(all_energies) / len(all_energies) if all_energies else 0.5
        
        if energy > avg_energy * 1.3:
            # Very high energy - it's a drop
            return "drop", True
        
        if energy > avg_energy * 1.1:
            # Elevated energy - chorus
            return "chorus", True
        
        if energy < avg_energy * 0.7:
            # Low energy after high = breakdown
            if section_idx > 1:
                prev_energy = all_energies[start_bar - 1] if start_bar > 0 else 0
                if prev_energy > energy:
                    return "breakdown", False
            return "verse", False
        
        # Building energy = buildup
        if section_idx > 0 and section_idx < total_sections - 1:
            if start_bar + 1 < len(all_energies):
                next_energy = all_energies[min(end_bar, len(all_energies) - 1)]
                if next_energy > energy * 1.2:
                    return "buildup", False
        
        return "verse", False
    
    def _create_basic_sections(self, duration: float, bar_duration: float) -> List[Section]:
        """Create basic intro/main/outro sections when detection fails."""
        intro_duration = min(bar_duration * 8, duration * 0.15)
        outro_duration = min(bar_duration * 8, duration * 0.15)
        main_duration = duration - intro_duration - outro_duration
        
        return [
            Section(
                name="intro",
                start_time=0,
                end_time=intro_duration,
                start_bar=1,
                end_bar=max(1, int(intro_duration / bar_duration)),
                energy=0.4,
                is_highlight=False
            ),
            Section(
                name="main",
                start_time=intro_duration,
                end_time=intro_duration + main_duration,
                start_bar=max(1, int(intro_duration / bar_duration)) + 1,
                end_bar=int((intro_duration + main_duration) / bar_duration),
                energy=0.8,
                is_highlight=True
            ),
            Section(
                name="outro",
                start_time=intro_duration + main_duration,
                end_time=duration,
                start_bar=int((intro_duration + main_duration) / bar_duration) + 1,
                end_bar=int(duration / bar_duration),
                energy=0.4,
                is_highlight=False
            )
        ]
    
    # =========================================================================
    # STEP 2: Stem Separation
    # =========================================================================
    
    def separate_stems(self, audio_path: Path, output_dir: Path) -> Dict[str, Path]:
        """
        Separate track into 6 stems using Demucs.
        Returns dict of {stem_name: path}
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if demucs is available
        demucs_bin = shutil.which("demucs")
        if not demucs_bin:
            logger.warning("Demucs not found, using HPSS fallback")
            return self._hpss_fallback(audio_path, output_dir)
        
        try:
            # Run Demucs
            cmd = [
                demucs_bin,
                "-n", DEMUCS_MODEL,
                "--device", DEMUCS_DEVICE,
                "--shifts", str(DEMUCS_SHIFTS),
                "-o", str(output_dir.parent),
                "--mp3",  # Avoid torchaudio issues
                str(audio_path)
            ]
            
            logger.info(f"Running Demucs: {' '.join(cmd)}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            
            if proc.returncode != 0:
                logger.warning(f"Demucs failed: {proc.stderr}")
                return self._hpss_fallback(audio_path, output_dir)
            
            # Find output stems
            # Demucs outputs to: output_dir.parent / model_name / track_stem
            demucs_output = output_dir.parent / DEMUCS_MODEL / audio_path.stem
            
            stems = {}
            stem_names = ["drums", "bass", "vocals", "guitar", "piano", "other"]
            
            if demucs_output.exists():
                for stem_name in stem_names:
                    for ext in [".mp3", ".wav"]:
                        stem_file = demucs_output / f"{stem_name}{ext}"
                        if stem_file.exists():
                            # Move to our output directory with clean names
                            target = output_dir / f"{stem_name}.wav"
                            
                            # Convert if needed
                            if ext == ".mp3":
                                self._convert_to_wav(stem_file, target)
                            else:
                                shutil.copy2(stem_file, target)
                            
                            stems[stem_name] = target
                            break
            
            if stems:
                return stems
            
            logger.warning("No stems found from Demucs, using fallback")
            return self._hpss_fallback(audio_path, output_dir)
            
        except subprocess.TimeoutExpired:
            logger.error("Demucs timed out")
            return self._hpss_fallback(audio_path, output_dir)
        except Exception as e:
            logger.error(f"Demucs error: {e}")
            return self._hpss_fallback(audio_path, output_dir)
    
    def _hpss_fallback(self, audio_path: Path, output_dir: Path) -> Dict[str, Path]:
        """Fallback: Use HPSS to separate harmonic/percussive."""
        import librosa
        import soundfile as sf
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        y, sr = librosa.load(str(audio_path), sr=None, mono=False)
        
        # Handle stereo
        if y.ndim > 1:
            y_mono = librosa.to_mono(y)
        else:
            y_mono = y
        
        # HPSS separation
        harmonic, percussive = librosa.effects.hpss(y_mono)
        
        stems = {}
        
        # Save harmonic (melodic content)
        harmonic_path = output_dir / "melodic.wav"
        sf.write(str(harmonic_path), harmonic, sr)
        stems["melodic"] = harmonic_path
        
        # Save percussive (drums/rhythm)
        percussive_path = output_dir / "percussive.wav"
        sf.write(str(percussive_path), percussive, sr)
        stems["percussive"] = percussive_path
        
        # Save original as "full" stem
        full_path = output_dir / "full.wav"
        if y.ndim > 1:
            sf.write(str(full_path), y.T, sr)
        else:
            sf.write(str(full_path), y, sr)
        stems["full"] = full_path
        
        return stems
    
    def _convert_to_wav(self, input_path: Path, output_path: Path):
        """Convert audio file to WAV format."""
        try:
            import soundfile as sf
            import librosa
            
            y, sr = librosa.load(str(input_path), sr=None, mono=False)
            if y.ndim > 1:
                sf.write(str(output_path), y.T, sr)
            else:
                sf.write(str(output_path), y, sr)
        except Exception as e:
            logger.error(f"Conversion failed: {e}")
            shutil.copy2(input_path, output_path)
    
    # =========================================================================
    # STEP 3: Section Extraction
    # =========================================================================
    
    def extract_sections(
        self,
        audio_path: Path,
        sections: List[Section],
        output_dir: Path
    ) -> Dict[str, Path]:
        """Extract each section as a separate audio file."""
        import soundfile as sf
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load audio
        data, sr = sf.read(str(audio_path))
        
        extracted = {}
        section_counts = {}
        
        for section in sections:
            # Handle duplicate section names
            base_name = section.name
            if base_name in section_counts:
                section_counts[base_name] += 1
                name = f"{base_name}_{section_counts[base_name]}"
            else:
                section_counts[base_name] = 1
                name = base_name
            
            # Calculate sample boundaries
            start_sample = int(section.start_time * sr)
            end_sample = int(section.end_time * sr)
            
            # Extract section
            section_audio = data[start_sample:end_sample]
            
            # Apply short fade to avoid clicks
            fade_samples = min(int(0.01 * sr), len(section_audio) // 4)
            if fade_samples > 0 and len(section_audio) > fade_samples * 2:
                import numpy as np
                fade_in = np.linspace(0, 1, fade_samples)
                fade_out = np.linspace(1, 0, fade_samples)
                
                if section_audio.ndim > 1:
                    section_audio[:fade_samples] *= fade_in[:, np.newaxis]
                    section_audio[-fade_samples:] *= fade_out[:, np.newaxis]
                else:
                    section_audio[:fade_samples] *= fade_in
                    section_audio[-fade_samples:] *= fade_out
            
            # Save
            output_path = output_dir / f"{name}.wav"
            sf.write(str(output_path), section_audio, sr)
            extracted[name] = output_path
        
        return extracted
    
    # =========================================================================
    # STEP 4: Loop Generation
    # =========================================================================
    
    def generate_loops(
        self,
        audio_path: Path,
        analysis: AnalysisResult,
        output_dir: Path
    ) -> Dict[int, Dict[str, List[Path]]]:
        """
        Generate loops at multiple bar lengths from key sections.
        Returns {bar_count: {section_name: [paths]}}
        """
        import numpy as np
        import soundfile as sf
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load audio
        data, sr = sf.read(str(audio_path))
        
        bar_duration = analysis.bar_duration
        samples_per_bar = int(bar_duration * sr)
        
        loops = {}
        
        # Find the best sections for loops (high energy, drops, choruses)
        loop_sections = [s for s in analysis.sections if s.is_highlight or s.energy > 0.6]
        
        # If no highlights, use all sections except intro/outro
        if not loop_sections:
            loop_sections = [s for s in analysis.sections if s.name not in ["intro", "outro"]]
        
        # If still nothing, use all sections
        if not loop_sections:
            loop_sections = analysis.sections
        
        for bar_count in LOOP_BAR_LENGTHS:
            loops[bar_count] = {}
            bar_dir = output_dir / f"{bar_count}bar"
            bar_dir.mkdir(parents=True, exist_ok=True)
            
            loop_samples = samples_per_bar * bar_count
            
            for section in loop_sections:
                section_loops = []
                
                # Find bar-aligned positions within this section
                section_start_sample = int(section.start_time * sr)
                section_end_sample = int(section.end_time * sr)
                section_duration_samples = section_end_sample - section_start_sample
                
                # How many loops can we fit?
                num_loops = section_duration_samples // loop_samples
                
                # Generate up to 3 loops per section
                for i in range(min(int(num_loops), 3)):
                    start = section_start_sample + (i * loop_samples)
                    end = start + loop_samples
                    
                    if end > len(data):
                        break
                    
                    loop_audio = data[start:end].copy()
                    
                    # Apply crossfade-friendly tails
                    fade_samples = min(int(0.02 * sr), loop_samples // 8)
                    if fade_samples > 0:
                        fade_in = np.linspace(0, 1, fade_samples)
                        fade_out = np.linspace(1, 0, fade_samples)
                        
                        if loop_audio.ndim > 1:
                            loop_audio[:fade_samples] *= fade_in[:, np.newaxis]
                            loop_audio[-fade_samples:] *= fade_out[:, np.newaxis]
                        else:
                            loop_audio[:fade_samples] *= fade_in
                            loop_audio[-fade_samples:] *= fade_out
                    
                    # Save loop
                    loop_name = f"{section.name}_loop_{i+1}.wav"
                    loop_path = bar_dir / loop_name
                    sf.write(str(loop_path), loop_audio, sr)
                    section_loops.append(loop_path)
                
                if section_loops:
                    loops[bar_count][section.name] = section_loops
        
        return loops
    
    # =========================================================================
    # Helper: Prepare Full Track
    # =========================================================================
    
    def _prepare_full_track(self, audio_path: Path, output_dir: Path) -> Path:
        """Copy/convert full track to output directory."""
        import soundfile as sf
        
        output_path = output_dir / f"Full Track.wav"
        
        if audio_path.suffix.lower() == ".wav":
            shutil.copy2(audio_path, output_path)
        else:
            # Convert to WAV
            import librosa
            y, sr = librosa.load(str(audio_path), sr=None, mono=False)
            if y.ndim > 1:
                sf.write(str(output_path), y.T, sr)
            else:
                sf.write(str(output_path), y, sr)
        
        return output_path


# Singleton instance
_processor = None

def get_audio_processor() -> AudioProcessor:
    global _processor
    if _processor is None:
        _processor = AudioProcessor()
    return _processor
