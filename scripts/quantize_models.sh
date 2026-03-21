#!/usr/bin/env bash
# quantize_models.sh — One-time 4-bit quantization of MLX models to /Volumes/MLX
#
# Prerequisites:
#   pip install mlx-lm
#   /Volumes/MLX must be mounted (external SSD recommended)
#
# Run from repo root:
#   bash scripts/quantize_models.sh

set -euo pipefail

MLX_ROOT="${MLX_ROOT:-/Volumes/MLX}"

echo "==> Target volume: $MLX_ROOT"
mkdir -p "$MLX_ROOT/stem-separation/roformer-vocal-4bit"
mkdir -p "$MLX_ROOT/generation/ace-step-v1.5-4bit"
mkdir -p "$MLX_ROOT/cache/huggingface"

# ── Roformer vocal model (MelBand, SDR 12.6) ─────────────────────────────────
echo ""
echo "==> Quantizing KimberleyJensen/Mel-Band-Roformer-Vocal-Model → 4-bit"
python -m mlx_lm.convert \
  --hf-path KimberleyJensen/Mel-Band-Roformer-Vocal-Model \
  --mlx-path "$MLX_ROOT/stem-separation/roformer-vocal-4bit" \
  --quantize \
  --q-bits 4

# ── ACE-Step 1.5 music generation ────────────────────────────────────────────
echo ""
echo "==> Quantizing ACE-Step/ACE-Step-v1.5 → 4-bit"
python -m mlx_lm.convert \
  --hf-path ACE-Step/ACE-Step-v1.5 \
  --mlx-path "$MLX_ROOT/generation/ace-step-v1.5-4bit" \
  --quantize \
  --q-bits 4

echo ""
echo "==> Done. Set in .env:"
echo "    HF_HOME=$MLX_ROOT/cache/huggingface"
echo "    TRANSFORMERS_CACHE=$MLX_ROOT/cache/huggingface"
