"""
Stem Separation Service
Uses Demucs htdemucs_6s for 6-stem separation
Optimized for Apple Silicon (M4 Mini)
"""
import logging
import os
import shutil
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass
import subprocess
import torch

from config import (
    STEMS_DIR, TEMP_DIR, DEMUCS_MODEL, DEMUCS_STEMS,
    DEMUCS_DEVICE, DEMUCS_SHIFTS, DEMUCS_OVERLAP, SAMPLE_RATE
)

logger = logging.getLogger(__name__)


@dataclass
class StemResult:
    """Result of stem separation"""
    success: bool
    original_file: str
    stems: Dict[str, str]  # stem_name -> file_path
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            'success': self.success,
            'original_file': self.original_file,
            'stems': self.stems,
            'error': self.error
        }


class StemSeparator:
    """
    Separates audio into stems using Demucs
    
    Uses htdemucs_6s model for 6 stems:
    - drums
    - bass
    - vocals
    - guitar
    - piano
    - other
    """
    
    def __init__(self):
        self.stems_dir = STEMS_DIR
        self.temp_dir = TEMP_DIR
        self.model_name = DEMUCS_MODEL
        self.stems = DEMUCS_STEMS
        self.device = self._get_device()
        self.shifts = DEMUCS_SHIFTS
        self.overlap = DEMUCS_OVERLAP
        
        # Check if demucs is available
        self.demucs_available = self._check_demucs()
        
    def _get_device(self) -> str:
        """Determine the best device for inference"""
        if torch.backends.mps.is_available():
            logger.info("Using Apple Silicon MPS for Demucs")
            return 'mps'
        elif torch.cuda.is_available():
            logger.info("Using CUDA for Demucs")
            return 'cuda'
        else:
            logger.info("Using CPU for Demucs")
            return 'cpu'
    
    def _check_demucs(self) -> bool:
        """Check if demucs is installed and available"""
        try:
            result = subprocess.run(
                ['python', '-c', 'import demucs'],
                capture_output=True,
                timeout=10
            )
            return result.returncode == 0
        except Exception as e:
            logger.warning(f"Demucs not available: {e}")
            return False
    
    def separate(
        self,
        input_file: Path,
        output_dir: Optional[Path] = None,
        selected_stems: Optional[List[str]] = None
    ) -> StemResult:
        """
        Separate audio file into stems
        
        Args:
            input_file: Path to input audio file
            output_dir: Optional output directory (defaults to STEMS_DIR/filename)
            selected_stems: Optional list of stems to extract (defaults to all)
        
        Returns:
            StemResult with paths to separated stems
        """
        if not self.demucs_available:
            return StemResult(
                success=False,
                original_file=str(input_file),
                stems={},
                error="Demucs is not installed. Run: pip install demucs"
            )
        
        if not input_file.exists():
            return StemResult(
                success=False,
                original_file=str(input_file),
                stems={},
                error=f"Input file not found: {input_file}"
            )
        
        # Set up output directory
        if output_dir is None:
            output_dir = self.stems_dir / input_file.stem
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Use temporary directory for demucs output
        temp_output = self.temp_dir / 'demucs_output'
        temp_output.mkdir(parents=True, exist_ok=True)
        
        try:
            # Build demucs command
            cmd = [
                'python', '-m', 'demucs',
                '--name', self.model_name,
                '--out', str(temp_output),
                '--device', self.device,
                '--shifts', str(self.shifts),
                '--overlap', str(self.overlap),
                '--float32',  # Better quality
                str(input_file)
            ]
            
            logger.info(f"Running Demucs: {' '.join(cmd)}")
            
            # Run demucs
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10 minute timeout
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"Demucs error: {error_msg}")
                return StemResult(
                    success=False,
                    original_file=str(input_file),
                    stems={},
                    error=f"Demucs failed: {error_msg[:500]}"
                )
            
            # Find output files
            # Demucs outputs to: temp_output/model_name/track_name/stem.wav
            demucs_output_dir = temp_output / self.model_name / input_file.stem
            
            if not demucs_output_dir.exists():
                # Try alternative path structure
                for model_dir in temp_output.iterdir():
                    if model_dir.is_dir():
                        for track_dir in model_dir.iterdir():
                            if track_dir.is_dir():
                                demucs_output_dir = track_dir
                                break
            
            stems_dict = {}
            stems_to_process = selected_stems or self.stems
            
            for stem_name in stems_to_process:
                stem_file = demucs_output_dir / f"{stem_name}.wav"
                
                if stem_file.exists():
                    # Copy to final output directory
                    final_path = output_dir / f"{input_file.stem}_{stem_name}.wav"
                    shutil.copy2(stem_file, final_path)
                    stems_dict[stem_name] = str(final_path)
                    logger.info(f"Extracted stem: {stem_name} -> {final_path}")
                else:
                    logger.warning(f"Stem not found: {stem_name}")
            
            # Clean up temp directory
            if demucs_output_dir.exists():
                shutil.rmtree(demucs_output_dir.parent.parent, ignore_errors=True)
            
            return StemResult(
                success=True,
                original_file=str(input_file),
                stems=stems_dict
            )
            
        except subprocess.TimeoutExpired:
            return StemResult(
                success=False,
                original_file=str(input_file),
                stems={},
                error="Demucs timeout (>10 minutes)"
            )
        except Exception as e:
            logger.error(f"Stem separation error: {e}")
            return StemResult(
                success=False,
                original_file=str(input_file),
                stems={},
                error=str(e)
            )
    
    def separate_sample(
        self,
        sample_file: Path,
        output_dir: Optional[Path] = None
    ) -> StemResult:
        """
        Separate a sample (shorter audio) into stems
        Same as separate() but optimized for shorter files
        """
        return self.separate(sample_file, output_dir)
    
    def get_available_stems(self) -> List[str]:
        """Get list of available stem types"""
        return self.stems.copy()
    
    def is_available(self) -> bool:
        """Check if stem separation is available"""
        return self.demucs_available


class StemManager:
    """Manages stem separation jobs and caching"""
    
    def __init__(self):
        self.separator = StemSeparator()
        self.stems_dir = STEMS_DIR
        
    def get_or_create_stems(
        self,
        input_file: Path,
        selected_stems: Optional[List[str]] = None
    ) -> StemResult:
        """
        Get stems for a file, using cache if available
        """
        # Check if stems already exist
        output_dir = self.stems_dir / input_file.stem
        
        if output_dir.exists():
            existing_stems = {}
            stems_to_check = selected_stems or DEMUCS_STEMS
            
            all_exist = True
            for stem_name in stems_to_check:
                stem_path = output_dir / f"{input_file.stem}_{stem_name}.wav"
                if stem_path.exists():
                    existing_stems[stem_name] = str(stem_path)
                else:
                    all_exist = False
            
            if all_exist:
                logger.info(f"Using cached stems for: {input_file}")
                return StemResult(
                    success=True,
                    original_file=str(input_file),
                    stems=existing_stems
                )
        
        # Need to create stems
        return self.separator.separate(input_file, output_dir, selected_stems)
    
    def clear_cache(self, input_file: Optional[Path] = None):
        """Clear stem cache for a specific file or all files"""
        if input_file:
            cache_dir = self.stems_dir / input_file.stem
            if cache_dir.exists():
                shutil.rmtree(cache_dir)
                logger.info(f"Cleared stem cache for: {input_file}")
        else:
            # Clear all
            for item in self.stems_dir.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
            logger.info("Cleared all stem cache")
    
    def get_stem_info(self) -> Dict:
        """Get information about stem separation capability"""
        return {
            'available': self.separator.is_available(),
            'model': DEMUCS_MODEL,
            'device': self.separator.device,
            'stems': self.separator.get_available_stems(),
            'stems_dir': str(self.stems_dir)
        }


# Singleton
_stem_manager = None

def get_stem_manager() -> StemManager:
    global _stem_manager
    if _stem_manager is None:
        _stem_manager = StemManager()
    return _stem_manager
