/**
 * StemLanes — live stem mixer panel
 *
 * Per-row layout:
 *   [ export ✓ ] [ colour strip ] [ name ] [ VU bars ] [ ▶ play ] [ M mute ] [ S solo ]
 *
 * - ▶ Play   → solo this stem + start playback (click again to unsolo)
 * - M Mute   → mute/unmute this stem
 * - S Solo   → solo this stem (mutes all others)
 * - Export ✓ → include in loop export (independent of mute/solo)
 *
 * Stems are ordered by DJ-workflow priority:
 *   Drums → Bass → Vocals → Guitar → Piano → Other → Harmonic → Percussive → …
 */
import React, { useState, useEffect } from 'react';
import { Music2, CheckSquare2, Square, Play, Pause } from 'lucide-react';
import type { StemMixerState } from '../hooks/useStemMixer';

interface StemLanesProps {
    trackId?: string;
    availableStems: string[];
    stemMixerStates: StemMixerState[];
    onToggleMute:  (name: string) => void;
    onToggleSolo:  (name: string) => void;
    onPlayStem?:   (name: string) => void;
    mixerLoaded:   boolean;
    selectedStems: string[];
    onToggleStemSelection: (stem: string) => void;
    onRequestSeparation?: () => void;
    loading?:   boolean;
    isPlaying?: boolean;
    /** When EDIT loop is open, show loop scope indicator on each lane */
    editLoopOpen?: boolean;
    regionStart?: number;
    regionEnd?: number;
    trackDuration?: number;
}

// ── Colours & ordering ──────────────────────────────────────────────────────
const STEM_COLORS: Record<string, string> = {
    drums:      '#ff3b5c',
    bass:       '#00d4ff',
    vocals:     '#8b5cf6',
    guitar:     '#fbbf24',
    piano:      '#f59e0b',
    other:      '#00ff88',
    mixdown:    '#9ca3af',
    harmonic:   '#22d3ee',
    percussive: '#f97316',
};

/** DJ-workflow priority order */
const STEM_ORDER = ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other',
                    'mixdown', 'harmonic', 'percussive'];

function stemColor(name: string): string {
    return STEM_COLORS[name.toLowerCase()] ?? '#ffffff';
}

function stemSortKey(name: string): number {
    const idx = STEM_ORDER.indexOf(name.toLowerCase());
    return idx === -1 ? 99 : idx;
}

// ── VU bars animation ───────────────────────────────────────────────────────
function VuBars({ color, active }: { color: string; active: boolean }) {
    const [heights, setHeights] = useState([40, 70, 100, 80, 50, 30]);
    useEffect(() => {
        if (!active) { setHeights([40, 70, 100, 80, 50, 30]); return; }
        const id = setInterval(() => {
            setHeights(() => Array.from({ length: 6 }, () => Math.round(20 + Math.random() * 80)));
        }, 120);
        return () => clearInterval(id);
    }, [active]);
    return (
        <div className="flex items-end gap-px" style={{ height: 16, width: 28 }}>
            {heights.map((h, i) => (
                <div key={i} className="rounded-sm transition-all"
                    style={{
                        width: 3, height: `${h}%`,
                        backgroundColor: active ? color : 'rgba(255,255,255,0.08)',
                        transitionDuration: active ? '100ms' : '300ms',
                    }}
                />
            ))}
        </div>
    );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ loading, onRequestSeparation }: {
    loading?: boolean; onRequestSeparation?: () => void;
}) {
    return (
        <div className="bg-[#12121a] p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Stems</h3>
                {!loading && (
                    <button
                        onClick={onRequestSeparation}
                        className="px-3 py-1 bg-[#8b5cf6]/20 text-[#8b5cf6] hover:bg-[#8b5cf6]/30
                                   rounded text-[10px] font-bold tracking-wider transition-colors
                                   border border-[#8b5cf6]/30"
                    >
                        RUN SEPARATION
                    </button>
                )}
            </div>
            {loading
                ? <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-9 bg-white/5 rounded animate-pulse" />)}</div>
                : <p className="text-center py-4 text-[11px] text-white/20 font-mono border border-dashed border-white/5 rounded">No stems — run separation first</p>
            }
        </div>
    );
}

// ── Main ────────────────────────────────────────────────────────────────────
export function StemLanes({
    availableStems, stemMixerStates, onToggleMute, onToggleSolo, onPlayStem,
    mixerLoaded, selectedStems, onToggleStemSelection,
    onRequestSeparation, loading, isPlaying = false,
    editLoopOpen = false, regionStart = 0, regionEnd = 0, trackDuration = 0,
}: StemLanesProps) {
    const showScope = editLoopOpen && trackDuration > 0 && regionEnd > regionStart;

    if (loading || availableStems.length === 0) {
        return <EmptyState loading={loading} onRequestSeparation={onRequestSeparation} />;
    }

    // Sort stems by DJ-workflow priority
    const sortedStems = [...availableStems].sort((a, b) => {
        const aBase = a.replace(/\.(wav|mp3|flac)$/i, '');
        const bBase = b.replace(/\.(wav|mp3|flac)$/i, '');
        return stemSortKey(aBase) - stemSortKey(bBase);
    });

    const allExportSelected  = sortedStems.every(s => selectedStems.includes(s));
    const noneExportSelected = sortedStems.every(s => !selectedStems.includes(s));
    const hasSolo = stemMixerStates.some(s => s.soloed);

    return (
        <div className="bg-[#12121a] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Music2 size={11} className="text-[#8b5cf6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Stems</span>
                    {!mixerLoaded && availableStems.length > 0 && (
                        <span className="text-[9px] font-mono text-[#f59e0b]/60 animate-pulse">loading…</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Export:</span>
                    <button
                        onClick={() => sortedStems.forEach(s => { if (!selectedStems.includes(s)) onToggleStemSelection(s); })}
                        disabled={allExportSelected}
                        className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded
                                   bg-white/5 hover:bg-[#00ff88]/15 text-white/30 hover:text-[#00ff88]
                                   border border-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >ALL</button>
                    <button
                        onClick={() => sortedStems.forEach(s => { if (selectedStems.includes(s)) onToggleStemSelection(s); })}
                        disabled={noneExportSelected}
                        className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded
                                   bg-white/5 hover:bg-[#ff3b5c]/15 text-white/30 hover:text-[#ff3b5c]
                                   border border-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    >NONE</button>
                </div>
            </div>

            {/* Stem rows */}
            <div className="divide-y divide-white/[0.04]">
                {sortedStems.map(stem => {
                    const baseName   = stem.replace(/\.(wav|mp3|flac)$/i, '');
                    const color      = stemColor(baseName);
                    const ms         = stemMixerStates.find(s => s.name === baseName);
                    const isMuted    = ms?.muted  ?? false;
                    const isSoloed   = ms?.soloed ?? false;
                    const isSelected = selectedStems.includes(stem);
                    const vuActive   = isPlaying && !isMuted && (!hasSolo || isSoloed);
                    const dimRow     = hasSolo ? !isSoloed : isMuted;
                    // A stem is "playing solo" if it's soloed AND currently playing
                    const isStemPlaying = isSoloed && isPlaying;

                    return (
                        <div
                            key={stem}
                            className={`
                                flex flex-col px-3 py-1.5 select-none
                                transition-all
                                ${dimRow ? 'opacity-35' : 'opacity-100'}
                            `}
                        >
                        <div className="flex items-center gap-2.5">
                            {/* Export checkbox */}
                            <div
                                onClick={e => { e.stopPropagation(); onToggleStemSelection(stem); }}
                                className="flex-shrink-0 cursor-pointer text-white/30 hover:text-white/60 transition-colors"
                                title="Include in export"
                            >
                                {isSelected
                                    ? <CheckSquare2 size={12} style={{ color }} />
                                    : <Square size={12} />}
                            </div>

                            {/* Colour strip */}
                            <div
                                className="flex-shrink-0 rounded-full"
                                style={{
                                    width: 3, height: 26,
                                    backgroundColor: dimRow ? 'rgba(255,255,255,0.1)' : color,
                                    boxShadow: dimRow ? 'none' : `0 0 6px ${color}55`,
                                }}
                            />

                            {/* Stem name */}
                            <span className="flex-1 capitalize text-[12px] font-medium text-white/80 tracking-wide">
                                {baseName}
                            </span>

                            {/* VU bars */}
                            <VuBars color={color} active={vuActive} />

                            {/* ▶ Play solo button */}
                            <button
                                onClick={() => onPlayStem?.(baseName)}
                                title={isStemPlaying ? 'Playing solo — click to unsolo' : `Play ${baseName} solo`}
                                className={`
                                    flex-shrink-0 w-6 h-6 flex items-center justify-center
                                    rounded text-[9px] transition-all focus:outline-none
                                    ${isStemPlaying
                                        ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/50 shadow-[0_0_6px_rgba(0,255,136,0.25)]'
                                        : 'bg-white/5 text-white/30 border border-white/10 hover:text-white/70 hover:bg-white/10'}
                                `}
                            >
                                {isStemPlaying ? <Pause size={8} /> : <Play size={8} className="ml-px" />}
                            </button>

                            {/* M — Mute */}
                            <button
                                onClick={() => onToggleMute(baseName)}
                                title={isMuted ? 'Unmute' : 'Mute'}
                                className={`
                                    flex-shrink-0 w-6 h-6 flex items-center justify-center
                                    rounded text-[9px] font-mono font-bold tracking-widest
                                    transition-all focus:outline-none
                                    ${isMuted
                                        ? 'bg-[#ff3b5c]/25 text-[#ff3b5c] border border-[#ff3b5c]/50'
                                        : 'bg-white/5 text-white/30 border border-white/10 hover:text-white/60 hover:bg-white/10'}
                                `}
                            >
                                M
                            </button>

                            {/* S — Solo */}
                            <button
                                onClick={() => onToggleSolo(baseName)}
                                title={isSoloed ? 'Unsolo' : 'Solo — mutes all others'}
                                className={`
                                    flex-shrink-0 w-6 h-6 flex items-center justify-center
                                    rounded text-[9px] font-mono font-bold tracking-widest
                                    transition-all focus:outline-none
                                    ${isSoloed
                                        ? 'bg-[#f59e0b]/30 text-[#f59e0b] border border-[#f59e0b]/60 shadow-[0_0_6px_rgba(245,158,11,0.35)]'
                                        : 'bg-white/5 text-white/30 border border-white/10 hover:text-[#f59e0b]/70 hover:bg-[#f59e0b]/10'}
                                `}
                            >
                                S
                            </button>
                        </div>{/* end inner flex row */}

                            {/* Loop scope bar — visible when EDIT mode is open */}
                            {showScope && (
                                <div className="relative w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden mt-1">
                                    <div
                                        className="absolute h-full rounded-full"
                                        style={{
                                            left:  `${(regionStart / trackDuration) * 100}%`,
                                            width: `${((regionEnd - regionStart) / trackDuration) * 100}%`,
                                            backgroundColor: color,
                                            opacity: dimRow ? 0.2 : 0.8,
                                            boxShadow: dimRow ? 'none' : `0 0 4px ${color}88`,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default StemLanes;
