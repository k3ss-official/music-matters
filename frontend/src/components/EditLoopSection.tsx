/**
 * EditLoopSection — granular jog-edit panel
 *
 * Three rows:
 *  1. IN nudge  — ◄bar ◄beat ◄10ms | time | 10ms► beat► bar►
 *  2. Shift loop — ◄bar ◄beat | length · bars | beat► bar►
 *  3. OUT nudge  — ◄bar ◄beat ◄10ms | time | 10ms► beat► bar►
 *
 * All changes propagate via onRegionChange → WaveSurfer sync.
 */
import React, { useCallback } from 'react';
import { X, Grid3x3 } from 'lucide-react';

interface EditLoopSectionProps {
    regionStart: number;
    regionEnd: number;
    bpm: number | null;
    barCount?: number;
    quantizeEnabled: boolean;
    onQuantizeToggle: () => void;
    onClose: () => void;
    onRegionChange?: (start: number, end: number) => void;
    duration?: number;
}

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms  = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtLength(seconds: number, bpm: number | null): string {
    if (!bpm || bpm <= 0) return `${seconds.toFixed(2)}s`;
    const beatDur    = 60 / bpm;
    const totalBeats = seconds / beatDur;
    const bars  = Math.floor(totalBeats / 4);
    const beats = Math.round(totalBeats % 4);
    if (bars === 0) return `${beats} beat${beats !== 1 ? 's' : ''}`;
    if (beats === 0) return `${bars} bar${bars !== 1 ? 's' : ''}`;
    return `${bars}b ${beats}bt`;
}

/** A single jog button */
function JogBtn({
    label,
    title,
    onClick,
    dim = false,
}: {
    label: string;
    title: string;
    onClick: () => void;
    dim?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`
                px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wide transition-all
                border border-white/10 hover:border-white/25
                ${dim
                    ? 'bg-white/3 text-white/25 hover:bg-white/8 hover:text-white/60'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}
            `}
        >
            {label}
        </button>
    );
}

export const EditLoopSection: React.FC<EditLoopSectionProps> = ({
    regionStart,
    regionEnd,
    bpm,
    barCount,
    quantizeEnabled,
    onQuantizeToggle,
    onClose,
    onRegionChange,
    duration = 0,
}) => {
    const loopLen = regionEnd - regionStart;
    const beatDur = bpm ? 60 / bpm : 0.25;
    const barDur  = beatDur * 4;
    const msStep  = 0.010; // 10 ms

    // Clamp helper
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    // ── IN nudge ─────────────────────────────────────────────────────────────
    const nudgeIn = useCallback((delta: number) => {
        const newStart = clamp(regionStart + delta, 0, regionEnd - 0.05);
        onRegionChange?.(newStart, regionEnd);
    }, [regionStart, regionEnd, onRegionChange]);

    // ── OUT nudge ────────────────────────────────────────────────────────────
    const nudgeOut = useCallback((delta: number) => {
        const maxOut = duration > 0 ? duration : regionEnd + 60;
        const newEnd = clamp(regionEnd + delta, regionStart + 0.05, maxOut);
        onRegionChange?.(regionStart, newEnd);
    }, [regionStart, regionEnd, duration, onRegionChange]);

    // ── Shift loop (preserves length) ────────────────────────────────────────
    const shiftLoop = useCallback((delta: number) => {
        const maxOut = duration > 0 ? duration : regionEnd + 60;
        let newStart = regionStart + delta;
        let newEnd   = regionEnd   + delta;
        // Clamp
        if (newStart < 0)        { newStart = 0;              newEnd = loopLen; }
        if (newEnd   > maxOut)   { newEnd   = maxOut;         newStart = maxOut - loopLen; }
        onRegionChange?.(Math.max(0, newStart), Math.min(maxOut, newEnd));
    }, [regionStart, regionEnd, loopLen, duration, onRegionChange]);

    const canChange = !!onRegionChange;

    return (
        <div className="border-t border-white/10 bg-[#0d0d18] flex flex-col shrink-0" style={{ height: 196 }}>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-[#8b5cf6] uppercase tracking-widest font-bold">
                        Edit Loop
                    </span>
                    {barCount != null && barCount > 0 && (
                        <span className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                            {barCount} bar{barCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <span className="text-[10px] font-mono text-white/25 tabular-nums">
                        {fmtTime(regionStart)} → {fmtTime(regionEnd)}
                        {loopLen > 0 && ` · ${loopLen.toFixed(2)}s`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Quantize toggle */}
                    <button
                        onClick={onQuantizeToggle}
                        title={quantizeEnabled ? 'Snap ON — click to disable' : 'Snap OFF — click to enable'}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-all
                            ${quantizeEnabled
                                ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/40'
                                : 'bg-white/5 text-white/30 border border-white/10'}`}
                    >
                        <Grid3x3 size={10} />
                        SNAP {quantizeEnabled ? 'ON' : 'OFF'}
                    </button>
                    {/* Close */}
                    <button
                        onClick={onClose}
                        title="Close Edit Loop"
                        className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* ── Jog controls ───────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col justify-evenly px-5 py-1 gap-1">

                {/* ── IN row ─────────────────────────────────── */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#00d4ff] w-8 shrink-0 tracking-widest">IN</span>
                    <div className="flex items-center gap-1">
                        <JogBtn label="◄bar"  title={`Nudge IN back 1 bar (${barDur.toFixed(2)}s)`}   onClick={() => nudgeIn(-barDur)}  dim />
                        <JogBtn label="◄beat" title={`Nudge IN back 1 beat (${beatDur.toFixed(3)}s)`} onClick={() => nudgeIn(-beatDur)} />
                        <JogBtn label="◄10ms" title="Nudge IN back 10 ms"                             onClick={() => nudgeIn(-msStep)}  />
                    </div>
                    <span className={`font-mono text-[12px] tabular-nums px-2 py-0.5 rounded border min-w-[88px] text-center
                        ${canChange ? 'text-[#00d4ff] border-[#00d4ff]/25 bg-[#00d4ff]/5' : 'text-white/25 border-white/10 bg-white/3'}`}>
                        {fmtTime(regionStart)}
                    </span>
                    <div className="flex items-center gap-1">
                        <JogBtn label="10ms►" title="Nudge IN forward 10 ms"                              onClick={() => nudgeIn(+msStep)}  />
                        <JogBtn label="beat►" title={`Nudge IN forward 1 beat (${beatDur.toFixed(3)}s)`}  onClick={() => nudgeIn(+beatDur)} />
                        <JogBtn label="bar►"  title={`Nudge IN forward 1 bar (${barDur.toFixed(2)}s)`}    onClick={() => nudgeIn(+barDur)}  dim />
                    </div>
                    {!canChange && (
                        <span className="text-[9px] font-mono text-white/20 ml-1">no BPM</span>
                    )}
                </div>

                {/* ── Shift loop row ─────────────────────────── */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/30 w-8 shrink-0 tracking-widest uppercase">Shift</span>
                    <div className="flex items-center gap-1">
                        <JogBtn label="◄◄bar"  title={`Shift loop back 1 bar`}   onClick={() => shiftLoop(-barDur)}  dim />
                        <JogBtn label="◄beat"  title={`Shift loop back 1 beat`}  onClick={() => shiftLoop(-beatDur)} />
                    </div>
                    <div className="flex flex-col items-center min-w-[88px]">
                        <span className="font-mono text-[12px] text-white/60 tabular-nums">
                            {loopLen.toFixed(2)}s
                        </span>
                        <span className="font-mono text-[9px] text-[#8b5cf6]/60 tracking-wide">
                            {fmtLength(loopLen, bpm)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <JogBtn label="beat►"  title={`Shift loop forward 1 beat`}  onClick={() => shiftLoop(+beatDur)} />
                        <JogBtn label="bar►►"  title={`Shift loop forward 1 bar`}   onClick={() => shiftLoop(+barDur)}  dim />
                    </div>
                </div>

                {/* ── OUT row ────────────────────────────────── */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#00ff88] w-8 shrink-0 tracking-widest">OUT</span>
                    <div className="flex items-center gap-1">
                        <JogBtn label="◄bar"  title={`Nudge OUT back 1 bar (${barDur.toFixed(2)}s)`}   onClick={() => nudgeOut(-barDur)}  dim />
                        <JogBtn label="◄beat" title={`Nudge OUT back 1 beat (${beatDur.toFixed(3)}s)`} onClick={() => nudgeOut(-beatDur)} />
                        <JogBtn label="◄10ms" title="Nudge OUT back 10 ms"                             onClick={() => nudgeOut(-msStep)}  />
                    </div>
                    <span className={`font-mono text-[12px] tabular-nums px-2 py-0.5 rounded border min-w-[88px] text-center
                        ${canChange ? 'text-[#00ff88] border-[#00ff88]/25 bg-[#00ff88]/5' : 'text-white/25 border-white/10 bg-white/3'}`}>
                        {fmtTime(regionEnd)}
                    </span>
                    <div className="flex items-center gap-1">
                        <JogBtn label="10ms►" title="Nudge OUT forward 10 ms"                              onClick={() => nudgeOut(+msStep)}  />
                        <JogBtn label="beat►" title={`Nudge OUT forward 1 beat (${beatDur.toFixed(3)}s)`}  onClick={() => nudgeOut(+beatDur)} />
                        <JogBtn label="bar►"  title={`Nudge OUT forward 1 bar (${barDur.toFixed(2)}s)`}    onClick={() => nudgeOut(+barDur)}  dim />
                    </div>
                </div>

            </div>
        </div>
    );
};

export default EditLoopSection;
