/**
 * ExportDialog — modal export UI
 *
 * Triggered by Cmd+E shortcut or "EXPORT" button in ExportPanel.
 * Features: loop name, format picker, stem selection checkboxes, Ableton export.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, DownloadCloud, Music2, Loader2, CheckCircle2, Layers } from 'lucide-react';
import * as api from '../services/api';

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    trackId: string;
    trackTitle?: string;
    availableStems: string[];
    /** Pre-selected stems (from sidebar selection) */
    initialSelectedStems: string[];
    regionStart: number;
    regionEnd: number;
}

type ExportFormat = 'WAV' | 'MP3' | 'FLAC';

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2);
    return `${String(m).padStart(2, '0')}:${sec.padStart(5, '0')}`;
}

const STEM_COLORS: Record<string, string> = {
    drums: '#ff3b5c', bass: '#00d4ff', vocals: '#8b5cf6',
    other: '#00ff88', piano: '#f59e0b', guitar: '#fbbf24',
    mixdown: '#9ca3af', harmonic: '#22d3ee', percussive: '#f97316',
};

function stemColor(name: string): string {
    return STEM_COLORS[name.toLowerCase()] ?? '#ffffff';
}

export function ExportDialog({
    isOpen,
    onClose,
    trackId,
    trackTitle,
    availableStems,
    initialSelectedStems,
    regionStart,
    regionEnd,
}: ExportDialogProps) {
    const [loopName, setLoopName] = useState('');
    const [format, setFormat] = useState<ExportFormat>('WAV');
    const [localStems, setLocalStems] = useState<string[]>([]);
    const [exporting, setExporting] = useState(false);
    const [abletonLoading, setAbletonLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setLocalStems(initialSelectedStems.length > 0 ? initialSelectedStems : availableStems);
            setLoopName(trackTitle ? `${trackTitle} Loop` : 'Loop');
            setSuccessMsg(null);
            setErrorMsg(null);
            setExporting(false);
            setAbletonLoading(false);
        }
    }, [isOpen, initialSelectedStems, availableStems, trackTitle]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    const toggleStem = useCallback((stem: string) => {
        setLocalStems(prev =>
            prev.includes(stem) ? prev.filter(s => s !== stem) : [...prev, stem]
        );
    }, []);

    const selectAll = () => setLocalStems([...availableStems]);
    const clearAll = () => setLocalStems([]);

    const loopDuration = Math.max(0, regionEnd - regionStart);
    const hasRegion = regionEnd > regionStart;

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3500);
    };

    const handleExportLoop = async () => {
        if (!hasRegion || exporting) return;
        setExporting(true);
        setErrorMsg(null);
        try {
            const stems = localStems.length > 0 ? localStems : availableStems;
            await api.createCustomLoop(trackId, regionStart, regionEnd, stems);
            showSuccess(`Loop saved — ${stems.length} stem${stems.length !== 1 ? 's' : ''} · ${loopDuration.toFixed(2)}s`);
        } catch (e: any) {
            setErrorMsg(e?.detail || e?.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const handleExportAbleton = async () => {
        if (!hasRegion || abletonLoading) return;
        setAbletonLoading(true);
        setErrorMsg(null);
        try {
            const stems = localStems.length > 0 ? localStems : ['mixdown'];
            const { blob, filename } = await api.downloadAbletonExport(
                trackId, stems, regionStart, regionEnd,
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showSuccess('Ableton .als downloaded');
        } catch (e: any) {
            setErrorMsg(
                e instanceof api.ApiError
                    ? `Export failed (${e.status}): ${e.detail}`
                    : e?.message || 'Ableton export failed',
            );
        } finally {
            setAbletonLoading(false);
        }
    };

    if (!isOpen) return null;

    const baseStemNames = availableStems.map(s => s.replace(/\.(wav|mp3|flac)$/i, ''));

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Panel */}
            <div className="w-[440px] max-h-[90vh] overflow-y-auto bg-[#13131f] border border-white/10 rounded-xl shadow-2xl shadow-black/60 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <DownloadCloud size={15} className="text-[#00d4ff]" />
                        <span className="text-[13px] font-bold uppercase tracking-widest text-white/80">
                            Export
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-5">

                    {/* Region info */}
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                        <div className="flex flex-col gap-0.5 flex-1">
                            <span className="text-[10px] text-white/30 uppercase font-mono tracking-widest">Region</span>
                            <span className="text-[12px] font-mono text-[#00d4ff]">
                                {fmtTime(regionStart)} → {fmtTime(regionEnd)}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-[10px] text-white/30 uppercase font-mono tracking-widest">Duration</span>
                            <span className="text-[12px] font-mono text-white/60">
                                {loopDuration.toFixed(3)}s
                            </span>
                        </div>
                    </div>

                    {/* Loop name */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                            Loop Name
                        </label>
                        <input
                            type="text"
                            value={loopName}
                            onChange={e => setLoopName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                                       text-[13px] text-white/80 font-mono placeholder-white/20
                                       focus:outline-none focus:border-[#00d4ff]/40 focus:bg-white/[0.07]
                                       transition-colors"
                            placeholder="Loop name…"
                        />
                    </div>

                    {/* Format */}
                    <div className="space-y-1.5">
                        <span className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                            Format
                        </span>
                        <div className="flex gap-2">
                            {(['WAV', 'MP3', 'FLAC'] as ExportFormat[]).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFormat(f)}
                                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold font-mono tracking-widest
                                                transition-all border
                                                ${format === f
                                                    ? 'bg-[#00d4ff]/15 text-[#00d4ff] border-[#00d4ff]/40 shadow-sm shadow-[#00d4ff]/10'
                                                    : 'bg-white/5 text-white/30 border-white/10 hover:text-white/60 hover:bg-white/10'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stems */}
                    {availableStems.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-white/40 uppercase font-mono tracking-widest">
                                    Stems
                                </span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={selectAll}
                                        className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded
                                                   bg-white/5 hover:bg-[#00ff88]/15 text-white/30 hover:text-[#00ff88]
                                                   border border-white/5 hover:border-[#00ff88]/20 transition-colors"
                                    >
                                        ALL
                                    </button>
                                    <button
                                        onClick={clearAll}
                                        className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded
                                                   bg-white/5 hover:bg-[#ff3b5c]/15 text-white/30 hover:text-[#ff3b5c]
                                                   border border-white/5 hover:border-[#ff3b5c]/20 transition-colors"
                                    >
                                        NONE
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {availableStems.map((stem, i) => {
                                    const baseName = baseStemNames[i];
                                    const isSelected = localStems.includes(stem);
                                    const color = stemColor(baseName);
                                    return (
                                        <button
                                            key={stem}
                                            onClick={() => toggleStem(stem)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border
                                                        text-[11px] font-medium capitalize transition-all
                                                        ${isSelected
                                                            ? 'bg-white/[0.06] border-white/15 text-white/80'
                                                            : 'bg-white/[0.02] border-white/5 text-white/30 hover:text-white/50 hover:bg-white/[0.04]'}`}
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: isSelected ? color : 'rgba(255,255,255,0.15)' }}
                                            />
                                            {baseName}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-white/20 font-mono text-center">
                                {localStems.length} / {availableStems.length} selected
                            </p>
                        </div>
                    )}

                    {/* Messages */}
                    {successMsg && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-lg text-[#00ff88] text-[11px] font-mono">
                            <CheckCircle2 size={13} />
                            {successMsg}
                        </div>
                    )}
                    {errorMsg && (
                        <div className="px-3 py-2 bg-[#ff3b5c]/10 border border-[#ff3b5c]/30 rounded-lg text-[#ff3b5c] text-[11px] font-mono">
                            {errorMsg}
                        </div>
                    )}

                    {/* Export buttons */}
                    <div className="space-y-2 pt-1">
                        {/* Save loop */}
                        <button
                            disabled={!hasRegion || exporting || abletonLoading}
                            onClick={handleExportLoop}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                                       font-bold text-[12px] tracking-wider
                                       bg-[#00d4ff] hover:bg-[#00bde8] text-black
                                       disabled:opacity-40 disabled:cursor-not-allowed
                                       shadow-[0_0_20px_rgba(0,212,255,0.25)] transition-all"
                        >
                            {exporting
                                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                                : <><DownloadCloud size={14} /> Save Loop ({format})</>
                            }
                        </button>

                        {/* Ableton export */}
                        <button
                            disabled={!hasRegion || abletonLoading || exporting}
                            onClick={handleExportAbleton}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                                        font-bold text-[11px] tracking-wider transition-all
                                        border disabled:opacity-40 disabled:cursor-not-allowed
                                        ${successMsg?.includes('Ableton')
                                            ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
                                            : 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30 hover:bg-[#22c55e]/20'}`}
                        >
                            {abletonLoading
                                ? <><Loader2 size={13} className="animate-spin" /> Generating .als…</>
                                : <><Music2 size={13} /> Export to Ableton (.als)</>
                            }
                        </button>
                    </div>

                    {!hasRegion && (
                        <p className="text-[10px] text-white/25 font-mono text-center">
                            Set a loop region before exporting
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ExportDialog;
