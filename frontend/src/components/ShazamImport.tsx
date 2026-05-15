import React, { useState, useRef, useCallback } from 'react';
import { Music, Upload, X, Play, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ShazamTrack {
    title: string;
    artist: string;
    date_shazamed: string;
    shazam_link: string;
    apple_music_link: string;
    search_query: string;
}

interface ShazamImportProps {
    onClose: () => void;
    onIngest: (query: string, title: string) => void;
}

export function ShazamImport({ onClose, onIngest }: ShazamImportProps) {
    const [tracks, setTracks] = useState<ShazamTrack[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ingested, setIngested] = useState<Set<string>>(new Set());
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        setLoading(true);
        setError(null);
        setTracks([]);
        try {
            const form = new FormData();
            form.append('csv_file', file);
            const res = await fetch('/api/ingest/shazam-history', { method: 'POST', body: form });
            if (!res.ok) {
                const detail = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
                throw new Error(detail.detail || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setTracks(data.tracks || []);
            if ((data.tracks || []).length === 0) {
                setError('No tracks found in file. Make sure it\'s a Shazam CSV export.');
            }
        } catch (e: any) {
            setError(e.message || 'Failed to parse file');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleIngest = useCallback((track: ShazamTrack) => {
        const key = track.search_query;
        onIngest(track.search_query, track.title);
        setIngested(prev => new Set([...prev, key]));
    }, [onIngest]);

    const handleIngestAll = useCallback(() => {
        tracks.forEach(t => {
            if (!ingested.has(t.search_query)) handleIngest(t);
        });
    }, [tracks, ingested, handleIngest]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Music size={16} className="text-[#00d4ff]" />
                        <span className="text-sm font-semibold text-white">My Shazams</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all">
                        <X size={13} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Instructions */}
                    {tracks.length === 0 && (
                        <div className="space-y-3">
                            <p className="text-white/50 text-sm leading-relaxed">
                                Export your Shazam library as CSV, then drop it here to batch-import every track.
                            </p>
                            <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3 space-y-1.5 text-xs font-mono text-white/40">
                                <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">How to export</p>
                                <p>iPhone: Shazam → My Library → ⋯ → Export CSV</p>
                                <p>Web: shazam.com → My Library → Export</p>
                            </div>

                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={e => e.preventDefault()}
                                onClick={() => fileRef.current?.click()}
                                className="border-2 border-dashed border-white/10 hover:border-[#00d4ff]/40 rounded-xl p-8 text-center cursor-pointer transition-all group"
                            >
                                <Upload size={24} className="mx-auto mb-3 text-white/20 group-hover:text-[#00d4ff]/60 transition-colors" />
                                <p className="text-sm text-white/40 group-hover:text-white/60 transition-colors">
                                    {loading ? 'Parsing…' : 'Drop CSV here or click to browse'}
                                </p>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-[#ff3b5c]/10 border border-[#ff3b5c]/20 rounded-lg text-[#ff3b5c] text-xs">
                                    <AlertCircle size={12} />
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Track list */}
                    {tracks.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-white/40 font-mono">{tracks.length} tracks found</p>
                                <button
                                    onClick={handleIngestAll}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-all"
                                >
                                    Import All
                                </button>
                            </div>
                            <div className="space-y-1">
                                {tracks.map((track, i) => {
                                    const done = ingested.has(track.search_query);
                                    return (
                                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white/80 truncate">{track.title}</p>
                                                <p className="text-xs text-white/40 truncate">{track.artist}</p>
                                            </div>
                                            {track.date_shazamed && (
                                                <span className="text-[10px] text-white/25 font-mono shrink-0 hidden sm:block">
                                                    {track.date_shazamed.split(' ')[0]}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => !done && handleIngest(track)}
                                                disabled={done}
                                                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                                    done
                                                        ? 'bg-[#00ff88]/10 border-[#00ff88]/20 text-[#00ff88] cursor-default'
                                                        : 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20'
                                                }`}
                                            >
                                                {done ? <CheckCircle2 size={11} /> : <Play size={11} />}
                                                {done ? 'Queued' : 'Import'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
