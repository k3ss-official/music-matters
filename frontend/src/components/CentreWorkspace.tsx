import React from 'react';
import type { TrackDetailResponse } from '../types';
import { WaveformCanvas } from './WaveformCanvas';
import { LoopEditorToolbar } from './LoopEditorToolbar';
import { getTrackAudioUrl, createCustomLoop, getSmartPhrases, type SmartPhrase } from '../services/api';
import { Zap, Loader2, AlertCircle, X } from 'lucide-react';

interface CentreWorkspaceProps {
    trackId: string | null;
    trackDetail: TrackDetailResponse | null;
    regionStart: number;
    regionEnd: number;
    onUpdateRegion: (start: number, end: number) => void;
    wavesurferRef?: React.MutableRefObject<any>;
    regionsRef?: React.MutableRefObject<any>;
    waveformReady: boolean;
    setWaveformReady: (ready: boolean) => void;
    errorMsg?: string | null;
}

export function CentreWorkspace({
    trackId,
    trackDetail,
    regionStart,
    regionEnd,
    onUpdateRegion,
    wavesurferRef,
    regionsRef,
    waveformReady,
    setWaveformReady,
    errorMsg
}: CentreWorkspaceProps) {
    const [previewing, setPreviewing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [snapEnabled, setSnapEnabled] = React.useState(true);
    const [smartPhrases, setSmartPhrases] = React.useState<SmartPhrase[]>([]);
    const [loadingPhrases, setLoadingPhrases] = React.useState(false);
    const [phrasesError, setPhrasesError] = React.useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = React.useState(false);

    React.useEffect(() => {
        if (trackId && waveformReady) {
            setPhrasesError(null);
            setLoadingPhrases(true);
            getSmartPhrases(trackId)
                .then(resp => setSmartPhrases(resp.phrases || []))
                .catch((err: any) => {
                    setSmartPhrases([]);
                    setPhrasesError(err?.response?.data?.detail || err?.message || 'Failed to load phrases');
                })
                .finally(() => setLoadingPhrases(false));
        }
        if (!trackId) {
            setSmartPhrases([]);
            setPhrasesError(null);
        }
    }, [trackId, waveformReady]);

    const handleSmartPhrase = (phrase: SmartPhrase) => {
        onUpdateRegion(phrase.start_time, phrase.end_time);
    };

    const getPhraseLabel = (type: string) => {
        const labels: Record<string, string> = {
            intro: 'Intro',
            outro: 'Outro',
            verse: 'Verse',
            chorus: 'Chorus',
            drop: 'Drop',
            bridge: 'Bridge',
            breakdown: 'Breakdown',
            build: 'Build',
            'pre-chorus': 'Pre-Ch',
            hook: 'Hook',
            instrumental: 'Inst',
        };
        return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
    };

    const getPhraseColor = (type: string) => {
        const colors: Record<string, string> = {
            intro: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            outro: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
            verse: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
            chorus: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
            drop: 'bg-red-500/20 text-red-400 border-red-500/30',
            bridge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            breakdown: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            build: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
            'pre-chorus': 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
            hook: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
            instrumental: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        };
        return colors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    };

    const handleSaveLoop = async () => {
        if (!trackId || saving) return;
        setSaving(true);
        setSaveSuccess(false);
        try {
            const allStems = trackDetail?.stems || ['drums', 'bass', 'other', 'vocals'];
            await createCustomLoop(trackId, regionStart, regionEnd, allStems);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (err) {
            console.error('Failed to save loop:', err);
        } finally {
            setSaving(false);
        }
    };

    React.useEffect(() => {
        // Sync previewing state with actual wavesurfer play state, and bound checking
        if (previewing && wavesurferRef?.current) {
            const ws = wavesurferRef.current;
            ws.play(regionStart, regionEnd);

            const process = () => {
                if (ws.getCurrentTime() >= regionEnd - 0.05) {
                    ws.play(regionStart, regionEnd);
                }
            };
            ws.on('audioprocess', process);
            return () => {
                ws.un('audioprocess', process);
                ws.pause();
            };
        }
    }, [previewing, regionStart, regionEnd, wavesurferRef]);

    if (!trackId) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#12121a] border border-white/5 rounded-xl shadow-2xl overflow-hidden p-8 text-center gap-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
                <div>
                    <h2 className="text-xl font-bold text-gray-300 mb-2">No Track Selected</h2>
                    <p className="text-sm opacity-60">Upload a file or select a track from your library to begin editing.</p>
                </div>
            </div>
        );
    }

    const audioUrl = getTrackAudioUrl(trackId);

    return (
        <div className="h-full flex flex-col bg-[#12121a] border border-white/5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Top Bar */}
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white truncate max-w-xl mb-1">
                        {trackDetail ? trackDetail.title : 'Loading Track...'}
                    </h2>
                    <p className="text-sm text-gray-500 font-medium">
                        {trackDetail ? trackDetail.artist || 'Unknown Artist' : '---'}
                    </p>
                </div>
            </div>

            {/* Main Waveform Area */}
            <div className="flex-1 p-6 flex flex-col bg-black/20">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#00d4ff]">Slice Workspace</h3>
                        {smartPhrases.length > 0 && (
                            <div className="flex items-center gap-1">
                                <Zap size={12} className="text-yellow-400" />
                                <span className="text-[10px] text-yellow-400 font-medium uppercase">Smart</span>
                            </div>
                        )}
                    </div>
                    {/* Waveform tools */}
                    <div className="flex items-center gap-1">
                        {['Zoom In', 'Zoom Out', 'Fit'].map(lbl => (
                            <button key={lbl} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[10px] text-gray-400 font-bold uppercase rounded border border-white/5">
                                {lbl}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Smart Phrases */}
                {(loadingPhrases || smartPhrases.length > 0 || phrasesError) && (
                    <div className="mb-4">
                        {/* Loading skeleton */}
                        {loadingPhrases && (
                            <div className="flex flex-wrap gap-2">
                                {[1,2,3,4].map(i => <div key={i} className="h-7 w-16 rounded-full bg-white/5 animate-pulse" />)}
                            </div>
                        )}
                        {/* Error */}
                        {phrasesError && !loadingPhrases && (
                            <div className="flex items-center gap-2 text-[10px] text-[#ff3b5c]/80">
                                <AlertCircle size={11} />
                                <span>{phrasesError}</span>
                                <button onClick={() => setPhrasesError(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
                            </div>
                        )}
                        {/* Phrase buttons */}
                        {!loadingPhrases && smartPhrases.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {smartPhrases.map((phrase, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSmartPhrase(phrase)}
                                        title={`Bar ${phrase.start_bar} · ${phrase.bar_count} bars · confidence ${Math.round((phrase.confidence ?? 0) * 100)}%`}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all hover:scale-105 active:scale-95 ${getPhraseColor(phrase.type)}`}
                                    >
                                        <Zap size={10} />
                                        {getPhraseLabel(phrase.type)} ({phrase.bar_count}b)
                                        {phrase.confidence !== undefined && (
                                            <span className="ml-0.5 opacity-55 font-mono">{Math.round(phrase.confidence * 100)}%</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 bg-[#0a0a0f] border border-white/5 rounded-lg overflow-hidden shadow-inner relative flex flex-col justify-center min-h-[220px]">
                    <WaveformCanvas
                        audioUrl={audioUrl}
                        wavesurferRef={wavesurferRef}
                        regionsRef={regionsRef}
                        onReady={() => setWaveformReady(true)}
                        onRegionUpdate={onUpdateRegion}
                        downbeats={trackDetail?.metadata?.beat_grid?.downbeats || []}
                        bpm={trackDetail?.bpm || null}
                        snapEnabled={snapEnabled}
                    />
                </div>
            </div>

            {/* Loop Editor Toolbar */}
            {waveformReady && (
                <LoopEditorToolbar
                    regionStart={regionStart}
                    regionEnd={regionEnd}
                    bpm={trackDetail?.bpm || null}
                    onUpdateRegion={onUpdateRegion}
                    onPreviewToggle={() => setPreviewing(!previewing)}
                    onSaveLoop={handleSaveLoop}
                    previewing={previewing}
                    saving={saving}
                    snapEnabled={snapEnabled}
                    onSnapToggle={() => setSnapEnabled(!snapEnabled)}
                />
            )}
        </div>
    );
}
