/**
 * StemLanes — stem selection panel
 *
 * Redesigned: stems are toggleable lanes for EXPORT SELECTION.
 * No individual play buttons (playback sync is Phase 1C).
 * VU-style animated bars show when stem is selected.
 * Solo preview plays stem audio from current wavesurfer position.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStemAudioUrl } from '../services/api';
import { CheckSquare2, Square, Music2 } from 'lucide-react';

interface StemLanesProps {
    trackId: string;
    availableStems: string[];
    selectedStems: string[];
    onToggleStemSelection: (stem: string) => void;
    onRequestSeparation?: () => void;
    loading?: boolean;
    /** Current WaveSurfer position (seconds) for solo preview sync */
    currentTime?: number;
    /** Whether main track is playing (drives VU animation) */
    isPlaying?: boolean;
}

const STEM_COLORS: Record<string, string> = {
    drums:      '#ff3b5c',
    bass:       '#00d4ff',
    vocals:     '#8b5cf6',
    other:      '#00ff88',
    piano:      '#f59e0b',
    guitar:     '#fbbf24',
    mixdown:    '#9ca3af',
    harmonic:   '#22d3ee',
    percussive: '#f97316',
};

function stemColor(name: string): string {
    return STEM_COLORS[name.toLowerCase()] ?? '#ffffff';
}

/** Simple animated VU bars — purely visual */
function VuBars({ color, active }: { color: string; active: boolean }) {
    const [heights, setHeights] = useState([40, 70, 100, 80, 50, 30]);

    useEffect(() => {
        if (!active) {
            setHeights([40, 70, 100, 80, 50, 30]);
            return;
        }
        const id = setInterval(() => {
            setHeights(h => h.map(() => Math.round(20 + Math.random() * 80)));
        }, 120);
        return () => clearInterval(id);
    }, [active]);

    return (
        <div className="flex items-end gap-px" style={{ height: 16, width: 28 }}>
            {heights.map((h, i) => (
                <div
                    key={i}
                    className="rounded-sm transition-all"
                    style={{
                        width: 3,
                        height: `${h}%`,
                        backgroundColor: active ? color : 'rgba(255,255,255,0.08)',
                        transitionDuration: active ? '100ms' : '300ms',
                    }}
                />
            ))}
        </div>
    );
}

export function StemLanes({
    trackId,
    availableStems,
    selectedStems,
    onToggleStemSelection,
    onRequestSeparation,
    loading,
    currentTime = 0,
    isPlaying = false,
}: StemLanesProps) {
    const allSelected = availableStems.length > 0 &&
        availableStems.every(s => selectedStems.includes(s));
    const noneSelected = availableStems.every(s => !selectedStems.includes(s));

    const selectAll = () => {
        availableStems.forEach(s => { if (!selectedStems.includes(s)) onToggleStemSelection(s); });
    };
    const deselectAll = () => {
        availableStems.forEach(s => { if (selectedStems.includes(s)) onToggleStemSelection(s); });
    };

    if (loading || availableStems.length === 0) {
        return (
            <div className="bg-[#12121a] rounded-lg p-4 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                        Stems
                    </h3>
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
                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-9 bg-white/5 rounded animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <p className="text-center py-4 text-[11px] text-white/20 font-mono border border-dashed border-white/5 rounded">
                        No stems — run separation first
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="bg-[#12121a] rounded-lg border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Music2 size={12} className="text-[#8b5cf6]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                        Stems
                    </span>
                    <span className="text-[10px] font-mono text-white/25">
                        {selectedStems.length}/{availableStems.length} selected
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={selectAll}
                        disabled={allSelected}
                        title="Select all stems"
                        className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded
                                   bg-white/5 hover:bg-[#00ff88]/15 text-white/30 hover:text-[#00ff88]
                                   border border-white/5 hover:border-[#00ff88]/20
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        ALL
                    </button>
                    <button
                        onClick={deselectAll}
                        disabled={noneSelected}
                        title="Deselect all stems"
                        className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded
                                   bg-white/5 hover:bg-[#ff3b5c]/15 text-white/30 hover:text-[#ff3b5c]
                                   border border-white/5 hover:border-[#ff3b5c]/20
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        NONE
                    </button>
                </div>
            </div>

            {/* Stem rows */}
            <div className="divide-y divide-white/5">
                {availableStems.map(stem => {
                    const baseName = stem.replace(/\.(wav|mp3|flac)$/i, '');
                    const isSelected = selectedStems.includes(stem);
                    const color = stemColor(baseName);
                    return (
                        <StemRow
                            key={stem}
                            trackId={trackId}
                            stemName={baseName}
                            rawStemName={stem}
                            isSelected={isSelected}
                            color={color}
                            isPlaying={isPlaying && isSelected}
                            currentTime={currentTime}
                            onToggle={() => onToggleStemSelection(stem)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

interface StemRowProps {
    trackId: string;
    stemName: string;
    rawStemName: string;
    isSelected: boolean;
    color: string;
    isPlaying: boolean;
    currentTime: number;
    onToggle: () => void;
}

function StemRow({ trackId, stemName, rawStemName, isSelected, color, isPlaying, currentTime, onToggle }: StemRowProps) {
    const [soloing, setSoloing] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Solo preview: plays stem audio from current position
    const toggleSolo = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (soloing) {
            audioRef.current?.pause();
            setSoloing(false);
        } else {
            if (!audioRef.current) {
                audioRef.current = new Audio(getStemAudioUrl(trackId, stemName));
            }
            audioRef.current.currentTime = currentTime;
            audioRef.current.play().catch(console.error);
            setSoloing(true);
        }
    }, [soloing, trackId, stemName, currentTime]);

    // Stop solo when main track state changes
    useEffect(() => {
        if (!soloing) return;
        return () => {
            audioRef.current?.pause();
        };
    }, [soloing]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, [trackId, stemName]);

    return (
        <div
            onClick={onToggle}
            className={`
                flex items-center gap-3 px-3 py-2 cursor-pointer
                transition-all select-none
                ${isSelected
                    ? 'bg-white/[0.04] hover:bg-white/[0.07]'
                    : 'bg-transparent hover:bg-white/[0.03] opacity-40 hover:opacity-60'}
            `}
        >
            {/* Color indicator */}
            <div
                className="w-1 rounded-full flex-shrink-0"
                style={{
                    height: 28,
                    backgroundColor: isSelected ? color : 'rgba(255,255,255,0.1)',
                    boxShadow: isSelected ? `0 0 6px ${color}66` : 'none',
                }}
            />

            {/* Checkbox */}
            <div className="flex-shrink-0 text-white/30">
                {isSelected
                    ? <CheckSquare2 size={13} style={{ color }} />
                    : <Square size={13} />}
            </div>

            {/* Name */}
            <span className="flex-1 capitalize text-[12px] font-medium text-white/80 tracking-wide">
                {stemName}
            </span>

            {/* VU bars */}
            <VuBars color={color} active={isPlaying} />

            {/* Solo preview button */}
            <button
                onClick={toggleSolo}
                title={soloing ? 'Stop solo preview' : 'Solo preview (from current position)'}
                className={`
                    flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold
                    tracking-widest transition-all focus:outline-none
                    ${soloing
                        ? 'bg-[#f59e0b]/25 text-[#f59e0b] border border-[#f59e0b]/40 animate-pulse'
                        : 'bg-white/5 text-white/25 border border-white/10 hover:text-white/60 hover:bg-white/10'}
                `}
            >
                {soloing ? 'STOP' : 'S'}
            </button>
        </div>
    );
}

export default StemLanes;
