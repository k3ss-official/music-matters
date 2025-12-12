"""
Audio Fingerprinting Service
Chromaprint-based fingerprinting and similarity detection for samples
"""
import logging
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np
import json

import librosa
from scipy import signal
from scipy.spatial.distance import cosine, euclidean

logger = logging.getLogger(__name__)


@dataclass
class AudioFingerprint:
    """Audio fingerprint with metadata"""
    id: str
    file_path: str
    duration: float
    fingerprint_hash: str  # Short hash for quick comparison
    spectral_peaks: List[int]  # Peak frequency bins
    constellation_map: List[Tuple[int, int, int]]  # Time, freq pairs with hash
    chroma_signature: List[float]  # 12-element chroma average
    mfcc_signature: List[float]  # 13-element MFCC average
    energy_signature: List[float]  # Normalized energy profile
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SimilarityResult:
    """Result of similarity comparison"""
    source_id: str
    target_id: str
    overall_similarity: float  # 0-1 (1 = identical)
    spectral_similarity: float
    harmonic_similarity: float
    rhythmic_similarity: float
    timbral_similarity: float
    match_type: str  # 'exact', 'very_similar', 'similar', 'related', 'different'
    
    def to_dict(self) -> Dict:
        return asdict(self)


class AudioFingerprintService:
    """
    Audio Fingerprinting for Sample Similarity Detection
    
    Based on techniques similar to Chromaprint/Acoustid:
    - Spectral peak extraction
    - Constellation map generation
    - Perceptual hashing
    
    Features:
    - Fast hash-based fingerprint generation
    - Multi-dimensional similarity scoring
    - Find similar samples in library
    - Duplicate detection
    """
    
    def __init__(self, sample_rate: int = 22050):
        self.sr = sample_rate
        self.fingerprint_cache: Dict[str, AudioFingerprint] = {}
    
    def generate_fingerprint(self, file_path: Path) -> AudioFingerprint:
        """Generate a comprehensive audio fingerprint"""
        file_key = str(file_path)
        
        # Check cache
        if file_key in self.fingerprint_cache:
            return self.fingerprint_cache[file_key]
        
        logger.info(f"Generating fingerprint: {file_path}")
        
        # Load audio
        y, sr = librosa.load(str(file_path), sr=self.sr, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Generate components
        spectral_peaks = self._extract_spectral_peaks(y, sr)
        constellation = self._build_constellation_map(y, sr)
        chroma_sig = self._compute_chroma_signature(y, sr)
        mfcc_sig = self._compute_mfcc_signature(y, sr)
        energy_sig = self._compute_energy_signature(y)
        
        # Create hash from combined features
        combined = spectral_peaks[:100] + [int(c * 1000) for c in chroma_sig]
        fingerprint_hash = hashlib.sha256(bytes(combined)).hexdigest()[:32]
        
        # Create fingerprint object
        fingerprint = AudioFingerprint(
            id=hashlib.md5(file_key.encode()).hexdigest()[:12],
            file_path=file_key,
            duration=duration,
            fingerprint_hash=fingerprint_hash,
            spectral_peaks=spectral_peaks,
            constellation_map=constellation[:500],  # Limit size
            chroma_signature=chroma_sig,
            mfcc_signature=mfcc_sig,
            energy_signature=energy_sig
        )
        
        # Cache it
        self.fingerprint_cache[file_key] = fingerprint
        
        return fingerprint
    
    def compare_fingerprints(
        self,
        fp1: AudioFingerprint,
        fp2: AudioFingerprint
    ) -> SimilarityResult:
        """Compare two fingerprints and return similarity score"""
        
        # Spectral similarity (based on peaks)
        spectral_sim = self._compare_spectral_peaks(fp1.spectral_peaks, fp2.spectral_peaks)
        
        # Harmonic similarity (chroma-based)
        harmonic_sim = 1 - cosine(fp1.chroma_signature, fp2.chroma_signature)
        if np.isnan(harmonic_sim):
            harmonic_sim = 0.0
        
        # Timbral similarity (MFCC-based)
        timbral_sim = 1 - cosine(fp1.mfcc_signature, fp2.mfcc_signature)
        if np.isnan(timbral_sim):
            timbral_sim = 0.0
        
        # Rhythmic similarity (energy profile)
        rhythmic_sim = self._compare_energy_profiles(fp1.energy_signature, fp2.energy_signature)
        
        # Overall weighted score
        overall = (
            spectral_sim * 0.25 +
            harmonic_sim * 0.30 +
            timbral_sim * 0.25 +
            rhythmic_sim * 0.20
        )
        
        # Determine match type
        if overall >= 0.95:
            match_type = 'exact'
        elif overall >= 0.85:
            match_type = 'very_similar'
        elif overall >= 0.70:
            match_type = 'similar'
        elif overall >= 0.50:
            match_type = 'related'
        else:
            match_type = 'different'
        
        return SimilarityResult(
            source_id=fp1.id,
            target_id=fp2.id,
            overall_similarity=float(overall),
            spectral_similarity=float(spectral_sim),
            harmonic_similarity=float(harmonic_sim),
            rhythmic_similarity=float(rhythmic_sim),
            timbral_similarity=float(timbral_sim),
            match_type=match_type
        )
    
    def find_similar(
        self,
        target_fingerprint: AudioFingerprint,
        library_fingerprints: List[AudioFingerprint],
        threshold: float = 0.6,
        max_results: int = 10
    ) -> List[Tuple[AudioFingerprint, SimilarityResult]]:
        """Find similar samples in a library"""
        
        results = []
        
        for lib_fp in library_fingerprints:
            if lib_fp.id == target_fingerprint.id:
                continue  # Skip self
            
            similarity = self.compare_fingerprints(target_fingerprint, lib_fp)
            
            if similarity.overall_similarity >= threshold:
                results.append((lib_fp, similarity))
        
        # Sort by similarity (descending)
        results.sort(key=lambda x: x[1].overall_similarity, reverse=True)
        
        return results[:max_results]
    
    def detect_duplicates(
        self,
        fingerprints: List[AudioFingerprint],
        threshold: float = 0.92
    ) -> List[Tuple[AudioFingerprint, AudioFingerprint, float]]:
        """Detect potential duplicate samples"""
        
        duplicates = []
        seen_pairs = set()
        
        for i, fp1 in enumerate(fingerprints):
            for j, fp2 in enumerate(fingerprints):
                if i >= j:
                    continue
                
                pair_key = tuple(sorted([fp1.id, fp2.id]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                
                # Quick hash check first
                if fp1.fingerprint_hash == fp2.fingerprint_hash:
                    duplicates.append((fp1, fp2, 1.0))
                    continue
                
                # Full comparison for near-duplicates
                similarity = self.compare_fingerprints(fp1, fp2)
                if similarity.overall_similarity >= threshold:
                    duplicates.append((fp1, fp2, similarity.overall_similarity))
        
        return duplicates
    
    def _extract_spectral_peaks(self, y: np.ndarray, sr: int) -> List[int]:
        """Extract dominant spectral peaks"""
        # Compute spectrogram
        S = np.abs(librosa.stft(y))
        
        # Average across time
        avg_spectrum = np.mean(S, axis=1)
        
        # Find peaks
        peaks, _ = signal.find_peaks(avg_spectrum, height=np.mean(avg_spectrum))
        
        # Get top peaks
        peak_magnitudes = avg_spectrum[peaks]
        sorted_indices = np.argsort(peak_magnitudes)[::-1]
        top_peaks = peaks[sorted_indices[:200]]
        
        return sorted(top_peaks.tolist())
    
    def _build_constellation_map(self, y: np.ndarray, sr: int) -> List[Tuple[int, int, int]]:
        """Build constellation map of spectral peaks over time"""
        # Compute spectrogram
        S = np.abs(librosa.stft(y, hop_length=512))
        
        constellation = []
        
        # Find local maxima in each time frame
        for t in range(S.shape[1]):
            frame = S[:, t]
            
            # Find peaks in this frame
            peaks, properties = signal.find_peaks(
                frame,
                height=np.percentile(frame, 90),
                distance=10
            )
            
            # Add top peaks to constellation
            for peak in peaks[:5]:
                # Create hash from time, frequency
                hash_val = hash((t, int(peak))) % (2**32)
                constellation.append((t, int(peak), hash_val))
        
        return constellation
    
    def _compute_chroma_signature(self, y: np.ndarray, sr: int) -> List[float]:
        """Compute average chroma signature (12 pitch classes)"""
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        avg_chroma = np.mean(chroma, axis=1)
        
        # Normalize
        if np.max(avg_chroma) > 0:
            avg_chroma = avg_chroma / np.max(avg_chroma)
        
        return avg_chroma.tolist()
    
    def _compute_mfcc_signature(self, y: np.ndarray, sr: int) -> List[float]:
        """Compute average MFCC signature (13 coefficients)"""
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        avg_mfcc = np.mean(mfcc, axis=1)
        
        # Normalize
        if np.std(avg_mfcc) > 0:
            avg_mfcc = (avg_mfcc - np.mean(avg_mfcc)) / np.std(avg_mfcc)
        
        return avg_mfcc.tolist()
    
    def _compute_energy_signature(self, y: np.ndarray, num_segments: int = 32) -> List[float]:
        """Compute normalized energy profile"""
        segment_length = len(y) // num_segments
        
        energies = []
        for i in range(num_segments):
            start = i * segment_length
            end = start + segment_length
            segment = y[start:end]
            energies.append(float(np.sqrt(np.mean(segment ** 2))))
        
        # Normalize
        if max(energies) > 0:
            energies = [e / max(energies) for e in energies]
        
        return energies
    
    def _compare_spectral_peaks(self, peaks1: List[int], peaks2: List[int]) -> float:
        """Compare spectral peak sets using Jaccard similarity"""
        if not peaks1 or not peaks2:
            return 0.0
        
        set1 = set(peaks1)
        set2 = set(peaks2)
        
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        
        return intersection / union if union > 0 else 0.0
    
    def _compare_energy_profiles(self, energy1: List[float], energy2: List[float]) -> float:
        """Compare energy profiles using correlation"""
        if len(energy1) != len(energy2):
            # Resample to same length
            target_len = min(len(energy1), len(energy2))
            energy1 = self._resample_list(energy1, target_len)
            energy2 = self._resample_list(energy2, target_len)
        
        # Compute correlation
        corr = np.corrcoef(energy1, energy2)[0, 1]
        
        if np.isnan(corr):
            return 0.0
        
        # Map from -1..1 to 0..1
        return (corr + 1) / 2
    
    def _resample_list(self, lst: List[float], target_len: int) -> List[float]:
        """Resample a list to target length"""
        if len(lst) == target_len:
            return lst
        
        indices = np.linspace(0, len(lst) - 1, target_len)
        return [lst[int(i)] for i in indices]
    
    def save_library(self, filepath: Path):
        """Save fingerprint library to disk"""
        data = {
            fp_id: fp.to_dict()
            for fp_id, fp in self.fingerprint_cache.items()
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f)
        
        logger.info(f"Saved {len(data)} fingerprints to {filepath}")
    
    def load_library(self, filepath: Path):
        """Load fingerprint library from disk"""
        if not filepath.exists():
            logger.warning(f"Library file not found: {filepath}")
            return
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        for fp_id, fp_data in data.items():
            # Convert lists back to tuples for constellation
            fp_data['constellation_map'] = [
                tuple(x) for x in fp_data.get('constellation_map', [])
            ]
            self.fingerprint_cache[fp_id] = AudioFingerprint(**fp_data)
        
        logger.info(f"Loaded {len(data)} fingerprints from {filepath}")


class SemanticAudioSearch:
    """
    Semantic Audio Search using Neural Embeddings
    
    Uses a simple but effective approach:
    - Multi-layer feature extraction
    - Feature aggregation for fixed-size embeddings
    - Cosine similarity for semantic matching
    
    For production, this could be extended to use:
    - CLAP (Contrastive Language-Audio Pretraining)
    - MERT (Music Embedding Retrieval Transformer)
    - Audio2Vec models
    """
    
    def __init__(self, sample_rate: int = 22050, embedding_dim: int = 256):
        self.sr = sample_rate
        self.embedding_dim = embedding_dim
        self.embedding_cache: Dict[str, np.ndarray] = {}
    
    def compute_embedding(self, file_path: Path) -> np.ndarray:
        """Compute semantic embedding for an audio file"""
        file_key = str(file_path)
        
        # Check cache
        if file_key in self.embedding_cache:
            return self.embedding_cache[file_key]
        
        # Load audio
        y, sr = librosa.load(str(file_path), sr=self.sr, mono=True)
        
        # Extract multi-level features
        features = []
        
        # 1. Mel-frequency features (timbral)
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
        mel_mean = np.mean(mel, axis=1)
        mel_std = np.std(mel, axis=1)
        features.extend(mel_mean.tolist())
        features.extend(mel_std.tolist())
        
        # 2. Chroma features (harmonic)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        chroma_std = np.std(chroma, axis=1)
        features.extend(chroma_mean.tolist())
        features.extend(chroma_std.tolist())
        
        # 3. Rhythm features
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        features.append(tempo / 200)  # Normalized tempo
        
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        features.append(np.mean(onset_env))
        features.append(np.std(onset_env))
        
        # 4. Spectral features
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        
        features.append(np.mean(centroid) / sr)
        features.append(np.mean(rolloff) / sr)
        features.extend(np.mean(contrast, axis=1).tolist())
        
        # 5. Zero-crossing rate (texture)
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features.append(np.mean(zcr))
        features.append(np.std(zcr))
        
        # Pad or truncate to embedding_dim
        embedding = np.array(features)
        if len(embedding) < self.embedding_dim:
            embedding = np.pad(embedding, (0, self.embedding_dim - len(embedding)))
        else:
            embedding = embedding[:self.embedding_dim]
        
        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        # Cache
        self.embedding_cache[file_key] = embedding
        
        return embedding
    
    def semantic_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Compute semantic similarity between two embeddings"""
        sim = 1 - cosine(embedding1, embedding2)
        return float(sim) if not np.isnan(sim) else 0.0
    
    def find_semantically_similar(
        self,
        query_embedding: np.ndarray,
        library_embeddings: Dict[str, np.ndarray],
        top_k: int = 10
    ) -> List[Tuple[str, float]]:
        """Find semantically similar items in library"""
        results = []
        
        for file_path, embedding in library_embeddings.items():
            sim = self.semantic_similarity(query_embedding, embedding)
            results.append((file_path, sim))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]
    
    def describe_audio(self, file_path: Path) -> Dict[str, str]:
        """Generate semantic description of audio characteristics"""
        y, sr = librosa.load(str(file_path), sr=self.sr, mono=True)
        
        # Analyze features
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        
        rms = librosa.feature.rms(y=y)[0]
        energy = np.mean(rms)
        
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        brightness = np.mean(centroid) / (sr / 2)
        
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        percussiveness = np.mean(zcr)
        
        # Generate descriptions
        descriptions = {}
        
        # Tempo description
        if tempo < 90:
            descriptions['tempo'] = 'slow'
        elif tempo < 120:
            descriptions['tempo'] = 'moderate'
        elif tempo < 140:
            descriptions['tempo'] = 'upbeat'
        else:
            descriptions['tempo'] = 'fast'
        
        # Energy description
        if energy < 0.1:
            descriptions['energy'] = 'mellow'
        elif energy < 0.3:
            descriptions['energy'] = 'moderate'
        elif energy < 0.5:
            descriptions['energy'] = 'energetic'
        else:
            descriptions['energy'] = 'powerful'
        
        # Brightness description
        if brightness < 0.2:
            descriptions['tone'] = 'dark'
        elif brightness < 0.4:
            descriptions['tone'] = 'warm'
        elif brightness < 0.6:
            descriptions['tone'] = 'balanced'
        else:
            descriptions['tone'] = 'bright'
        
        # Texture description
        if percussiveness < 0.05:
            descriptions['texture'] = 'smooth'
        elif percussiveness < 0.1:
            descriptions['texture'] = 'mixed'
        else:
            descriptions['texture'] = 'percussive'
        
        return descriptions


# Singletons
_fingerprint_service = None
_semantic_search = None

def get_fingerprint_service() -> AudioFingerprintService:
    global _fingerprint_service
    if _fingerprint_service is None:
        _fingerprint_service = AudioFingerprintService()
    return _fingerprint_service

def get_semantic_search() -> SemanticAudioSearch:
    global _semantic_search
    if _semantic_search is None:
        _semantic_search = SemanticAudioSearch()
    return _semantic_search
