import React from 'react';
import type { TrackDetailResponse } from '../types';
import { WaveformCanvas } from './WaveformCanvas';
import { LoopEditorToolbar } from './LoopEditorToolbar';
import { getTrackAudioUrl } from '../services/api';

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
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#00d4ff]">Slice Workspace</h3>
                    {/* Waveform tools */}
                    <div className="flex items-center gap-1">
                        {['Zoom In', 'Zoom Out', 'Fit'].map(lbl => (
                            <button key={lbl} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[10px] text-gray-400 font-bold uppercase rounded border border-white/5">
                                {lbl}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 bg-[#0a0a0f] border border-white/5 rounded-lg overflow-hidden shadow-inner relative flex flex-col justify-center min-h-[220px]">
                    <WaveformCanvas
                        audioUrl={audioUrl}
                        wavesurferRef={wavesurferRef}
                        regionsRef={regionsRef}
                        onReady={() => setWaveformReady(true)}
                        onRegionUpdate={onUpdateRegion}
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
                    previewing={previewing}
                />
            )}
        </div>
    );
}
