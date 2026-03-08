import React, { useEffect, useRef, useState, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import type { TrackSummary, TrackDetailResponse, LoopPreview } from '../types';
import * as api from '../services/api';

interface TrackWorkspaceProps {
    trackId: string;
    onClose: () => void;
}

export function TrackWorkspace({ trackId, onClose }: TrackWorkspaceProps) {
    const [trackDetail, setTrackDetail] = useState<TrackDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Custom Selection State
    const [regionStart, setRegionStart] = useState<number>(0);
    const [regionEnd, setRegionEnd] = useState<number>(0);
    const [selectedStems, setSelectedStems] = useState<string[]>([]);
    const [extracting, setExtracting] = useState(false);
    const [customLoops, setCustomLoops] = useState<LoopPreview[]>([]);

    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<any>(null);

    // Load Track Data
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const data = await api.getTrackDetail(trackId);
                setTrackDetail(data);

                // Find the original audio path
                if (data.metadata?.source_path) {
                    // source_path is absolute, but serve_audio expects relative to library
                    // or we can just hope it's relative in metadata
                    const relPath = data.metadata.source_path.split('Music Matters/')[1] || data.metadata.source_path;
                    setAudioUrl(`/api/audio/${relPath}`);
                } else if (data.metadata?.original_filename) {
                    setAudioUrl(`/api/audio/downloads/${encodeURIComponent(data.metadata.original_filename)}`);
                } else {
                    const safeName = (data.title + (data.artist ? ` - ${data.artist}` : '')).replace(/[/\\?%*:|"<>]/g, '-');
                    setAudioUrl(`/api/audio/downloads/${encodeURIComponent(safeName)}.wav`);
                }
            } catch (err) {
                console.error('Failed to load track details:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [trackId]);

    // Init WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !audioUrl) return;

        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
        }

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(139, 92, 246, 0.4)', // purple-ish
            progressColor: '#8b5cf6',
            cursorColor: '#fff',
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 120,
            normalize: true,
        });

        // Initialize Regions Plugin
        const wsRegions = ws.registerPlugin(RegionsPlugin.create());
        regionsRef.current = wsRegions;

        ws.on('ready', () => {
            // Create an initial region for 4 seconds in the middle
            const duration = ws.getDuration();
            const mid = duration / 2;
            wsRegions.addRegion({
                start: mid,
                end: mid + 8, // ~8 seconds default region
                color: 'rgba(0, 255, 136, 0.3)',
                drag: true,
                resize: true,
            });

            setRegionStart(mid);
            setRegionEnd(mid + 8);
        });

        wsRegions.on('region-updated', (region: any) => {
            setRegionStart(region.start);
            setRegionEnd(region.end);
        });

        ws.load(audioUrl);
        wavesurferRef.current = ws;

        return () => {
            ws.destroy();
        };
    }, [audioUrl]);

    const toggleStem = (stem: string) => {
        setSelectedStems((prev) =>
            prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]
        );
    };

    const handleExtractCustom = async () => {
        try {
            setExtracting(true);
            const newLoop = await api.createCustomLoop(trackId, regionStart, regionEnd, selectedStems);
            setCustomLoops(prev => [...prev, newLoop]);
        } catch (e) {
            console.error(e);
            alert('Extraction failed. Check console.');
        } finally {
            setExtracting(false);
        }
    };

    const ALL_STEMS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];

    if (loading || !trackDetail) {
        return <div className="p-8 text-center text-gray-400">Loading Workspace...</div>;
    }

    return (
        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-6 h-full flex flex-col shadow-2xl overflow-hidden relative">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
            >
                ✕ Close
            </button>

            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400 mb-2">
                Track Editor
            </h2>
            <div className="mb-6 flex gap-4 text-sm text-gray-400">
                <div><strong>Title:</strong> {trackDetail.title}</div>
                <div><strong>BPM:</strong> {trackDetail.bpm?.toFixed(2) || '???'}</div>
                <div><strong>Key:</strong> {trackDetail.musical_key || '???'}</div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pr-4">
                {/* Waveform Area */}
                <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Manual Loop Selection</h3>
                    <p className="text-xs text-gray-400 mb-2">Drag the highlighted region to select timestamps to extract</p>
                    <div className="bg-black/50 p-4 rounded-xl shadow-inner border border-gray-800">
                        <div ref={containerRef} className="w-full" />

                        <div className="flex items-center justify-between mt-4">
                            <div className="flex gap-2 text-sm font-mono text-gray-400">
                                <div className="bg-gray-800 px-3 py-1 rounded">Start: {regionStart.toFixed(2)}s</div>
                                <div className="bg-gray-800 px-3 py-1 rounded">End: {regionEnd.toFixed(2)}s</div>
                                <div className="bg-gray-800 px-3 py-1 rounded text-teal-400">Length: {(regionEnd - regionStart).toFixed(2)}s</div>
                            </div>

                            <button
                                onClick={() => wavesurferRef.current?.playPause()}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full font-bold transition shadow-[0_0_15px_rgba(147,51,234,0.5)]"
                            >
                                Play/Pause
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stem Options */}
                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-2">Export Configuration</h3>
                    <p className="text-xs text-gray-400 mb-4">Select exactly which stems to include (Requires Stems Done)</p>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                        {ALL_STEMS.map(stem => {
                            const isSelected = selectedStems.includes(stem);
                            return (
                                <button
                                    key={stem}
                                    onClick={() => toggleStem(stem)}
                                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${isSelected
                                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                                        }`}
                                >
                                    <span className="capitalize font-bold">{stem}</span>
                                </button>
                            )
                        })}
                    </div>

                    <button
                        onClick={handleExtractCustom}
                        disabled={extracting}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-lg py-4 rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-50"
                    >
                        {extracting ? '🔪 Slicing & Processing Audio...' : '✂️ Extract Custom Loop to Library'}
                    </button>
                </div>

                {/* Render Generated Custom Loops */}
                {customLoops.length > 0 && (
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-4">Extracted Loops (Ready for DAW)</h3>
                        <div className="space-y-3">
                            {customLoops.map((loop) => (
                                <div key={loop.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between border border-emerald-500/30">
                                    <div>
                                        <h4 className="font-bold text-white">{loop.label}</h4>
                                        <p className="text-sm text-emerald-400 font-mono text-xs">ID: {loop.id}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const audio = new Audio(`/api/audio/loops/${trackDetail.track_id}/${loop.id}.wav`);
                                                audio.play();
                                            }}
                                            className="p-2 bg-purple-600/20 text-purple-400 rounded hover:bg-purple-600/40"
                                        >
                                            Listen
                                        </button>
                                        <a
                                            href={`/api/audio/loops/${trackDetail.track_id}/${loop.id}.wav`}
                                            download={`${loop.id}.wav`}
                                            className="px-4 py-2 bg-emerald-500 text-black font-bold rounded hover:bg-emerald-400 transition"
                                        >
                                            Download
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
