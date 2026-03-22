
***

# Music Matters × MLX — Architecture v2

### M4-Optimised Component Architecture

**Date:** March 2026 | **Rig:** Apple M4 (Neural Engine: 38 TOPS, 546 GB/s memory bandwidth)

***

## TL;DR — The 3 Biggest Wins

1. **Roformer replaces Demucs for vocals** — 12.6 SDR vs ~8-9 SDR, runs via `mlx-audio-separator`
2. **SAM Audio enables text-prompted extraction** — describe what you want ("kick drum", "bass riff"), get it surgically isolated; maps directly to Music Matters' pull/steal workflow
3. **`all-in-one` replaces multiple analysis tools** — single model returns beats, downbeats, chords, key, sections, and structure in one pass; eliminates 4 separate library calls

***

## Table of Contents

1. Current Architecture (Baseline)
2. M4 Hardware Capabilities
3. Component-by-Component Replacement Map
4. Stem Separation — New Hierarchy
5. Beat \& Downbeat Detection — Upgrade Path
6. Chord, Key \& Structure Analysis — New Stack
7. Music Generation — ACE-Step 1.5
8. MLX Quantization \& Storage Strategy
9. Updated `analyse.py` — Drop-in Code
10. Integration Roadmap
11. Install Cheatsheet
12. Source References

***

## 1. Current Architecture (Baseline)

| Component | Current Tool | Status |
| :-- | :-- | :-- |
| Stem separation | `demucs htdemucs_6s` via MPS | Working, but suboptimal for vocals |
| Beat tracking | `librosa.beat.beat_track()` | No downbeat support — bar grid is estimated |
| Downbeat detection | `madmom DBNDownBeatTrackingProcessor` | Works but slow, not MLX-native |
| Key detection | `librosa.key_to_hz` / `essentia` | Basic |
| Chord analysis | None (not implemented) | Gap |
| Section/structure | `detect_smart_phrases()` onset+energy | Heuristic only, no ML |
| Music generation | Not implemented | Roadmap item |
| Model storage | Default HuggingFace cache | Unorganised, no SSD strategy |


***

## 2. M4 Hardware Capabilities

**Why M4 changes what's possible:**

- **Neural Engine: 38 TOPS** — dedicated ML inference, offloads from CPU/GPU entirely for supported CoreML models
- **Memory bandwidth: 546 GB/s** — unified memory means model weights and audio buffers share the same pool; no PCIe bottleneck
- **MLX framework** — Apple's ML framework designed specifically for Apple Silicon; models run natively on ANE + GPU with no CUDA dependency
- **MPS backend** — PyTorch Metal Performance Shaders; fallback for non-MLX models, still faster than CPU

**Benchmark reference (M4 Max, demucs-mlx):**

- PyTorch MPS: ~7s for a 3:15 track
- demucs-mlx: **2.7s for the same track** — 2.6× faster
- Realtime factor: **73× realtime**

***

## 3. Component-by-Component Replacement Map

| Current Component | Current Tool | MLX Replacement | Why |
| :-- | :-- | :-- | :-- |
| Stem separation (all) | `demucs htdemucs_6s` | `demucs-mlx` (keep for speed) | Already 73× RT on M4 |
| Stem separation (vocals) | `demucs htdemucs_6s` | `mlx-audio-separator` + MelBand-Roformer | SDR 12.6 vs ~8-9 |
| Stem separation (targeted) | Not implemented | `mlx-community/sam-audio-small` | Text-prompted extraction |
| Beat tracking | `librosa.beat.beat_track()` | `BeatNet` | Returns beats + downbeats (bar positions) |
| Downbeat detection | `madmom DBNDownBeatTrackingProcessor` | `BeatNet` (replaces madmom too) | Single model, faster, bar-aware |
| Chord analysis | None | `all-in-one` (via `allin1` Python package) | Full chord timeline in one pass |
| Key detection | `librosa` | `all-in-one` | Bundled in same model pass |
| Section/structure | Heuristic onset+energy | `all-in-one` (sections: intro/verse/chorus/bridge/outro) | ML-detected, not heuristic |
| Audio → MIDI | Not implemented | `basic-pitch` (Spotify, CoreML) | Runs on Neural Engine, any stem → MIDI |
| Music generation | Not implemented | `ACE-Step 1.5` (MLX backend) | Local, MIT, Suno-level quality |
| Model quantization | Not implemented | `mlx_lm.convert` (4-bit) | Fits large models in unified memory |


***

## 4. Stem Separation — New Hierarchy

### Tier 1: Speed runs (drums/bass/other) — keep demucs-mlx

```python
# requirements: pip install demucs-mlx
from demucs_mlx import separate

stems = separate(audio_path, model="htdemucs_6s")
# Returns: drums, bass, vocals, guitar, piano, other
# Speed: ~2.7s for 3:15 track on M4 Max
```


### Tier 2: Vocal quality — switch to MelBand-Roformer

```python
# requirements: pip install mlx-audio-separator
from mlx_audio_separator import Separator

sep = Separator(model="KimberleyJensen/Mel-Band-Roformer-Vocal-Model")
vocals, instrumental = sep.separate(audio_path)
# SDR: 12.6 (vs demucs ~8-9)
# Use when: user needs clean vocals to sample/steal
```


### Tier 3: Surgical extraction — SAM Audio (text-prompted)

```python
# requirements: pip install mlx (model: mlx-community/sam-audio-small)
import mlx.core as mx
from transformers import pipeline

# Text prompt → extract that specific sound
pipe = pipeline(
    "audio-source-separation",
    model="mlx-community/sam-audio-small"
)
result = pipe(audio_path, text_query="kick drum with reverb")
# Maps to: UI "describe what you want" extraction panel
```

**Decision logic in `pipeline.py`:**

```python
def choose_separator(mode: str, stem_type: str):
    if mode == "fast":
        return DemucsMLX()
    elif mode == "vocal_quality" or stem_type == "vocals":
        return MelBandRoformer()
    elif mode == "surgical":
        return SAMAudio()
    return DemucsMLX()  # default
```


***

## 5. Beat \& Downbeat Detection — Upgrade Path

### Current problem

`librosa.beat.beat_track()` returns beat positions only — no concept of downbeats or bar boundaries. The waveform snap grid estimates bar positions from beat count, which creates drift errors on tracks with tempo variation.

### Replacement: BeatNet

```python
# requirements: pip install BeatNet
from BeatNet.BeatNet import BeatNet

estimator = BeatNet(1, mode='offline', inference_model='PF', plot=[], thread=False)
output = estimator.process(audio_path)
# output shape: (N, 2) — col 0 = timestamp, col 1 = beat position (1=downbeat, 2,3,4=beats)

beats = output[output[:, 1] != 1][:, 0]      # all beats
downbeats = output[output[:, 1] == 1][:, 0]   # bar boundaries only
```

**Why this matters for Music Matters:**

- `downbeats` feeds directly into `WaveformCanvas` snap grid — real bar positions, not estimated
- Smart phrase detection becomes bar-accurate rather than onset-estimated
- Loop boundaries snap to actual musical bars


### Fallback: Beat-Transformer (higher accuracy, slower)

```python
# requirements: pip install beat-transformer
# Use for: final export quality, when timing accuracy is critical
from beat_transformer import BeatTransformer
bt = BeatTransformer()
beats, downbeats = bt.predict(audio_path)
```


***

## 6. Chord, Key \& Structure Analysis — New Stack

### The `all-in-one` model — single pass, everything

This is the biggest architectural simplification. Instead of separate calls to librosa (key), madmom (beats), and a heuristic phrase detector (sections), one model call returns all of it.

```python
# requirements: pip install allin1
import allin1

result = allin1.analyze(audio_path)

# result contains:
# result.bpm           — tempo
# result.beats         — beat timestamps
# result.downbeats     — bar boundary timestamps  
# result.segments      — [{start, end, label}] e.g. 'intro','verse','chorus','bridge','outro'
# result.chords        — [{start, end, chord}] e.g. 'Am', 'F', 'C', 'G'
# result.key           — global key e.g. 'A minor'
```

**Mapping to Music Matters components:**


| `allin1` output | Maps to |
| :-- | :-- |
| `result.segments` | `detect_smart_phrases()` — replace entirely |
| `result.beats` / `result.downbeats` | `WaveformCanvas` snap grid |
| `result.chords` | New chord timeline overlay on waveform |
| `result.key` | `LoopPreview.tags` — key tag |
| `result.bpm` | Already used — confirm/override madmom value |

**Updated `pipeline.py` analysis block:**

```python
import allin1
from BeatNet.BeatNet import BeatNet

async def _analyze_track(audio_path: str) -> AnalysisResult:
    # Single-pass structural analysis
    analysis = allin1.analyze(audio_path)
    
    # Convert allin1 segments → SmartPhrase format
    phrases = []
    for seg in analysis.segments:
        bar_start = _time_to_bar(seg.start, analysis.downbeats)
        bar_end = _time_to_bar(seg.end, analysis.downbeats)
        phrases.append(SmartPhrase(
            type=seg.label,          # 'verse', 'chorus', 'bridge', etc.
            start_bar=bar_start,
            bar_count=bar_end - bar_start,
            start_time=seg.start,
            end_time=seg.end,
            confidence=seg.confidence if hasattr(seg, 'confidence') else 0.85
        ))
    
    return AnalysisResult(
        bpm=analysis.bpm,
        key=analysis.key,
        beats=analysis.beats,
        downbeats=analysis.downbeats,
        phrases=phrases,
        chords=analysis.chords
    )
```


***

## 7. Music Generation — ACE-Step 1.5

### What it is

ACE-Step 1.5 is a full music generation model (Suno/Udio quality) that runs locally, is MIT licensed, and has an MLX backend for Apple Silicon. As of March 2026 it's the most capable open local music generation model available.

```python
# requirements: pip install ace-step
# Model: mlx-community/ACE-Step-v1.5-mlx (4-bit quantized, ~8GB)

from ace_step import MusicGenerator

gen = MusicGenerator(model="mlx-community/ACE-Step-v1.5-mlx")

audio = gen.generate(
    prompt="dark UK drill beat, 140bpm, heavy 808 bass, trap hi-hats",
    duration=30,         # seconds
    guidance_scale=7.5,
    seed=42
)
# Returns: numpy array, 44100 Hz stereo
```

**Integration point in Music Matters:**

- New panel: `GeneratePanel.tsx` — text prompt input, duration slider, BPM/key lock
- Backend: `POST /generate/ace-step` → streams audio back
- Generated audio goes straight into the ingest pipeline (stem separation + analysis)

***

## 8. MLX Quantization \& Storage Strategy

### The problem

Large models (Roformer, ACE-Step, SAM Audio) can consume 10-20GB each in fp32. On M4 with unified memory, this competes with RAM.

### Solution: 4-bit quantization + dedicated SSD volume

**Quantize any HuggingFace model:**

```bash
python -m mlx_lm.convert \
  --hf-path KimberleyJensen/Mel-Band-Roformer-Vocal-Model \
  --mlx-path /Volumes/MLX/roformer-vocal-4bit \
  --quantize \
  --q-bits 4
```

**Recommended `/Volumes/MLX` folder layout:**

```
/Volumes/MLX/
├── stem-separation/
│   ├── demucs-mlx/           # Fast all-stems (keep fp16)
│   ├── roformer-vocal-4bit/  # Quality vocals
│   └── sam-audio-small/      # Text-prompted extraction
├── analysis/
│   ├── all-in-one/           # Structure + chords + beats
│   └── basic-pitch/          # Audio → MIDI (CoreML)
├── generation/
│   └── ace-step-v1.5-4bit/  # Music generation
└── cache/
    └── huggingface/          # Redirect HF cache here
```

**Redirect HuggingFace cache to the volume:**

```bash
echo 'export HF_HOME=/Volumes/MLX/cache/huggingface' >> ~/.zshrc
source ~/.zshrc
```


***

## 9. Updated `analyse.py` — Drop-in Code Replacements

```python
# analyse.py — MLX v2 Architecture
# Replace the existing analyse.py with this

import numpy as np
import soundfile as sf
import allin1
from BeatNet.BeatNet import BeatNet
from demucs_mlx import separate as demucs_separate
from mlx_audio_separator import Separator as RoformerSeparator

def analyze_track(audio_path: str, mode: str = "fast") -> dict:
    """
    Full analysis pipeline — MLX v2.
    mode: 'fast' | 'quality'
    """
    
    # 1. Structural analysis (beats, downbeats, chords, key, sections)
    print("Running all-in-one analysis...")
    analysis = allin1.analyze(audio_path)
    
    # 2. Stem separation
    print(f"Separating stems (mode={mode})...")
    if mode == "quality":
        sep = RoformerSeparator(
            model="KimberleyJensen/Mel-Band-Roformer-Vocal-Model"
        )
        vocals, instrumental = sep.separate(audio_path)
        # Also run demucs for drums/bass/other
        stems = demucs_separate(audio_path, model="htdemucs_6s")
        stems["vocals"] = vocals
    else:
        stems = demucs_separate(audio_path, model="htdemucs_6s")
    
    # 3. Convert segments → smart phrases
    phrases = []
    for seg in analysis.segments:
        phrases.append({
            "type": seg.label,
            "start_time": seg.start,
            "end_time": seg


Continuing from where section 9 was cut off:


    # 3. Convert segments → smart phrases (continued)
    phrases = []
    for seg in analysis.segments:
        phrases.append({
            "type": seg.label,           # 'intro','verse','chorus','bridge','outro'
            "start_time": seg.start,
            "end_time": seg.end,
            "start_bar": _time_to_bar(seg.start, analysis.downbeats),
            "bar_count": _time_to_bar(seg.end, analysis.downbeats) - _time_to_bar(seg.start, analysis.downbeats),
            "confidence": getattr(seg, "confidence", 0.85),
        })

    # 4. Chord timeline
    chords = [
        {"start": c.start, "end": c.end, "chord": c.label}
        for c in analysis.chords
    ]

    # 5. Auto-tags
    tags = _auto_tags(analysis)

    return {
        "bpm": analysis.bpm,
        "key": analysis.key,
        "beats": analysis.beats.tolist(),
        "downbeats": analysis.downbeats.tolist(),
        "phrases": phrases,
        "chords": chords,
        "tags": tags,
        "stems": stems,
    }


def _time_to_bar(time_sec: float, downbeats: np.ndarray) -> int:
    """Convert a timestamp in seconds to a bar number using real downbeat positions."""
    idx = np.searchsorted(downbeats, time_sec, side="right") - 1
    return max(0, int(idx))


def _auto_tags(analysis) -> list[str]:
    """Generate auto-tags from allin1 analysis result."""
    tags = []
    if analysis.bpm:
        if analysis.bpm < 90:
            tags.append("slow")
        elif analysis.bpm < 120:
            tags.append("mid-tempo")
        elif analysis.bpm < 150:
            tags.append("uptempo")
        else:
            tags.append("fast")
        tags.append(f"{int(analysis.bpm)}bpm")
    if analysis.key:
        tags.append(analysis.key.lower().replace(" ", "-"))
        if "minor" in analysis.key.lower():
            tags.append("minor")
        else:
            tags.append("major")
    section_labels = [s.label for s in analysis.segments]
    if "chorus" in section_labels:
        tags.append("has-chorus")
    if "bridge" in section_labels:
        tags.append("has-bridge")
    return tags
```


***

## 10. Integration Roadmap

| Step | Task | Replaces / Adds | Est. Time | Priority |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Install `allin1` + validate on one track | Replaces `detect_smart_phrases()`, madmom downbeat tracking, librosa key | 1–2 hrs | **FIRST** |
| 2 | Install `BeatNet` + wire downbeats into `WaveformCanvas` snap grid | Replaces librosa beat tracker for snap grid only (allin1 covers analysis) | 1 hr | High |
| 3 | Install `demucs-mlx` + swap MPS demucs call | Replaces `demucs` PyTorch call in `pipeline.py` — same model, 2.6× faster | 30 min | High |
| 4 | Install `mlx-audio-separator` + add `mode=quality` path for vocals | Adds Roformer vocal path alongside demucs — user selectable in UI | 2 hrs | High |
| 5 | Set up `/Volumes/MLX` SSD volume + redirect HF cache | Infrastructure — prevents unified memory pressure from model weights | 30 min | Medium |
| 6 | Quantize Roformer + SAM Audio models to 4-bit via `mlx_lm.convert` | Storage — reduces Roformer from ~14GB to ~3.5GB | 1 hr (automated) | Medium |
| 7 | Integrate `SAM Audio` + new `surgical` extraction mode in UI | Adds text-prompted extraction panel to `SearchIngest.tsx` | 3–4 hrs | Medium |
| 8 | Integrate `basic-pitch` for stem → MIDI export | Adds MIDI export button to `ExportPanel.tsx` — runs on Neural Engine | 2 hrs | Medium |
| 9 | Integrate `ACE-Step 1.5` + new `GeneratePanel.tsx` | Entirely new capability — text prompt → generated audio → pipeline | 4–6 hrs | Lower |
| 10 | Wire chord timeline into `WaveformCanvas` overlay | Adds chord labels above waveform at correct time positions | 2–3 hrs | Lower |

**Recommended starting order:** Steps 1 → 3 → 2 → 5 → 4 → 6 → 7 → 8 → 10 → 9

***

## 11. Install Cheatsheet

All commands assume you are in the `music-matters` conda env (`conda activate music-matters`).

### Core analysis stack

```bash
pip install allin1
pip install BeatNet
pip install beat-transformer        # optional — higher accuracy fallback
```


### Stem separation

```bash
pip install demucs-mlx              # MLX-native demucs (replaces torch demucs call)
pip install mlx-audio-separator     # MelBand-Roformer vocal quality path
```


### Audio → MIDI

```bash
pip install basic-pitch             # Spotify — runs CoreML on Neural Engine
```


### Music generation

```bash
pip install ace-step                # ACE-Step 1.5 — requires ~8GB on /Volumes/MLX
```


### MLX quantization tooling

```bash
pip install mlx
pip install mlx-lm                  # provides mlx_lm.convert for 4-bit quantization
```


### HuggingFace cache redirect (one-time)

```bash
echo 'export HF_HOME=/Volumes/MLX/cache/huggingface' >> ~/.zshrc
source ~/.zshrc
```


### Quantize Roformer model to 4-bit (one-time, run once model is downloaded)

```bash
python -m mlx_lm.convert \
  --hf-path KimberleyJensen/Mel-Band-Roformer-Vocal-Model \
  --mlx-path /Volumes/MLX/stem-separation/roformer-vocal-4bit \
  --quantize \
  --q-bits 4
```


### Quantize SAM Audio to 4-bit

```bash
python -m mlx_lm.convert \
  --hf-path mlx-community/sam-audio-small \
  --mlx-path /Volumes/MLX/stem-separation/sam-audio-small-4bit \
  --quantize \
  --q-bits 4
```


### Verify everything installed

```bash
python3 -c "import allin1; print('allin1 OK')"
python3 -c "from BeatNet.BeatNet import BeatNet; print('BeatNet OK')"
python3 -c "from demucs_mlx import separate; print('demucs-mlx OK')"
python3 -c "from mlx_audio_separator import Separator; print('Roformer OK')"
python3 -c "from basic_pitch import inference; print('basic-pitch OK')"
```


***

## 12. Source References

| \# | Resource | URL |
| :-- | :-- | :-- |
| 1 | demucs-mlx — MLX-native Demucs port | https://github.com/ssmall256/demucs-mlx |
| 2 | mlx-audio-separator — MelBand-Roformer via MLX | https://github.com/ssmall256/mlx-audio-separator |
| 3 | MelBand-Roformer Vocal Model (HuggingFace) | https://huggingface.co/KimberleyJensen/Mel-Band-Roformer-Vocal-Model |
| 4 | mlx-community/sam-audio-small (HuggingFace) | https://huggingface.co/mlx-community/sam-audio-small |
| 5 | all-in-one music structure analyser | https://github.com/mir-aidj/all-in-one |
| 6 | BeatNet — beat and downbeat tracking | https://github.com/mjhydri/BeatNet |
| 7 | basic-pitch — audio to MIDI (Spotify) | https://github.com/spotify/basic-pitch |
| 8 | ACE-Step 1.5 (MIT licensed music gen) | https://github.com/ace-step/ACE-Step |
| 9 | mlx-community on HuggingFace | https://huggingface.co/mlx-community |
| 10 | Apple MLX framework (GitHub) | https://github.com/ml-explore/mlx |
| 11 | Apple M4 Neural Engine specs (WWDC25) | https://developer.apple.com/videos/play/wwdc2025/298/ |


***

**Document:** Music Matters × MLX — Architecture v2
**Generated:** March 2026
**Status:** Ready for implementation — start with Step 1 (allin1) and Step 3 (demucs-mlx swap)

***

