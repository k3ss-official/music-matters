"""
Harmonic Mixer - Advanced Camelot Wheel & Mashup Potential Scoring
DJ-ready harmonic mixing suggestions and track compatibility analysis
"""
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class MixSuggestion:
    """A mixing suggestion between two tracks"""
    source_track: str
    target_track: str
    source_key: str
    target_key: str
    source_camelot: str
    target_camelot: str
    compatibility_score: float  # 0-100
    mix_type: str  # 'perfect', 'harmonic', 'energy_boost', 'mood_change', 'risky'
    bpm_difference: float
    suggested_bpm_adjust: float  # Percentage to adjust
    mix_notes: str
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class MashupScore:
    """Mashup potential score between two tracks"""
    track_a: str
    track_b: str
    overall_score: float  # 0-100
    harmonic_score: float
    bpm_score: float
    energy_score: float
    structure_score: float
    recommendation: str  # 'excellent', 'good', 'possible', 'difficult', 'avoid'
    notes: List[str]
    
    def to_dict(self) -> Dict:
        return asdict(self)


class HarmonicMixer:
    """
    Advanced Harmonic Mixing Engine
    
    Features:
    - Full Camelot wheel with all mixing rules
    - Energy boost/down transitions
    - BPM compatibility analysis
    - Mashup potential scoring
    - Mix transition suggestions
    """
    
    # Complete Camelot Wheel
    CAMELOT_WHEEL = {
        # Minor keys (A column)
        'A minor': '8A', 'Am': '8A',
        'E minor': '9A', 'Em': '9A',
        'B minor': '10A', 'Bm': '10A',
        'F# minor': '11A', 'F#m': '11A', 'Gb minor': '11A',
        'C# minor': '12A', 'C#m': '12A', 'Db minor': '12A',
        'G# minor': '1A', 'G#m': '1A', 'Ab minor': '1A',
        'D# minor': '2A', 'D#m': '2A', 'Eb minor': '2A',
        'A# minor': '3A', 'A#m': '3A', 'Bb minor': '3A',
        'F minor': '4A', 'Fm': '4A',
        'C minor': '5A', 'Cm': '5A',
        'G minor': '6A', 'Gm': '6A',
        'D minor': '7A', 'Dm': '7A',
        # Major keys (B column)
        'C major': '8B', 'C': '8B',
        'G major': '9B', 'G': '9B',
        'D major': '10B', 'D': '10B',
        'A major': '11B', 'A': '11B',
        'E major': '12B', 'E': '12B',
        'B major': '1B', 'B': '1B',
        'F# major': '2B', 'F#': '2B', 'Gb major': '2B', 'Gb': '2B',
        'Db major': '3B', 'Db': '3B', 'C# major': '3B',
        'Ab major': '4B', 'Ab': '4B', 'G# major': '4B',
        'Eb major': '5B', 'Eb': '5B', 'D# major': '5B',
        'Bb major': '6B', 'Bb': '6B', 'A# major': '6B',
        'F major': '7B', 'F': '7B',
    }
    
    # Reverse mapping (Camelot to Key)
    CAMELOT_TO_KEY = {
        '1A': 'G# minor', '1B': 'B major',
        '2A': 'D# minor', '2B': 'F# major',
        '3A': 'Bb minor', '3B': 'Db major',
        '4A': 'F minor', '4B': 'Ab major',
        '5A': 'C minor', '5B': 'Eb major',
        '6A': 'G minor', '6B': 'Bb major',
        '7A': 'D minor', '7B': 'F major',
        '8A': 'A minor', '8B': 'C major',
        '9A': 'E minor', '9B': 'G major',
        '10A': 'B minor', '10B': 'D major',
        '11A': 'F# minor', '11B': 'A major',
        '12A': 'C# minor', '12B': 'E major',
    }
    
    # Mix type rules
    MIX_RULES = {
        'same': {'score': 100, 'type': 'perfect', 'description': 'Same key - Perfect harmonic match'},
        'adjacent_up': {'score': 90, 'type': 'harmonic', 'description': 'Move +1 on wheel - Smooth energy lift'},
        'adjacent_down': {'score': 90, 'type': 'harmonic', 'description': 'Move -1 on wheel - Smooth energy drop'},
        'relative': {'score': 85, 'type': 'mood_change', 'description': 'Relative major/minor - Mood shift'},
        'energy_boost': {'score': 75, 'type': 'energy_boost', 'description': '+7 semitones - High energy boost'},
        'diagonal_up': {'score': 70, 'type': 'harmonic', 'description': 'Diagonal +1 - Creative transition'},
        'diagonal_down': {'score': 70, 'type': 'harmonic', 'description': 'Diagonal -1 - Creative transition'},
        'two_steps': {'score': 50, 'type': 'risky', 'description': '±2 on wheel - Audible but possible'},
        'clash': {'score': 20, 'type': 'avoid', 'description': 'Keys clash - Not recommended'},
    }
    
    # BPM tolerance thresholds
    BPM_PERFECT_MATCH = 0.5  # Within 0.5 BPM
    BPM_SAFE_RANGE = 3.0  # Within 3 BPM (±3%)
    BPM_STRETCH_LIMIT = 8.0  # Within 8 BPM (±6%)
    BPM_MAX_ADJUST = 10.0  # Maximum recommended adjustment
    
    def __init__(self):
        pass
    
    def get_camelot(self, key: str) -> str:
        """Convert key string to Camelot notation"""
        # Handle keys with Camelot already in them
        if '(' in key:
            # Extract Camelot from "A minor (8A)" format
            start = key.find('(') + 1
            end = key.find(')')
            if start > 0 and end > start:
                return key[start:end]
        
        # Direct lookup
        return self.CAMELOT_WHEEL.get(key, self.CAMELOT_WHEEL.get(key.replace(' ', ''), '?'))
    
    def get_key_from_camelot(self, camelot: str) -> str:
        """Convert Camelot notation to key"""
        return self.CAMELOT_TO_KEY.get(camelot, 'Unknown')
    
    def analyze_mix_compatibility(
        self,
        source_key: str,
        target_key: str,
        source_bpm: float,
        target_bpm: float
    ) -> MixSuggestion:
        """Analyze harmonic compatibility between two tracks"""
        source_camelot = self.get_camelot(source_key)
        target_camelot = self.get_camelot(target_key)
        
        # Calculate harmonic compatibility
        mix_type, score, description = self._get_mix_relationship(source_camelot, target_camelot)
        
        # Adjust score based on BPM compatibility
        bpm_diff = abs(source_bpm - target_bpm)
        bpm_adjustment = self._calculate_bpm_adjustment(source_bpm, target_bpm)
        
        # BPM penalty
        if bpm_diff > self.BPM_MAX_ADJUST:
            score *= 0.5
            description += " | BPM difference too large"
        elif bpm_diff > self.BPM_STRETCH_LIMIT:
            score *= 0.8
            description += f" | Requires {bpm_adjustment:.1f}% tempo adjustment"
        elif bpm_diff > self.BPM_SAFE_RANGE:
            score *= 0.9
            description += f" | Minor tempo adjustment needed"
        
        return MixSuggestion(
            source_track="",
            target_track="",
            source_key=source_key,
            target_key=target_key,
            source_camelot=source_camelot,
            target_camelot=target_camelot,
            compatibility_score=score,
            mix_type=mix_type,
            bpm_difference=bpm_diff,
            suggested_bpm_adjust=bpm_adjustment,
            mix_notes=description
        )
    
    def _get_mix_relationship(self, source: str, target: str) -> Tuple[str, float, str]:
        """Determine the mixing relationship between two Camelot codes"""
        if source == '?' or target == '?':
            return 'unknown', 50.0, 'Key unknown - proceed with caution'
        
        if source == target:
            return self.MIX_RULES['same']['type'], self.MIX_RULES['same']['score'], self.MIX_RULES['same']['description']
        
        try:
            source_num = int(source[:-1])
            source_letter = source[-1]
            target_num = int(target[:-1])
            target_letter = target[-1]
            
            # Calculate wheel distance
            diff = (target_num - source_num) % 12
            if diff > 6:
                diff = diff - 12
            
            # Same letter (major/minor)
            if source_letter == target_letter:
                if abs(diff) == 1 or diff == 11 or diff == -11:
                    if diff > 0 or diff == -11:
                        return self.MIX_RULES['adjacent_up']['type'], self.MIX_RULES['adjacent_up']['score'], self.MIX_RULES['adjacent_up']['description']
                    else:
                        return self.MIX_RULES['adjacent_down']['type'], self.MIX_RULES['adjacent_down']['score'], self.MIX_RULES['adjacent_down']['description']
                elif abs(diff) == 2:
                    return self.MIX_RULES['two_steps']['type'], self.MIX_RULES['two_steps']['score'], self.MIX_RULES['two_steps']['description']
                elif abs(diff) == 7:
                    return self.MIX_RULES['energy_boost']['type'], self.MIX_RULES['energy_boost']['score'], self.MIX_RULES['energy_boost']['description']
            
            # Different letter (relative major/minor or diagonal)
            if diff == 0:
                return self.MIX_RULES['relative']['type'], self.MIX_RULES['relative']['score'], self.MIX_RULES['relative']['description']
            elif abs(diff) == 1 or diff == 11 or diff == -11:
                if diff > 0 or diff == -11:
                    return self.MIX_RULES['diagonal_up']['type'], self.MIX_RULES['diagonal_up']['score'], self.MIX_RULES['diagonal_up']['description']
                else:
                    return self.MIX_RULES['diagonal_down']['type'], self.MIX_RULES['diagonal_down']['score'], self.MIX_RULES['diagonal_down']['description']
            
            # Everything else is a clash
            return self.MIX_RULES['clash']['type'], self.MIX_RULES['clash']['score'], self.MIX_RULES['clash']['description']
            
        except (ValueError, IndexError):
            return 'unknown', 50.0, 'Invalid Camelot code'
    
    def _calculate_bpm_adjustment(self, source_bpm: float, target_bpm: float) -> float:
        """Calculate required tempo adjustment percentage"""
        if source_bpm == 0:
            return 0
        return ((target_bpm - source_bpm) / source_bpm) * 100
    
    def get_compatible_keys(self, key: str) -> List[Dict]:
        """Get all harmonically compatible keys for a given key"""
        camelot = self.get_camelot(key)
        if camelot == '?':
            return []
        
        compatible = []
        try:
            num = int(camelot[:-1])
            letter = camelot[-1]
            
            # Same key
            compatible.append({
                'key': key,
                'camelot': camelot,
                'type': 'same',
                'score': 100,
                'description': 'Same key'
            })
            
            # +1 (adjacent up)
            next_num = (num % 12) + 1
            next_camelot = f"{next_num}{letter}"
            compatible.append({
                'key': self.CAMELOT_TO_KEY.get(next_camelot, '?'),
                'camelot': next_camelot,
                'type': 'adjacent_up',
                'score': 90,
                'description': 'Energy lift'
            })
            
            # -1 (adjacent down)
            prev_num = ((num - 2) % 12) + 1
            prev_camelot = f"{prev_num}{letter}"
            compatible.append({
                'key': self.CAMELOT_TO_KEY.get(prev_camelot, '?'),
                'camelot': prev_camelot,
                'type': 'adjacent_down',
                'score': 90,
                'description': 'Energy drop'
            })
            
            # Relative (same number, different letter)
            other_letter = 'A' if letter == 'B' else 'B'
            rel_camelot = f"{num}{other_letter}"
            compatible.append({
                'key': self.CAMELOT_TO_KEY.get(rel_camelot, '?'),
                'camelot': rel_camelot,
                'type': 'relative',
                'score': 85,
                'description': 'Mood change (relative major/minor)'
            })
            
            # Energy boost (+7)
            boost_num = ((num + 6) % 12) + 1
            boost_camelot = f"{boost_num}{letter}"
            compatible.append({
                'key': self.CAMELOT_TO_KEY.get(boost_camelot, '?'),
                'camelot': boost_camelot,
                'type': 'energy_boost',
                'score': 75,
                'description': 'Energy boost (+7 semitones)'
            })
            
            # Diagonal moves
            for offset in [1, -1]:
                diag_num = ((num + offset - 1) % 12) + 1
                diag_camelot = f"{diag_num}{other_letter}"
                compatible.append({
                    'key': self.CAMELOT_TO_KEY.get(diag_camelot, '?'),
                    'camelot': diag_camelot,
                    'type': 'diagonal',
                    'score': 70,
                    'description': f"Diagonal {'up' if offset > 0 else 'down'}"
                })
            
        except (ValueError, IndexError):
            pass
        
        return compatible
    
    def calculate_mashup_score(
        self,
        track_a: Dict,
        track_b: Dict
    ) -> MashupScore:
        """
        Calculate mashup potential between two tracks
        
        Args:
            track_a: Dict with 'key', 'bpm', 'energy' (0-1), 'sections' (list)
            track_b: Dict with same structure
        
        Returns:
            MashupScore with detailed analysis
        """
        notes = []
        
        # === HARMONIC SCORE ===
        key_a = track_a.get('key', 'Unknown')
        key_b = track_b.get('key', 'Unknown')
        camelot_a = self.get_camelot(key_a)
        camelot_b = self.get_camelot(key_b)
        
        _, harmonic_raw, harmonic_desc = self._get_mix_relationship(camelot_a, camelot_b)
        harmonic_score = harmonic_raw
        notes.append(f"Harmonic: {harmonic_desc}")
        
        # === BPM SCORE ===
        bpm_a = track_a.get('bpm', 120)
        bpm_b = track_b.get('bpm', 120)
        bpm_diff = abs(bpm_a - bpm_b)
        
        if bpm_diff <= self.BPM_PERFECT_MATCH:
            bpm_score = 100
            notes.append(f"BPM: Perfect match ({bpm_a:.1f} vs {bpm_b:.1f})")
        elif bpm_diff <= self.BPM_SAFE_RANGE:
            bpm_score = 90
            notes.append(f"BPM: Good match (diff: {bpm_diff:.1f})")
        elif bpm_diff <= self.BPM_STRETCH_LIMIT:
            bpm_score = 70
            notes.append(f"BPM: Requires adjustment ({bpm_diff:.1f} BPM diff)")
        elif bpm_diff <= self.BPM_MAX_ADJUST:
            bpm_score = 50
            notes.append(f"BPM: Significant stretch needed ({bpm_diff:.1f} BPM diff)")
        else:
            bpm_score = 20
            notes.append(f"BPM: Too different ({bpm_diff:.1f} BPM diff)")
        
        # Check for double/half time compatibility
        if bpm_score < 50:
            ratio = bpm_a / bpm_b if bpm_b != 0 else 0
            if abs(ratio - 2.0) < 0.1 or abs(ratio - 0.5) < 0.1:
                bpm_score = 80
                notes.append("BPM: Half/double time compatible!")
        
        # === ENERGY SCORE ===
        energy_a = track_a.get('energy', 0.5)
        energy_b = track_b.get('energy', 0.5)
        energy_diff = abs(energy_a - energy_b)
        
        if energy_diff < 0.15:
            energy_score = 100
            notes.append("Energy: Well matched")
        elif energy_diff < 0.3:
            energy_score = 80
            notes.append("Energy: Compatible with transition")
        else:
            energy_score = 60
            notes.append("Energy: Consider energy buildup/breakdown")
        
        # === STRUCTURE SCORE ===
        sections_a = track_a.get('sections', [])
        sections_b = track_b.get('sections', [])
        
        # Look for complementary sections
        has_drops_a = any(s.get('type') == 'drop' for s in sections_a)
        has_drops_b = any(s.get('type') == 'drop' for s in sections_b)
        has_breakdown_a = any(s.get('type') == 'breakdown' for s in sections_a)
        has_breakdown_b = any(s.get('type') == 'breakdown' for s in sections_b)
        
        structure_score = 70  # Base score
        
        if has_drops_a and has_drops_b:
            structure_score += 15
            notes.append("Structure: Both tracks have drops")
        
        if has_breakdown_a or has_breakdown_b:
            structure_score += 10
            notes.append("Structure: Breakdown available for transition")
        
        if not sections_a and not sections_b:
            structure_score = 50
            notes.append("Structure: Section data unavailable")
        
        structure_score = min(100, structure_score)
        
        # === OVERALL SCORE ===
        overall = (
            harmonic_score * 0.35 +
            bpm_score * 0.30 +
            energy_score * 0.20 +
            structure_score * 0.15
        )
        
        # Determine recommendation
        if overall >= 85:
            recommendation = 'excellent'
        elif overall >= 70:
            recommendation = 'good'
        elif overall >= 50:
            recommendation = 'possible'
        elif overall >= 35:
            recommendation = 'difficult'
        else:
            recommendation = 'avoid'
        
        return MashupScore(
            track_a=track_a.get('title', 'Track A'),
            track_b=track_b.get('title', 'Track B'),
            overall_score=overall,
            harmonic_score=harmonic_score,
            bpm_score=bpm_score,
            energy_score=energy_score,
            structure_score=structure_score,
            recommendation=recommendation,
            notes=notes
        )
    
    def suggest_mix_order(self, tracks: List[Dict]) -> List[Dict]:
        """
        Suggest optimal mixing order for a set of tracks
        Uses traveling salesman approach with harmonic compatibility as distance
        
        Args:
            tracks: List of dicts with 'title', 'key', 'bpm', 'energy'
        
        Returns:
            Ordered list with mixing suggestions between each pair
        """
        if len(tracks) <= 1:
            return tracks
        
        # Build compatibility matrix
        n = len(tracks)
        compatibility = np.zeros((n, n))
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    suggestion = self.analyze_mix_compatibility(
                        tracks[i].get('key', ''),
                        tracks[j].get('key', ''),
                        tracks[i].get('bpm', 120),
                        tracks[j].get('bpm', 120)
                    )
                    compatibility[i, j] = suggestion.compatibility_score
        
        # Greedy nearest neighbor approach
        ordered = []
        visited = set()
        
        # Start with track with highest average compatibility
        avg_compat = np.mean(compatibility, axis=1)
        current = int(np.argmax(avg_compat))
        
        while len(ordered) < n:
            ordered.append({
                **tracks[current],
                'position': len(ordered) + 1
            })
            visited.add(current)
            
            if len(ordered) < n:
                # Find best unvisited neighbor
                best_next = -1
                best_score = -1
                
                for j in range(n):
                    if j not in visited and compatibility[current, j] > best_score:
                        best_score = compatibility[current, j]
                        best_next = j
                
                if best_next >= 0:
                    # Add transition info
                    ordered[-1]['next_mix_score'] = best_score
                    ordered[-1]['next_mix_type'] = self._get_mix_relationship(
                        self.get_camelot(tracks[current].get('key', '')),
                        self.get_camelot(tracks[best_next].get('key', ''))
                    )[0]
                    current = best_next
        
        return ordered


# Singleton
_harmonic_mixer = None

def get_harmonic_mixer() -> HarmonicMixer:
    global _harmonic_mixer
    if _harmonic_mixer is None:
        _harmonic_mixer = HarmonicMixer()
    return _harmonic_mixer
