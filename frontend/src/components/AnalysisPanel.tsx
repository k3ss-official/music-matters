import React from 'react';
import { Music, Activity, Clock, FileAudio, Copy, Layers } from 'lucide-react';
import { DataChip } from './DataChip';
import type { TrackDetailResponse } from '../types';

interface AnalysisPanelProps {
    trackDetail: TrackDetailResponse | null;
    loading?: boolean;
    onRequestSeparation?: () => void;
}

export function AnalysisPanel({ trackDetail, loading, onRequestSeparation }: AnalysisPanelProps) {
    if (loading || !trackDetail) {
        return (
            <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
                <div className="h-6 w-1/3 bg-white/5 rounded animate-pulse" />
                <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    const { bpm, musical_key, metadata } = trackDetail;

    const formatDuration = (sec?: number) => {
        if (!sec) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const copyPath = () => {
        if (metadata?.source_path) {
            navigator.clipboard.writeText(metadata.source_path);
        }
    };

    const isYT = metadata?.source?.includes('youtube.com') || metadata?.source?.includes('youtu.be');

    return (
        <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Analysis</h3>
                {onRequestSeparation && (
                    <button
                        onClick={onRequestSeparation}
                        title="Run stem separation (drums, bass, vocals, other)"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded
                                   bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25
                                   text-[#8b5cf6] border border-[#8b5cf6]/30
                                   text-[10px] font-bold font-mono tracking-wider
                                   transition-colors"
                    >
                        <Layers size={10} />
                        SEPARATE STEMS
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <DataChip
                    icon={Music}
                    label="Key"
                    value={musical_key || '--'}
                    variant={musical_key ? 'secondary' : 'default'}
                />
                <DataChip
                    icon={Activity}
                    label="BPM"
                    value={bpm ? bpm.toFixed(2) : '--'}
                    variant={bpm ? 'primary' : 'default'}
                />
                <DataChip
                    icon={Clock}
                    label="Duration"
                    value={formatDuration(metadata?.duration)}
                />
                <DataChip
                    icon={FileAudio}
                    label="Format"
                    value={metadata?.original_filename?.split('.').pop()?.toUpperCase() || 'WAV'}
                />
            </div>

            <div className="pt-4 border-t border-white/5 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Source Info</h4>

                {isYT ? (
                    <div className="text-xs bg-white/5 p-2 rounded flex justify-between items-center text-gray-300">
                        <span className="truncate w-full pr-2 text-[#ff3b5c] font-medium block">
                            YouTube Ingest
                        </span>
                        <span className="bg-[#ff3b5c]/20 text-[#ff3b5c] px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest">
                            YT
                        </span>
                    </div>
                ) : (
                    <div className="text-xs bg-white/5 p-2 rounded flex justify-between items-center text-gray-300">
                        <span className="truncate w-full pr-2 font-mono opacity-80 block">
                            {metadata?.original_filename || 'Local Upload'}
                        </span>
                        <span className="bg-[#00d4ff]/20 text-[#00d4ff] px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest">
                            File
                        </span>
                    </div>
                )}

                {metadata?.source_path && (
                    <div className="mt-2 text-xs">
                        <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Storage Path</h4>
                        <div className="flex items-center gap-2 bg-black/50 border border-white/5 rounded p-2 text-gray-400">
                            <span className="truncate font-mono opacity-70 flex-1 select-all">{metadata.source_path}</span>
                            <button
                                onClick={copyPath}
                                className="hover:text-white transition-colors flex-shrink-0"
                                title="Copy Path"
                            >
                                <Copy size={12} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
