import React, { useState } from 'react';
import { DownloadCloud, Layers, Music2 } from 'lucide-react';
import * as api from '../services/api';

interface ExportPanelProps {
    trackId: string;
    selectedStems: string[];
    regionStart: number;
    regionEnd: number;
    onExportComplete?: (loop: any) => void;
    disabled?: boolean;
}

export function ExportPanel({
    trackId,
    selectedStems,
    regionStart,
    regionEnd,
    onExportComplete,
    disabled
}: ExportPanelProps) {
    const [format, setFormat] = useState('WAV');
    const [exporting, setExporting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleExportLoop = async () => {
        try {
            setExporting(true);
            setErrorMsg(null);
            const loop = await api.createCustomLoop(trackId, regionStart, regionEnd, selectedStems);
            if (onExportComplete) onExportComplete(loop);
        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const handleExportAllStems = async () => {
        // For now, this just extracts all stems for the region.
        // Ideally the backend would zip them, but we'll use the loop route with all stems.
        try {
            setExporting(true);
            setErrorMsg(null);
            const allStems = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
            const loop = await api.createCustomLoop(trackId, regionStart, regionEnd, allStems);
            if (onExportComplete) onExportComplete(loop);
        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const handleExportAbleton = async () => {
        try {
            setExporting(true);
            setErrorMsg(null);
            const result = await api.exportToAbleton(trackId, selectedStems, regionStart, regionEnd);
            if (result.download_url) {
                window.open(result.download_url, '_blank');
            }
        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Ableton export failed');
        } finally {
            setExporting(false);
        }
    };

    const lengthS = Math.max(0, regionEnd - regionStart).toFixed(3);

    return (
        <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Export</h3>

            <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1"><Layers size={14} /> {selectedStems.length} Stems</span>
                <span className="font-mono bg-black/50 px-2 py-0.5 rounded">{lengthS}s</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 uppercase font-semibold mr-2">Format</span>
                {['WAV', 'MP3', 'FLAC'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`px-3 py-1 rounded-full font-bold transition-all ${format === f
                                ? 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/50'
                                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {errorMsg && (
                <div className="p-2 bg-[#ff3b5c]/10 border border-[#ff3b5c]/30 text-[#ff3b5c] text-xs rounded text-center">
                    {errorMsg}
                </div>
            )}

            <button
                disabled={disabled || exporting || selectedStems.length === 0 || regionEnd <= regionStart}
                onClick={handleExportLoop}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-black bg-[#00d4ff] hover:bg-[#00b8e6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_15px_rgba(0,212,255,0.3)]"
            >
                {exporting ? (
                    <span className="animate-pulse">Extracting...</span>
                ) : (
                    <>
                        <DownloadCloud size={18} /> Export Loop
                    </>
                )}
            </button>

            <button
                disabled={disabled || exporting || regionEnd <= regionStart}
                onClick={handleExportAllStems}
                className="w-full py-2 rounded-lg font-bold text-xs text-[#8b5cf6] bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                Export All Stems
            </button>

            <button
                disabled={disabled || exporting || selectedStems.length === 0 || regionEnd <= regionStart}
                onClick={handleExportAbleton}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/30 hover:bg-[#22c55e]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                <Music2 size={16} /> Export to Ableton (.als)
            </button>
        </div>
    );
}
