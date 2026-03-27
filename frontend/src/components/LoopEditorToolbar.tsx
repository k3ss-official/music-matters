/**
 * LoopEditorToolbar — IN/OUT fine-edit controls
 *
 * Sits at the bottom of the workspace.
 * BARS and QUANTIZE have moved to the TransportBar (top).
 *
 * Features:
 *  - IN point display (editable) + nudge ‹ ›
 *  - Loop length (seconds + bars/beats)
 *  - OUT point display (editable) + nudge ‹ ›
 *  - BOUNCE (copy region as raw clip)
 *  - SAVE LOOP
 */
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import type { WaveformHandle } from './WaveformCanvas';

export interface LoopEditorToolbarProps {
    waveformRef: React.RefObject<WaveformHandle>;
    regionStart: number;
    regionEnd: number;
    duration: number;
    bpm?: number | null;
    onRegionChange: (start: number, end: number) => void;
    onSaveLoop?: (start: number, end: number) => void;
    editLoopOpen?: boolean;
}

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m  = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseTime(str: string): number {
    const match = str.match(/^(\d+):(\d{2})\.(\d{1,3})$/);
    if (!match) return NaN;
    const [, m, s, ms] = match;
    return parseInt(m) * 60 + parseInt(s) + parseInt(ms.padEnd(3, '0')) / 1000;
}

function fmtBarBeats(seconds: number, bpm: number | null | undefined): string {
    if (!bpm || bpm <= 0) return `${seconds.toFixed(2)}s`;
    const beatDur   = 60 / bpm;
    const totalBeats = seconds / beatDur;
    const bars  = Math.floor(totalBeats / 4);
    const beats = Math.round(totalBeats % 4);
    if (bars === 0) return `${beats} beat${beats !== 1 ? 's' : ''}`;
    if (beats === 0) return `${bars} bar${bars !== 1 ? 's' : ''}`;
    return `${bars}b ${beats}bt`;
}

export const LoopEditorToolbar: React.FC<LoopEditorToolbarProps> = ({
    waveformRef,
    regionStart,
    regionEnd,
    duration,
    bpm,
    onRegionChange,
    onSaveLoop,
    editLoopOpen,
}) => {
    const [editingStart, setEditingStart] = useState(false);
    const [editingEnd,   setEditingEnd]   = useState(false);
    const [startInput,   setStartInput]   = useState('');
    const [endInput,     setEndInput]     = useState('');

    const beatDur  = bpm ? 60 / bpm : null;
    const loopLength = regionEnd - regionStart;
    const nudgeStep  = beatDur ?? 0.25;

    const applyRegion = useCallback((s: number, e: number) => {
        const cs = Math.max(0, Math.min(s, duration));
        const ce = Math.max(cs + 0.1, Math.min(e, duration));
        onRegionChange(cs, ce);
        waveformRef.current?.syncRegion(cs, ce);
    }, [duration, onRegionChange, waveformRef]);

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

    return (
        <div
            className={`
                w-full px-4 py-2 flex items-center gap-4 flex-wrap select-none
                border-t transition-colors
                ${editLoopOpen
                    ? 'bg-[#0d0d1a] border-[#00d4ff]/20'
                    : 'bg-[#10101e] border-white/5'}
            `}
        >
            {/* ── IN ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest w-5">IN</span>
                <button
                    onClick={() => applyRegion(regionStart - nudgeStep, regionEnd)}
                    title="Nudge IN back 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
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
                        className="font-mono text-[12px] text-[#00d4ff] tabular-nums bg-[#0d0d1a]
                                   px-2 py-0.5 rounded border border-white/10 hover:border-[#00d4ff]/40
                                   transition-colors w-[88px] text-center"
                    >
                        {fmtTime(regionStart)}
                    </button>
                )}
                <button
                    onClick={() => applyRegion(Math.min(regionStart + nudgeStep, regionEnd - 0.1), regionEnd)}
                    title="Nudge IN forward 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
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

            {/* ── OUT ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => applyRegion(regionStart, Math.max(regionEnd - nudgeStep, regionStart + 0.1))}
                    title="Nudge OUT back 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
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
                        className="font-mono text-[12px] text-[#00ff88] tabular-nums bg-[#0d0d1a]
                                   px-2 py-0.5 rounded border border-white/10 hover:border-[#00ff88]/40
                                   transition-colors w-[88px] text-center"
                    >
                        {fmtTime(regionEnd)}
                    </button>
                )}
                <button
                    onClick={() => applyRegion(regionStart, regionEnd + nudgeStep)}
                    title="Nudge OUT forward 1 beat"
                    className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    <ChevronRight size={12} />
                </button>
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest w-6">OUT</span>
            </div>

            <div className="flex-1" />

            {/* ── Save loop ────────────────────────────────────────────────── */}
            <button
                onClick={() => onSaveLoop?.(regionStart, regionEnd)}
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
