import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';

interface WaveformCanvasProps {
    audioUrl: string | null;
    onReady?: (duration: number) => void;
    onError?: (error: Error, url: string) => void;
    onRegionUpdate?: (start: number, end: number) => void;
    wavesurferRef?: React.MutableRefObject<WaveSurfer | null>;
    regionsRef?: React.MutableRefObject<any>;
}

export function WaveformCanvas({
    audioUrl,
    onReady,
    onError,
    onRegionUpdate,
    wavesurferRef,
    regionsRef,
}: WaveformCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current || !timelineRef.current || !audioUrl) return;

        setErrorMsg(null);
        setLoading(true);

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(139, 92, 246, 0.4)', // #8b5cf6 at 40%
            progressColor: '#8b5cf6',
            cursorColor: '#00d4ff',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 120,
            normalize: true,
            plugins: [
                TimelinePlugin.create({
                    container: timelineRef.current,
                    height: 20,
                    timeInterval: 0.2,
                    primaryLabelInterval: 5,
                    style: {
                        fontSize: '10px',
                        color: '#666',
                    },
                }),
            ],
        });

        const wsRegions = ws.registerPlugin(RegionsPlugin.create());

        if (wavesurferRef) wavesurferRef.current = ws;
        if (regionsRef) regionsRef.current = wsRegions;

        ws.on('ready', () => {
            setLoading(false);
            const duration = ws.getDuration();

            // Default region
            const mid = duration / 2;
            wsRegions.addRegion({
                start: mid,
                end: mid + 8,
                color: 'rgba(0, 212, 255, 0.25)', // #00d4ff at 25%
                drag: true,
                resize: true,
            });

            if (onRegionUpdate) onRegionUpdate(mid, mid + 8);
            if (onReady) onReady(duration);
        });

        wsRegions.on('region-updated', (region: any) => {
            if (onRegionUpdate) onRegionUpdate(region.start, region.end);
        });

        ws.on('error', (err: any) => {
            setLoading(false);
            const msg = err?.message || 'Failed to load audio URL';
            setErrorMsg(msg);
            if (onError) onError(new Error(msg), audioUrl);
        });

        try {
            ws.load(audioUrl);
        } catch (err: any) {
            setLoading(false);
            setErrorMsg(err.message);
            if (onError) onError(err, audioUrl);
        }

        return () => {
            ws.destroy();
        };
    }, [audioUrl]);

    return (
        <div className="relative w-full rounded bg-[#12121a] overflow-hidden">
            {audioUrl === null ? (
                <div className="h-[140px] flex items-center justify-center text-gray-500">
                    No track selected
                </div>
            ) : (
                <>
                    {errorMsg && (
                        <div className="absolute top-0 left-0 right-0 z-10 bg-[#ff3b5c] text-white p-2 text-sm text-center">
                            Failed to load audio: {errorMsg} ({audioUrl})
                        </div>
                    )}
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#12121a]/80 backdrop-blur-sm">
                            <div className="animate-pulse text-[#00d4ff] font-mono text-sm">Loading Waveform...</div>
                        </div>
                    )}

                    <div ref={timelineRef} className="w-full bg-[#0a0a0f] border-b border-white/5" />
                    <div ref={containerRef} className="w-full" />
                </>
            )}
        </div>
    );
}
