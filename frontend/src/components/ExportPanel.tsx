import React, { useState, useCallback } from 'react';
import { DownloadCloud } from 'lucide-react';
import * as api from '../services/api';

const STEM_COLORS: Record<string, string> = {
    drums: '#ff3b5c', bass: '#00d4ff', vocals: '#8b5cf6',
    other: '#00ff88', piano: '#f59e0b', guitar: '#fbbf24',
    mixdown: '#9ca3af', harmonic: '#22d3ee', percussive: '#f97316',
};

function stemColor(name: string): string {
    return STEM_COLORS[name.toLowerCase().replace(/\.wav$/, '')] ?? '#ffffff';
}

interface ExportPanelProps {
    trackId: string;
    /** Available stem names (from trackDetail.stems) */
    availableStems?: string[];
    /** Pre-selected stems lifted from StemLanes */
    selectedStems: string[];
    regionStart: number;
    regionEnd: number;
    onExportComplete?: (loop: any) => void;
    onOpenDialog?: () => void;
    disabled?: boolean;
}

export function ExportPanel({
    trackId,
    availableStems = [],
    selectedStems: externalStems,
    regionStart,
    regionEnd,
    onExportComplete,
    onOpenDialog,
    disabled,
}: ExportPanelProps) {
    // "mixdown" is the full-mix option — treated as a pseudo-stem
    const MIXDOWN = '__mixdown__';

    // Local stem selection (initialised from externalStems / availableStems)
    const [localStems, setLocalStems] = useState<string[]>(() =>
        externalStems.length > 0 ? externalStems : availableStems,
    );
    const [mixdownSelected, setMixdownSelected] = useState(false);

    // Keep local in sync when external (StemLanes) changes
    React.useEffect(() => {
        setLocalStems(externalStems.length > 0 ? externalStems : availableStems);
    }, [externalStems, availableStems]);

    const [exporting, setExporting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const toggleStem = useCallback((stem: string) => {
        setLocalStems(prev =>
            prev.includes(stem) ? prev.filter(s => s !== stem) : [...prev, stem],
        );
    }, []);

    const handleExportLoop = async () => {
        try {
            setExporting(true);
            setErrorMsg(null);
            // Build unified export list: full mix + any individual stems
            const stemsToExport = [
                ...(mixdownSelected ? ['mixdown'] : []),
                ...(localStems.length > 0 ? localStems : (mixdownSelected ? [] : availableStems)),
            ];
            const { blob, filename } = await api.downloadAbletonExport(
                trackId, stemsToExport, regionStart, regionEnd,
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (onExportComplete) onExportComplete({ stems: stemsToExport });
        } catch (e: any) {
            setErrorMsg(e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const loopLen = Math.max(0, regionEnd - regionStart);
    const hasRegion = regionEnd > regionStart;
    const baseStemNames = availableStems.map(s => s.replace(/\.(wav|mp3|flac)$/i, ''));
    const exportDisabled = disabled || exporting || !hasRegion;
    const nothingSelected = !mixdownSelected && localStems.length === 0;

    return (
        <div className="bg-[#12121a] rounded-lg p-4 border border-white/5 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/40 font-mono">Export</h3>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/20 tabular-nums">
                        {loopLen.toFixed(2)}s
                    </span>
                    {onOpenDialog && (
                        <button
                            onClick={onOpenDialog}
                            disabled={disabled}
                            className="px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest font-mono
                                       bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/25
                                       hover:bg-[#00d4ff]/20 disabled:opacity-30 disabled:cursor-not-allowed
                                       transition-colors"
                        >
                            Full…
                        </button>
                    )}
                </div>
            </div>

            {/* Stem + Full Mix selector */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/25 uppercase font-mono tracking-widest">Export stems</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setLocalStems([...availableStems])}
                            className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded
                                       bg-white/5 hover:bg-[#00ff88]/10 text-white/25 hover:text-[#00ff88]
                                       border border-white/5 transition-colors"
                        >all</button>
                        <button
                            onClick={() => { setLocalStems([]); setMixdownSelected(false); }}
                            className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded
                                       bg-white/5 hover:bg-[#ff3b5c]/10 text-white/25 hover:text-[#ff3b5c]
                                       border border-white/5 transition-colors"
                        >none</button>
                    </div>
                </div>

                {/* Full Mix toggle — independent peer checkbox alongside stems */}
                <button
                    onClick={() => setMixdownSelected(v => !v)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded border
                                text-[10px] font-medium transition-all
                                ${mixdownSelected
                                    ? 'bg-white/[0.06] border-white/15 text-white/70'
                                    : 'bg-white/[0.02] border-white/5 text-white/25 hover:text-white/45 hover:bg-white/[0.04]'}`}
                >
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
                        style={{ backgroundColor: mixdownSelected ? '#9ca3af' : 'rgba(255,255,255,0.12)' }} />
                    Full Mix (mixdown)
                </button>

                {/* Individual stem toggles */}
                <div className="grid grid-cols-2 gap-1">
                    {availableStems.map((stem, i) => {
                        const base = baseStemNames[i];
                        const sel  = localStems.includes(stem);
                        const col  = stemColor(base);
                        return (
                            <button
                                key={stem}
                                onClick={() => toggleStem(stem)}
                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded border
                                            text-[10px] font-medium capitalize transition-all
                                            ${sel
                                                ? 'bg-white/[0.06] border-white/15 text-white/70'
                                                : 'bg-white/[0.02] border-white/5 text-white/25 hover:text-white/45 hover:bg-white/[0.04]'}`}
                            >
                                <div
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
                                    style={{ backgroundColor: sel ? col : 'rgba(255,255,255,0.12)' }}
                                />
                                {base}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[9px] text-white/15 font-mono text-center">
                    {mixdownSelected && localStems.length > 0
                        ? `Full mix + ${localStems.length} stem${localStems.length !== 1 ? 's' : ''}`
                        : mixdownSelected
                            ? 'Full mix only'
                            : `${localStems.length}/${availableStems.length} stems`}
                </p>
            </div>

            {errorMsg && (
                <div className="p-2 bg-[#ff3b5c]/10 border border-[#ff3b5c]/30 text-[#ff3b5c] text-[10px] rounded text-center font-mono">
                    {errorMsg}
                </div>
            )}

            {/* Single export button */}
            <button
                disabled={exportDisabled || nothingSelected}
                onClick={handleExportLoop}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-black
                           bg-[#00d4ff] hover:bg-[#00b8e6]
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                           shadow-[0_0_12px_rgba(0,212,255,0.25)] text-[12px]"
            >
                {exporting
                    ? <span className="animate-pulse text-black/80">Extracting…</span>
                    : <><DownloadCloud size={14} /> Export Loop</>
                }
            </button>

            {!hasRegion && trackId && (
                <p className="text-[9px] text-white/20 font-mono text-center">
                    Set a loop region to export
                </p>
            )}
            {hasRegion && nothingSelected && (
                <p className="text-[9px] text-white/20 font-mono text-center">
                    Select Full Mix or at least one stem
                </p>
            )}
        </div>
    );
}
