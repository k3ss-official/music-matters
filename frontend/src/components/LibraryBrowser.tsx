import React, { useState, useRef } from 'react';
import { Music, List, Mic2, FolderOpen, MoreVertical, Trash2, Play, Square } from 'lucide-react';
import type { TrackSummary } from '../types';
import { getTrackAudioUrl } from '../services/api';

interface LibraryBrowserProps {
    tracks: TrackSummary[];
    onTrackSelect: (id: string) => void;
    onTrackDelete?: (id: string) => void;
    selectedTrackId: string | null;
    loading?: boolean;
}

export function LibraryBrowser({ tracks, onTrackSelect, onTrackDelete, selectedTrackId, loading }: LibraryBrowserProps) {
    const [activeTab, setActiveTab] = useState<'tracks' | 'stems' | 'loops'>('tracks');
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    const handlePreview = (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        if (previewingId === trackId) {
            // Stop
            previewAudioRef.current?.pause();
            previewAudioRef.current = null;
            setPreviewingId(null);
        } else {
            // Stop any previous preview
            previewAudioRef.current?.pause();
            const audio = new Audio(getTrackAudioUrl(trackId));
            audio.play().catch(console.error);
            audio.addEventListener('ended', () => setPreviewingId(null));
            previewAudioRef.current = audio;
            setPreviewingId(trackId);
        }
    };

    const stopPreviewOnSelect = (trackId: string) => {
        if (previewingId) {
            previewAudioRef.current?.pause();
            previewAudioRef.current = null;
            setPreviewingId(null);
        }
        onTrackSelect(trackId);
    };

    const getStatusColor = (status: string) => {
        if (['project_ready', 'completed'].includes(status)) return '#00ff88';
        if (['processing', 'running', 'queued'].includes(status)) return '#00d4ff';
        if (['failed', 'error'].includes(status)) return '#ff3b5c';
        return '#8b5cf6';
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'project_ready': return 'Ready';
            case 'stems_ready': return 'Stems done';
            case 'analysed': return 'Analyzed';
            case 'ingested': return 'Ingested';
            case 'queued': return 'Queued';
            case 'running': return 'Running';
            case 'error': return 'Error';
            default: return status;
        }
    };

    const timeAgo = (dateStr: string) => {
        const ms = Date.now() - new Date(dateStr).getTime();
        if (ms < 60000) return 'Just now';
        if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
        if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
        return `${Math.floor(ms / 86400000)}d ago`;
    };

    return (
        <div className="bg-[#12121a] border border-white/5 rounded-lg flex flex-col flex-1 overflow-hidden">
            <div className="flex bg-[#1a1a26]/50 border-b border-white/5 text-xs font-bold uppercase tracking-wider text-gray-500">
                <button
                    onClick={() => setActiveTab('tracks')}
                    className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'tracks' ? 'border-[#00d4ff] text-[#00d4ff]' : 'border-transparent hover:text-gray-300 hover:bg-white/5'}`}
                >
                    <Music size={14} /> Tracks
                </button>
                <button
                    onClick={() => setActiveTab('stems')}
                    className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'stems' ? 'border-[#8b5cf6] text-[#8b5cf6]' : 'border-transparent hover:text-gray-300 hover:bg-white/5'}`}
                >
                    <Mic2 size={14} /> Stems
                </button>
                <button
                    onClick={() => setActiveTab('loops')}
                    className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'loops' ? 'border-[#00ff88] text-[#00ff88]' : 'border-transparent hover:text-gray-300 hover:bg-white/5'}`}
                >
                    <List size={14} /> Loops
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab !== 'tracks' && (
                    <div className="text-center py-10 text-gray-500 text-sm">
                        <FolderOpen size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="max-w-[150px] mx-auto leading-tight">This view is coming soon.</p>
                    </div>
                )}

                {loading && activeTab === 'tracks' && tracks.length === 0 && (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-white/5 rounded-lg border border-white/5 animate-pulse" />
                        ))}
                    </div>
                )}

                {activeTab === 'tracks' && tracks.map(track => {
                    const isSelected = track.track_id === selectedTrackId;
                    const statusColor = getStatusColor(track.status);
                    const isPreviewing = previewingId === track.track_id;

                    return (
                        <div
                            key={track.track_id}
                            onClick={() => stopPreviewOnSelect(track.track_id)}
                            className={`group flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                                ? 'border-[#00d4ff]/50 bg-[#00d4ff]/5 shadow-[0_4px_15px_rgba(0,212,255,0.05)]'
                                : 'border-white/5 bg-black/20 hover:border-white/20 hover:bg-black/40'
                                }`}
                        >
                            <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-sm text-gray-100 truncate flex-1" title={track.title}>
                                        {track.title || 'Untitled Track'}
                                    </h4>
                                    {((track as any).metadata?.source_path?.includes('youtu') || (track as any).provenance?.source_path?.includes('youtu')) ? (
                                        <span className="text-[9px] bg-[#ff3b5c]/20 text-[#ff3b5c] px-1.5 py-0.5 rounded uppercase font-bold tracking-widest flex-shrink-0 border border-[#ff3b5c]/30">
                                            YT
                                        </span>
                                    ) : ((track as any).metadata?.source_path || (track as any).provenance?.source_path) ? (
                                        <span className="text-[9px] bg-[#00d4ff]/20 text-[#00d4ff] px-1.5 py-0.5 rounded uppercase font-bold tracking-widest flex-shrink-0 border border-[#00d4ff]/30">
                                            Upload
                                        </span>
                                    ) : null}
                                </div>
                                {track.artist && (
                                    <p className="text-xs text-gray-500 truncate mb-2">{track.artist}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono font-bold tracking-tight">
                                    {track.bpm ? (
                                        <span className="bg-black border border-white/10 text-gray-300 px-1.5 py-0.5 rounded">
                                            {track.bpm.toFixed(0)} BPM
                                        </span>
                                    ) : null}
                                    {track.musical_key && (
                                        <span className="bg-black border border-white/10 text-gray-300 px-1.5 py-0.5 rounded">
                                            {track.musical_key}
                                        </span>
                                    )}
                                    <span className="text-gray-600 font-sans tracking-normal opacity-70">
                                        {timeAgo(track.created_at)}
                                    </span>
                                </div>
                                {/* Auto-generated tags */}
                                {(() => {
                                    const meta = (track as any).metadata || {};
                                    const autoTags: string[] = [];
                                    if (track.bpm && track.bpm > 140) autoTags.push('fast');
                                    else if (track.bpm && track.bpm < 90) autoTags.push('slow');
                                    if (Array.isArray(meta.tags)) autoTags.push(...meta.tags.slice(0, 3));
                                    if (autoTags.length === 0) return null;
                                    return (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {autoTags.map((tag, idx) => (
                                                <span key={idx} className="text-[9px] bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    );
                                })()}
                                {/* Source file path */}
                                {(() => {
                                    const src: string = (track as any).metadata?.source_path || (track as any).metadata?.source || '';
                                    if (!src) return null;
                                    const name = src.split('/').pop() || src;
                                    return (
                                        <p className="text-[9px] font-mono text-white/20 truncate mt-1" title={src}>{name}</p>
                                    );
                                })()}
                            </div>

                            <div className="flex flex-col items-end justify-between h-full gap-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded"
                                        style={{ color: statusColor, backgroundColor: `${statusColor}1a`, border: `1px solid ${statusColor}33` }}
                                    >
                                        {getStatusLabel(track.status)}
                                    </span>

                                    <button
                                        onClick={(e) => handlePreview(e, track.track_id)}
                                        title={isPreviewing ? 'Stop preview' : 'Preview track'}
                                        className={`transition-colors ${isPreviewing
                                            ? 'text-[#00d4ff]'
                                            : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-[#00d4ff]'}`}
                                    >
                                        {isPreviewing
                                            ? <Square size={14} fill="currentColor" />
                                            : <Play size={14} fill="currentColor" />}
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onTrackDelete) onTrackDelete(track.track_id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-[#ff3b5c] transition-colors"
                                        title="Delete Track"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {!isSelected && (
                                    <button className="text-xs font-bold text-[#00d4ff] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        Open <MoreVertical size={12} className="-rotate-90" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
