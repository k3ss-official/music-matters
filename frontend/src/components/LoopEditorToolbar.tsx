/**
 * LoopEditorToolbar — production loop editing controls
 *
 * Features:
 *  - In/Out point display (MM:SS.ms) — editable inline
 *  - Loop length display (bars + beats)
 *  - Nudge start/end by 1 beat back/fwd — pushes to WaveSurfer via syncRegion
 *  - Quantize-to-bar button — snaps start/end to nearest bar
 *  - Bar-length presets: 1/2/4/8/16/32 bars (snaps start to nearest bar, extends end)
 *  - Save Loop button — calls onSaveLoop
 *  - Copy Region (steal) button
 */
import React, { useCallback, useState, useRef } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Save,
    Scissors,
    Grid3x3,
} from 'lucide-react';
import type { WaveformHandle } from './WaveformCanvas';

export interface LoopEditorToolbarProps {
    waveformRef: React.RefObject<WaveformHandle>;
    regionStart: number;
    regionEnd: number;
    duration: number;
    bpm?: number | null;
    onRegionChange: (start: number, end: number) => void;
    onSaveLoop?: (start: number, end: number) => void;
    onStealRegion?: (start: number, end: number) => void;
    activeBarPreset?: number | null;
    onBarPresetToggle?: (bars: number) => void;
    editLoopOpen?: boolean;
    onEditLoopToggle?: () => void;
}

// Format seconds → MM:SS.ms
function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Parse MM:SS.ms string → seconds (returns NaN on failure)
function parseTime(str: string): number {
    const match = str.match(/^(\d+):(\d{2})\.(\d{1,3})$/);
    if (!match) return NaN;
    const [, m, s, ms] = match;
    return parseInt(m) * 60 + parseInt(s) + parseInt(ms.padEnd(3, '0')) / 1000;
}

// Length in bars + beats string, e.g. "4 bars 2 beats"
function fmtBarBeats(seconds: number, bpm: number | null | undefined): string {
    if (!bpm || bpm <= 0) return `${seconds.toFixed(2)}s`;
    const beatDur = 60 / bpm;
    const totalBeats = seconds / beatDur;
    const bars = Math.floor(totalBeats / 4);
    const beats = Math.round(totalBeats % 4);
    if (bars === 0) return `${beats} beat${beats !== 1 ? 's' : ''}`;
    if (beats === 0) return `${bars} bar${bars !== 1 ? 's' : ''}`;
    return `${bars}b ${beats}bt`;
}

// Snap a time to the nearest bar boundary
function snapToBar(time: number, bpm: number): number {
    const beatDur = 60 / bpm;
    const barDur = beatDur * 4;
    return Math.round(time / barDur) * barDur;
}

// Bar preset options
const BAR_PRESETS = [1, 2, 4, 8, 16, 32] as const;

function QuantizeButton({ bpm, onQuantize }: { bpm: number | null | undefined; onQuantize: () => void }) {
    const [flashing, setFlashing] = React.useState(false);
    const handleClick = () => {
        if (!bpm) return;
        onQuantize();
        setFlashing(true);
        setTimeout(() => setFlashing(false), 400);
    };
    return (
        <button
            onClick={handleClick}
            disabled={!bpm}
            title="Snap IN and OUT to nearest bar boundary (one-time action)"
            className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono
                tracking-wider transition-all focus:outline-none
                ${flashing
                    ? 'bg-[#8b5cf6]/40 text-white border border-[#8b5cf6]/60 scale-95'
                    : bpm
                    ? 'bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 text-[#8b5cf6] border border-[#8b5cf6]/30'
                    : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'}
            `}
        >
            <Grid3x3 size={10} />
            SNAP TO BAR
        </button>
    );
}

export const LoopEditorToolbar: React.FC<LoopEditorToolbarProps> = ({
    waveformRef,
    regionStart,
    regionEnd,
    duration,
    bpm,
    onRegionChange,
    onSaveLoop,
    onStealRegion,
    activeBarPreset,
    onBarPresetToggle,
    editLoopOpen,
    onEditLoopToggle,
}) => {
    const [editingStart, setEditingStart] = useState(false);
    const [editingEnd, setEditingEnd] = useState(false);
    const [startInput, setStartInput] = useState('');
    const [endInput, setEndInput] = useState('');

    const beatDur = bpm ? 60 / bpm : null;
    const barDur = beatDur ? beatDur * 4 : null;
    const loopLength = regionEnd - regionStart;

    // Push new region values to both React state and WaveSurfer
    const applyRegion = useCallback((s: number, e: number) => {
        const clampedS = Math.max(0, Math.min(s, duration));
        const clampedE = Math.max(clampedS + 0.1, Math.min(e, duration));
        onRegionChange(clampedS, clampedE);
        waveformRef.current?.syncRegion(clampedS, clampedE);
    }, [duration, onRegionChange, waveformRef]);

    // ── Nudge ─────────────────────────────────────────────────────────────────
    const nudgeStep = beatDur ? beatDur : 0.25; // 1 beat or 0.25s fallback

    const nudgeStartBack = useCallback(() => {
        applyRegion(regionStart - nudgeStep, regionEnd);
    }, [regionStart, regionEnd, nudgeStep, applyRegion]);

    const nudgeStartFwd = useCallback(() => {
        applyRegion(Math.min(regionStart + nudgeStep, regionEnd - 0.1), regionEnd);
    }, [regionStart, regionEnd, nudgeStep, applyRegion]);

    const nudgeEndBack = useCallback(() => {
        applyRegion(regionStart, Math.max(regionEnd - nudgeStep, regionStart + 0.1));
    }, [regionStart, regionEnd, nudgeStep, applyRegion]);

    const nudgeEndFwd = useCallback(() => {
        applyRegion(regionStart, regionEnd + nudgeStep);
    }, [regionStart, regionEnd, nudgeStep, applyRegion]);

    // ── Quantize to bar ───────────────────────────────────────────────────────
    const quantizeToBar = useCallback(() => {
        if (!bpm) return;
        const s = snapToBar(regionStart, bpm);
        const e = snapToBar(regionEnd, bpm);
        applyRegion(s, e > s ? e : s + (barDur || 4));
    }, [regionStart, regionEnd, bpm, barDur, applyRegion]);

    // ── Bar presets ───────────────────────────────────────────────────────────
    const applyBarPreset = useCallback((bars: number) => {
        if (!bpm || !barDur) return;
        const snappedStart = snapToBar(regionStart, bpm);
        const newEnd = snappedStart + barDur * bars;
        applyRegion(snappedStart, newEnd);
    }, [regionStart, bpm, barDur, applyRegion]);

    // ── Inline time editing ───────────────────────────────────────────────────
    const commitStartEdit = useCallback(() => {
        const t = parseTime(startInput);
        if (!isNaN(t)) applyRegion(t, regionEnd);
        setEditingStart(false);
    }, [startInput, regionEnd, applyRegion]);

    const commitEndEdit = useCallback(() => {
        const t = parseTime(endInput);
        if (!isNaN(t)) applyRegion(regionStart, t);
        setEditingEnd(false);
    }, [endInput, regionStart, applyRegion]);

    // ── Save / Steal ──────────────────────────────────────────────────────────
    const handleSave = useCallback(() => {
        onSaveLoop?.(regionStart, regionEnd);
    }, [regionStart, regionEnd, onSaveLoop]);

    const handleSteal = useCallback(() => {
        onStealRegion?.(regionStart, regionEnd);
    }, [regionStart, regionEnd, onStealRegion]);

    return (
        <div className="w-full bg-[#10101e] border-t border-white/5 px-4 py-2 flex items-center gap-4 flex-wrap select-none">

            {/* ── IN point ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest w-5">IN</span>
                <button
                    onClick={nudgeStartBack}
                    title="Nudge IN back 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <ChevronLeft size={12} />
                </button>
                {editingStart ? (
                    <input
                        autoFocus
                        value={startInput}
                        onChange={e => setStartInput(e.target.value)}
                        onBlur={commitStartEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitStartEdit(); if (e.key === 'Escape') setEditingStart(false); }}
                        className="w-[88px] bg-[#1a1a2e] border border-[#00d4ff]/40 rounded px-2 py-0.5
                                   font-mono text-[12px] text-[#00d4ff] focus:outline-none text-center"
                        placeholder="00:00.000"
                    />
                ) : (
                    <button
                        onClick={() => { setStartInput(fmtTime(regionStart)); setEditingStart(true); }}
                        title="Click to edit IN point"
                        className="font-mono text-[12px] text-[#00d4ff] tabular-nums bg-[#0d0d1a]
                                   px-2 py-0.5 rounded border border-white/10 hover:border-[#00d4ff]/40
                                   transition-colors w-[88px] text-center"
                    >
                        {fmtTime(regionStart)}
                    </button>
                )}
                <button
                    onClick={nudgeStartFwd}
                    title="Nudge IN forward 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <ChevronRight size={12} />
                </button>
            </div>

            {/* ── Loop length ──────────────────────────────────────────────── */}
            <div className="flex flex-col items-center justify-center min-w-[60px]">
                <span className="font-mono text-[13px] text-white/70 tabular-nums">
                    {loopLength.toFixed(2)}s
                </span>
                <span className="font-mono text-[10px] text-[#8b5cf6]/70 tracking-wide">
                    {fmtBarBeats(loopLength, bpm)}
                </span>
            </div>

            {/* ── OUT point ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <button
                    onClick={nudgeEndBack}
                    title="Nudge OUT back 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <ChevronLeft size={12} />
                </button>
                {editingEnd ? (
                    <input
                        autoFocus
                        value={endInput}
                        onChange={e => setEndInput(e.target.value)}
                        onBlur={commitEndEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEndEdit(); if (e.key === 'Escape') setEditingEnd(false); }}
                        className="w-[88px] bg-[#1a1a2e] border border-[#00ff88]/40 rounded px-2 py-0.5
                                   font-mono text-[12px] text-[#00ff88] focus:outline-none text-center"
                        placeholder="00:00.000"
                    />
                ) : (
                    <button
                        onClick={() => { setEndInput(fmtTime(regionEnd)); setEditingEnd(true); }}
                        title="Click to edit OUT point"
                        className="font-mono text-[12px] text-[#00ff88] tabular-nums bg-[#0d0d1a]
                                   px-2 py-0.5 rounded border border-white/10 hover:border-[#00ff88]/40
                                   transition-colors w-[88px] text-center"
                    >
                        {fmtTime(regionEnd)}
                    </button>
                )}
                <button
                    onClick={nudgeEndFwd}
                    title="Nudge OUT forward 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <ChevronRight size={12} />
                </button>
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest w-6">OUT</span>
            </div>

            {/* ── Bar presets ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-white/25 uppercase tracking-widest mr-1">BARS</span>
                {BAR_PRESETS.map(bars => {
                    const isActive = activeBarPreset === bars;
                    return (
                        <button
                            key={bars}
                            onClick={() => {
                                if (onBarPresetToggle) {
                                    onBarPresetToggle(bars);
                                } else {
                                    applyBarPreset(bars);
                                }
                            }}
                            disabled={!bpm}
                            title={`Set loop to ${bars} bar${bars !== 1 ? 's' : ''}`}
                            className={`
                                w-7 h-7 flex items-center justify-center rounded
                                font-mono text-[11px] transition-all focus:outline-none
                                ${!bpm
                                    ? 'bg-white/3 text-white/15 border border-white/5 cursor-not-allowed'
                                    : isActive
                                    ? 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/60 shadow-[0_0_8px_rgba(0,212,255,0.3)]'
                                    : 'bg-white/5 hover:bg-[#00d4ff]/15 text-white/50 hover:text-[#00d4ff] border border-white/10 hover:border-[#00d4ff]/30'}
                            `}
                        >
                            {bars}
                        </button>
                    );
                })}
            </div>

            {/* ── Spacer ───────────────────────────────────────────────────── */}
            <div className="flex-1" />

            {/* ── Edit Loop ────────────────────────────────────────────────── */}
            {onEditLoopToggle !== undefined && (
                <button
                    onClick={onEditLoopToggle}
                    disabled={!activeBarPreset}
                    title={activeBarPreset ? 'Open focused loop editor' : 'Select a bar preset first'}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[11px] tracking-wider
                        transition-all focus:outline-none
                        ${activeBarPreset
                            ? editLoopOpen
                                ? 'bg-[#8b5cf6]/30 text-[#8b5cf6] border border-[#8b5cf6]/60 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                                : 'bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 text-[#8b5cf6] border border-[#8b5cf6]/30'
                            : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'}
                    `}
                >
                    EDIT LOOP
                </button>
            )}

            {/* ── Steal (copy region audio) ─────────────────────────────────── */}
            <button
                onClick={handleSteal}
                title="Steal — copy this region"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded
                           bg-[#ff3b5c]/10 hover:bg-[#ff3b5c]/20
                           text-[#ff3b5c] border border-[#ff3b5c]/25
                           font-mono text-[11px] tracking-wider
                           transition-colors focus:outline-none"
            >
                <Scissors size={11} />
                STEAL
            </button>

            {/* ── Save loop ────────────────────────────────────────────────── */}
            <button
                onClick={handleSave}
                title="Save this loop"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded
                           bg-[#00ff88]/10 hover:bg-[#00ff88]/20
                           text-[#00ff88] border border-[#00ff88]/25
                           font-mono text-[11px] tracking-wider
                           transition-colors focus:outline-none"
            >
                <Save size={11} />
                SAVE LOOP
            </button>
        </div>
    );
};

export default LoopEditorToolbar;
