import React, { useRef, useState, useEffect } from 'react';
import { Play, Square, Volume2, VolumeX, Music } from 'lucide-react';
import { getStemAudioUrl, downloadStemMidi } from '../services/api';

interface StemLanesProps {
    trackId: string;
    availableStems: string[];
    selectedStems: string[];
    onToggleStemSelection: (stem: string) => void;
    onRequestSeparation?: () => void;
    loading?: boolean;
}

const STEM_COLORS: Record<string, string> = {
    drums: '#ff3b5c',
    bass: '#00d4ff',
    vocals: '#8b5cf6',
    other: '#00ff88',
    piano: '#f59e0b',
    guitar: '#fbbf24',
};

export function StemLanes({
    trackId,
    availableStems,
    selectedStems,
    onToggleStemSelection,
    onRequestSeparation,
    loading,
}: StemLanesProps) {
    if (loading || availableStems.length === 0) {
        return (
            <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Stem Breakdown</h3>
                    {!loading && availableStems.length === 0 && (
                        <button
                            onClick={onRequestSeparation}
                            className="px-3 py-1 bg-[#8b5cf6]/20 text-[#8b5cf6] hover:bg-[#8b5cf6]/30 rounded text-xs font-bold transition-colors border border-[#8b5cf6]/30"
                        >
                            Run Separation
                        </button>
                    )}
                </div>
                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 block text-sm text-gray-500 border border-dashed border-white/10 rounded">
                        Stems not available for this track. Use the button above to generate them.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Stem Selection</h3>
            <div className="space-y-2">
                {availableStems.map((stem) => (
                    <StemLane
                        key={stem}
                        trackId={trackId}
                        stemName={stem}
                        isSelected={selectedStems.includes(stem)}
                        onToggle={() => onToggleStemSelection(stem)}
                    />
                ))}
            </div>
        </div>
    );
}

interface StemLaneProps {
    trackId: string;
    stemName: string;
    isSelected: boolean;
    onToggle: () => void;
}

function StemLane({ trackId, stemName, isSelected, onToggle }: StemLaneProps) {
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [midiLoading, setMidiLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const color = STEM_COLORS[stemName.toLowerCase()] || '#ffffff';

    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio(getStemAudioUrl(trackId, stemName));
            audioRef.current.loop = true;
        }
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, [trackId, stemName]);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(console.error);
        }
        setPlaying(!playing);
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            audioRef.current.muted = !muted;
            setMuted(!muted);
        }
    };

    const handleMidi = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (midiLoading) return;
        setMidiLoading(true);
        try {
            const { blob, filename } = await downloadStemMidi(trackId, stemName);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('MIDI export failed:', err);
        } finally {
            setMidiLoading(false);
        }
    };

    return (
        <div
            onClick={onToggle}
            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border-l-4 bg-white/5 hover:bg-white/10 ${isSelected ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                }`}
            style={{ borderLeftColor: color }}
        >
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => { }}
                className="w-4 h-4 cursor-pointer accent-[#00d4ff]"
            />

            <div className="flex-1 capitalize font-bold text-sm text-gray-200">
                {stemName}
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={toggleMute}
                    className="p-1.5 rounded hover:bg-black/30 transition-colors text-gray-400 hover:text-white"
                >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                    onClick={handleMidi}
                    disabled={midiLoading}
                    title="Export stem to MIDI (basic-pitch)"
                    className="p-1.5 rounded hover:bg-black/30 transition-colors text-gray-400 hover:text-[#00ff88] disabled:opacity-40"
                >
                    <Music size={14} className={midiLoading ? 'animate-pulse' : ''} />
                </button>
                <button
                    onClick={togglePlay}
                    className="p-1.5 rounded bg-black/30 hover:bg-black/50 transition-colors text-white"
                >
                    {playing ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
            </div>
        </div>
    );
}
