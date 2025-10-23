# Demucs Operations

## Model Overview
- Default model: `htdemucs_ft` (fine-tuned 6-stem)
- Device: `mps` (Apple Silicon GPU). Fallback to `cpu` when GPU unavailable.
- Sample rate: 48 kHz; chunk size tuned to avoid VRAM spikes on M4.

## CLI Usage
```bash
python scripts/run_demucs.py \
  --input "/Volumes/hotblack-2tb/mm-files/library/originals/example.wav" \
  --output "/Volumes/hotblack-2tb/mm-files/stems/separated" \
  --model htdemucs_ft \
  --device mps
```

## Service Behaviour
- `DemucsService` validates input audio, ensures output directories exist, and wraps the official `demucs` command.
- Separation metadata (stem paths, duration, config) is returned to the caller so downstream orchestration can log the job.
- Re-running on the same slug is idempotent: existing stems are reused unless `--force` is passed.

## Performance Notes
- Apple M4 + `mps` backend averages ~1.3x realtime on 6-stem runs (depends on track length).
- For batch jobs, stagger start times to avoid saturating unified memory.
- Use `--float32` when targeting compatibility-critical exports; default is FP16 for speed.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `RuntimeError: MPS backend out of memory` | Concurrent runs oversubscribed GPU | Reduce `--jobs` concurrency or move job to CPU |
| `FileNotFoundError: demucs` | Package not installed | `pip install demucs` (included in `pyproject` dependencies) |
| Auditory artifacts / ringing | Input loudness not normalised | Re-run Stage 1 normalisation before separation |

## Future Enhancements
- Hook Demucs into a Celery or Dramatiq worker pool for queue-based processing.
- Experiment with Hybrid Transformer Demucs (HTDemucs) vs. `demucs_quantized` for faster preview renders.
- Cache stem hashes for dedupe; share across remixes referencing identical sources.
