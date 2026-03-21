"""
natten compatibility shim for allin1 on natten >= 0.20.

natten 0.20+ removed natten1dav / natten1dqkrpb / natten2dav / natten2dqkrpb.
allin1 1.1.0 still imports those names at module load time.

This module implements them in pure PyTorch (correct for inference; no CUDA
required, works on Apple Silicon MPS / CPU).

Import order:  call patch_natten() BEFORE any import of allin1.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gather_1d_neighbors(
    tensor: torch.Tensor, kernel_size: int, dilation: int
) -> torch.Tensor:
    """
    tensor : [B, H, T, D]
    returns: [B, H, T, ks, D]  — neighbourhood values for every position
    """
    B, H, T, D = tensor.shape
    ks = kernel_size
    pad = (ks // 2) * dilation
    # Zero-pad both ends of the time axis
    padded = F.pad(tensor, (0, 0, pad, pad))          # [B, H, T+2*pad, D]
    # Kernel offset j=0 → neighbour at distance -(ks//2)*d  (leftmost)
    # In padded coords: for query at position i, key j is at i + j*dilation
    # (because padding == (ks//2)*dilation shifts the window to be centred)
    slices = [
        padded[:, :, j * dilation : j * dilation + T, :]
        for j in range(ks)
    ]
    return torch.stack(slices, dim=3)                  # [B, H, T, ks, D]


def _gather_2d_neighbors(
    tensor: torch.Tensor, kernel_size: int, dilation: int
) -> torch.Tensor:
    """
    tensor : [B, H, K, W, D]
    returns: [B, H, K, W, ks, ks, D]
    """
    B, H, K, W, D = tensor.shape
    ks = kernel_size
    pad = (ks // 2) * dilation
    padded = F.pad(tensor, (0, 0, pad, pad, pad, pad)) # [B, H, K+2p, W+2p, D]
    rows = []
    for jk in range(ks):
        cols = [
            padded[
                :, :,
                jk * dilation : jk * dilation + K,
                jw * dilation : jw * dilation + W,
                :,
            ]
            for jw in range(ks)
        ]
        rows.append(torch.stack(cols, dim=4))          # [B, H, K, W, ks, D]
    return torch.stack(rows, dim=4)                    # [B, H, K, W, ks, ks, D]


def _rpb_idx(kernel_size: int, device: torch.device) -> torch.Tensor:
    """
    Map kernel position j (0..ks-1) to RPB array index.

    RPB shape: [H, 2*ks-1].  The entry at index ks-1 represents relative
    position 0 (centre).  Kernel position j has relative offset (j - ks//2),
    so its RPB index is  (j - ks//2) + (ks-1) = j + ks//2  (odd ks).
    """
    ks = kernel_size
    return torch.arange(ks, device=device) + (ks // 2)


# ---------------------------------------------------------------------------
# The four functions that allin1/dinat.py needs
# ---------------------------------------------------------------------------

def natten1dqkrpb(
    query: torch.Tensor,
    key: torch.Tensor,
    rpb: torch.Tensor,
    kernel_size: int,
    dilation: int,
) -> torch.Tensor:
    """
    query, key : [B, H, T, D]
    rpb        : [H, 2*ks-1]
    returns    : [B, H, T, ks]  — raw (pre-softmax) attention scores
    """
    key_nbrs = _gather_1d_neighbors(key, kernel_size, dilation)    # [B,H,T,ks,D]
    attn = (query.unsqueeze(3) * key_nbrs).sum(-1)                 # [B,H,T,ks]
    idx = _rpb_idx(kernel_size, rpb.device)
    attn = attn + rpb[:, idx].unsqueeze(0).unsqueeze(2)            # [B,H,T,ks]
    return attn


def natten1dav(
    attn: torch.Tensor,
    value: torch.Tensor,
    kernel_size: int,
    dilation: int,
) -> torch.Tensor:
    """
    attn  : [B, H, T, ks]  (post-softmax attention weights)
    value : [B, H, T, D]
    returns: [B, H, T, D]
    """
    val_nbrs = _gather_1d_neighbors(value, kernel_size, dilation)  # [B,H,T,ks,D]
    return (attn.unsqueeze(-1) * val_nbrs).sum(3)                  # [B,H,T,D]


def natten2dqkrpb(
    query: torch.Tensor,
    key: torch.Tensor,
    rpb: torch.Tensor,
    kernel_size: int,
    dilation: int,
) -> torch.Tensor:
    """
    query, key : [B, H, K, W, D]
    rpb        : [H, 2*ks-1, 2*ks-1]
    returns    : [B, H, K, W, ks, ks]
    """
    key_nbrs = _gather_2d_neighbors(key, kernel_size, dilation)    # [B,H,K,W,ks,ks,D]
    attn = (query.unsqueeze(4).unsqueeze(5) * key_nbrs).sum(-1)    # [B,H,K,W,ks,ks]
    idx = _rpb_idx(kernel_size, rpb.device)
    rpb_vals = rpb[:, idx[:, None], idx[None, :]]                  # [H,ks,ks]
    attn = attn + rpb_vals.unsqueeze(0).unsqueeze(2).unsqueeze(3)
    return attn


def natten2dav(
    attn: torch.Tensor,
    value: torch.Tensor,
    kernel_size: int,
    dilation: int,
) -> torch.Tensor:
    """
    attn  : [B, H, K, W, ks, ks]
    value : [B, H, K, W, D]
    returns: [B, H, K, W, D]
    """
    val_nbrs = _gather_2d_neighbors(value, kernel_size, dilation)  # [B,H,K,W,ks,ks,D]
    return (attn.unsqueeze(-1) * val_nbrs).sum(dim=(4, 5))         # [B,H,K,W,D]


# ---------------------------------------------------------------------------
# Patch entry-point
# ---------------------------------------------------------------------------

def patch_natten() -> None:
    """
    Inject the four legacy function names into natten.functional so that
    allin1 can import them.  Safe to call multiple times (idempotent).
    """
    import importlib
    import sys

    import natten  # ensure the package is loaded  # noqa: F401

    mod = sys.modules.get("natten.functional") or importlib.import_module(
        "natten.functional"
    )

    for name, fn in (
        ("natten1dav",    natten1dav),
        ("natten1dqkrpb", natten1dqkrpb),
        ("natten2dav",    natten2dav),
        ("natten2dqkrpb", natten2dqkrpb),
    ):
        if not hasattr(mod, name):
            setattr(mod, name, fn)
