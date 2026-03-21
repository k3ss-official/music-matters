/**
 * WaveformCanvas — production-grade WaveSurfer v7 waveform with:
 *  - Correct bidirectional region sync (React state ↔ WaveSurfer region handle)
 *  - Drag-to-create new region anywhere on waveform
 *  - BPM quantize grid drawn on canvas
 *  - Downbeat snap (within threshold)
 *  - Timeline ruler (TimelinePlugin)
 *  - Exposes zoom controls via ref
 *  - Correct WaveSurfer v7 API (no play(start,end) — use setTime + looping logic)
 */
import React, {
    useEffect,
    useRef,
    useState,
    useCallback,
    useImperativeHandle,
    forwardRef,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';

// ─── Public handle exposed via ref ────────────────────────────────────────────
export interface WaveformHandle {
    play: () => void;
    pause: () => void;
    stop: () => void;
    playRegion: () => void;
    stopRegion: () => void;
    seek: (seconds: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomFit: () => void;
    setVolume: (v: number) => void;
    getDuration: () => number;
    isPlaying: () => boolean;
    /** Force the WaveSurfer region to match new times (for toolbar nudges) */
    syncRegion: (start: number, end: number) => void;
}

export interface WaveformCanvasProps {
    audioUrl: string | null;
    onReady?: (duration: number) => void;
    onError?: (error: Error, url: string) => void;
    /** Called whenever the region changes (drag, resize, snap, toolbar nudge) */
    onRegionUpdate?: (start: number, end: number) => void;
    /** Called on every audioprocess tick — passes current playhead position */
    onTimeUpdate?: (currentTime: number) => void;
    /** Called when play/pause state changes */
    onPlayStateChange?: (playing: boolean) => void;
    wavesurferRef?: React.MutableRefObject<WaveSurfer | null>;
    regionsRef?: React.MutableRefObject<any>;
    /** Downbeat timestamps for snap-to-grid and grid overlay (real bar boundaries from allin1) */
    downbeats?: number[];
    /** Chord timeline from allin1 for overlay display */
    chords?: Array<{ start: number; end: number; chord: string }>;
    /** BPM for quantize grid overlay and bar-snap */
    bpm?: number | null;
    /** Whether beat-snap is enabled */
    snapEnabled?: boolean;
    /** Current region start (controlled — updates region handle if changed externally) */
    regionStart?: number;
    /** Current region end (controlled) */
    regionEnd?: number;
}

// How close (seconds) to a beat before we snap
const SNAP_THRESHOLD_S = 0.08;

// Region visual style
const REGION_COLOR = 'rgba(0, 212, 255, 0.18)';
const REGION_BORDER = 'rgba(0, 212, 255, 0.9)';

function buildBeatGrid(bpm: number, duration: number): number[] {
    const beatDuration = 60 / bpm;
    const beats: number[] = [];
    for (let t = 0; t < duration; t += beatDuration) {
        beats.push(t);
    }
    return beats;
}

function snapToNearest(time: number, grid: number[], threshold: number): number {
    if (!grid.length) return time;
    let best = grid[0];
    let bestDist = Math.abs(time - best);
    for (const g of grid) {
        const d = Math.abs(time - g);
        if (d < bestDist) {
            bestDist = d;
            best = g;
        }
    }
    return bestDist <= threshold ? best : time;
}

const WaveformCanvas = forwardRef<WaveformHandle, WaveformCanvasProps>(
    function WaveformCanvas(
        {
            audioUrl,
            onReady,
            onError,
            onRegionUpdate,
            onTimeUpdate,
            onPlayStateChange,
            wavesurferRef,
            regionsRef,
            downbeats = [],
            chords = [],
            bpm = null,
            snapEnabled = true,
            regionStart,
            regionEnd,
        },
        ref
    ) {
        const containerRef = useRef<HTMLDivElement>(null);
        const timelineRef = useRef<HTMLDivElement>(null);
        const gridCanvasRef = useRef<HTMLCanvasElement>(null);

        const [loading, setLoading] = useState(false);
        const [errorMsg, setErrorMsg] = useState<string | null>(null);
        const [duration, setDuration] = useState(0);
        const [zoom, setZoom] = useState(50);

        // Internal refs to avoid stale closures
        const wsRef = useRef<WaveSurfer | null>(null);
        const wsRegionsRef = useRef<any>(null);
        const activeRegionRef = useRef<any>(null);
        const snapEnabledRef = useRef(snapEnabled);
        const downbeatsRef = useRef(downbeats);
        const chordsRef = useRef(chords);
        const bpmRef = useRef(bpm);
        const regionLoopRef = useRef(false); // whether we're looping the region
        const rafRef = useRef<number | null>(null);

        snapEnabledRef.current = snapEnabled;
        downbeatsRef.current = downbeats;
        chordsRef.current = chords;
        bpmRef.current = bpm;

        // ── Snap helper ───────────────────────────────────────────────────────
        const snapTime = useCallback((time: number): number => {
            if (!snapEnabledRef.current) return time;
            // Build grid from downbeats + BPM beats
            const dur = wsRef.current?.getDuration() || 0;
            let grid: number[] = [...downbeatsRef.current];
            if (bpmRef.current && dur > 0) {
                grid = [...grid, ...buildBeatGrid(bpmRef.current, dur)];
                // dedupe
                grid = [...new Set(grid.map(t => parseFloat(t.toFixed(4))))].sort((a, b) => a - b);
            }
            return snapToNearest(time, grid, SNAP_THRESHOLD_S);
        }, []);

        // ── Draw BPM grid + real downbeats overlay ────────────────────────────
        const drawGrid = useCallback(() => {
            const canvas = gridCanvasRef.current;
            const ws = wsRef.current;
            if (!canvas || !ws) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            canvas.width = W;
            canvas.height = H;
            ctx.clearRect(0, 0, W, H);

            const dur = ws.getDuration();
            if (!dur) return;

            // 1. BPM-estimated beats (faint, as a background grid)
            if (bpmRef.current) {
                const beatDur = 60 / bpmRef.current;
                let beat = 0;
                let beatIdx = 0;
                while (beat < dur) {
                    const x = Math.round((beat / dur) * W);
                    const isBar = beatIdx % 4 === 0;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, H);
                    ctx.strokeStyle = isBar
                        ? 'rgba(0,212,255,0.12)'
                        : 'rgba(255,255,255,0.04)';
                    ctx.lineWidth = isBar ? 1 : 0.5;
                    ctx.stroke();
                    beat += beatDur;
                    beatIdx++;
                }
            }

            // 2. Real downbeats from allin1 (bright — actual bar boundaries)
            if (downbeatsRef.current.length > 0) {
                for (const db of downbeatsRef.current) {
                    if (db < 0 || db > dur) continue;
                    const x = Math.round((db / dur) * W);
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, H);
                    ctx.strokeStyle = 'rgba(0,212,255,0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }, []);

        // ── Init WaveSurfer ───────────────────────────────────────────────────
        useEffect(() => {
            if (!containerRef.current || !timelineRef.current || !audioUrl) return;

            // Clean up previous instance
            if (wsRef.current) {
                wsRef.current.destroy();
                wsRef.current = null;
                activeRegionRef.current = null;
            }

            setErrorMsg(null);
            setLoading(true);
            setDuration(0);

            const ws = WaveSurfer.create({
                container: containerRef.current,
                waveColor: 'rgba(139, 92, 246, 0.45)',
                progressColor: '#8b5cf6',
                cursorColor: '#00d4ff',
                cursorWidth: 2,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                height: 110,
                normalize: true,
                interact: true,
                plugins: [
                    TimelinePlugin.create({
                        container: timelineRef.current,
                        height: 18,
                        timeInterval: 1,
                        primaryLabelInterval: 10,
                        secondaryLabelInterval: 5,
                        style: { fontSize: '10px', color: '#555' },
                    }),
                ],
            });

            const wsRegions = ws.registerPlugin(RegionsPlugin.create());

            wsRef.current = ws;
            wsRegionsRef.current = wsRegions;
            if (wavesurferRef) wavesurferRef.current = ws;
            if (regionsRef) regionsRef.current = wsRegions;

            // ── Ready ────────────────────────────────────────────────────────
            ws.on('ready', () => {
                setLoading(false);
                const dur = ws.getDuration();
                setDuration(dur);
                drawGrid();

                // Create initial region (8s centred around 25% mark, or whole track if short)
                const defaultStart = dur > 16 ? dur * 0.1 : 0;
                const defaultEnd = Math.min(defaultStart + 8, dur);
                const startSnapped = snapEnabledRef.current
                    ? snapTime(defaultStart)
                    : defaultStart;
                const endSnapped = snapEnabledRef.current
                    ? snapTime(defaultEnd)
                    : defaultEnd;

                const region = wsRegions.addRegion({
                    start: startSnapped,
                    end: endSnapped,
                    color: REGION_COLOR,
                    drag: true,
                    resize: true,
                    minLength: 0.1,
                });
                activeRegionRef.current = region;

                if (onRegionUpdate) onRegionUpdate(startSnapped, endSnapped);
                if (onReady) onReady(dur);
            });

            // ── Region events ────────────────────────────────────────────────
            // region-updated fires on every drag/resize tick
            wsRegions.on('region-updated', (region: any) => {
                const s = snapEnabledRef.current ? snapTime(region.start) : region.start;
                const e = snapEnabledRef.current ? snapTime(region.end) : region.end;
                // Only update region handle if snap changed the value meaningfully
                if (Math.abs(s - region.start) > 0.001 || Math.abs(e - region.end) > 0.001) {
                    region.setOptions({ start: s, end: e });
                }
                activeRegionRef.current = region;
                if (onRegionUpdate) onRegionUpdate(s, e);
            });

            // Allow dragging anywhere to create a new region (delete old first)
            wsRegions.on('region-created', (region: any) => {
                // Remove any existing region
                if (activeRegionRef.current && activeRegionRef.current.id !== region.id) {
                    activeRegionRef.current.remove();
                }
                // Style it
                region.setOptions({
                    color: REGION_COLOR,
                    drag: true,
                    resize: true,
                    minLength: 0.1,
                });
                activeRegionRef.current = region;
                const s = snapEnabledRef.current ? snapTime(region.start) : region.start;
                const e = snapEnabledRef.current ? snapTime(region.end) : region.end;
                if (onRegionUpdate) onRegionUpdate(s, e);
            });

            // ── Playback events ───────────────────────────────────────────────
            ws.on('audioprocess', (currentTime: number) => {
                if (onTimeUpdate) onTimeUpdate(currentTime);
                // Loop region playback
                if (regionLoopRef.current && activeRegionRef.current) {
                    if (currentTime >= activeRegionRef.current.end - 0.05) {
                        ws.setTime(activeRegionRef.current.start);
                    }
                }
            });

            ws.on('play', () => { if (onPlayStateChange) onPlayStateChange(true); });
            ws.on('pause', () => { if (onPlayStateChange) onPlayStateChange(false); });
            ws.on('finish', () => {
                if (regionLoopRef.current && activeRegionRef.current) {
                    ws.setTime(activeRegionRef.current.start);
                    ws.play();
                } else {
                    if (onPlayStateChange) onPlayStateChange(false);
                }
            });

            ws.on('error', (err: any) => {
                setLoading(false);
                const msg = typeof err === 'string' ? err : err?.message || 'Failed to load audio';
                setErrorMsg(msg);
                if (onError) onError(new Error(msg), audioUrl);
            });

            ws.on('zoom', () => { drawGrid(); });
            ws.on('redraw', () => { drawGrid(); });

            try {
                ws.load(audioUrl);
            } catch (err: any) {
                setLoading(false);
                setErrorMsg(err.message);
                if (onError) onError(err, audioUrl);
            }

            return () => {
                regionLoopRef.current = false;
                ws.destroy();
                wsRef.current = null;
                activeRegionRef.current = null;
            };
        }, [audioUrl]);

        // ── Re-draw grid when BPM, downbeats, or duration changes ────────────
        useEffect(() => {
            drawGrid();
        }, [bpm, downbeats, duration, drawGrid]);

        // ── Bidirectional sync: when toolbar changes region, push to WaveSurfer ─
        useEffect(() => {
            const region = activeRegionRef.current;
            if (!region) return;
            if (regionStart === undefined || regionEnd === undefined) return;
            const s = regionStart;
            const e = regionEnd;
            if (
                Math.abs(region.start - s) > 0.001 ||
                Math.abs(region.end - e) > 0.001
            ) {
                region.setOptions({ start: s, end: e });
            }
        }, [regionStart, regionEnd]);

        // ── Zoom sync ─────────────────────────────────────────────────────────
        useEffect(() => {
            if (wsRef.current) {
                wsRef.current.zoom(zoom);
                setTimeout(drawGrid, 50);
            }
        }, [zoom, drawGrid]);

        // ── Imperative handle ─────────────────────────────────────────────────
        useImperativeHandle(ref, () => ({
            play: () => { wsRef.current?.play(); },
            pause: () => { wsRef.current?.pause(); },
            stop: () => {
                const ws = wsRef.current;
                if (!ws) return;
                ws.pause();
                ws.setTime(0);
                regionLoopRef.current = false;
            },
            playRegion: () => {
                const ws = wsRef.current;
                const region = activeRegionRef.current;
                if (!ws || !region) return;
                regionLoopRef.current = true;
                ws.setTime(region.start);
                ws.play();
            },
            stopRegion: () => {
                const ws = wsRef.current;
                if (!ws) return;
                regionLoopRef.current = false;
                ws.pause();
                if (activeRegionRef.current) {
                    ws.setTime(activeRegionRef.current.start);
                }
            },
            seek: (seconds: number) => {
                wsRef.current?.setTime(seconds);
            },
            zoomIn: () => setZoom(z => Math.min(z * 1.6, 1000)),
            zoomOut: () => setZoom(z => Math.max(z / 1.6, 10)),
            zoomFit: () => setZoom(50),
            setVolume: (v: number) => { wsRef.current?.setVolume(v); },
            getDuration: () => wsRef.current?.getDuration() ?? 0,
            isPlaying: () => wsRef.current?.isPlaying() ?? false,
            syncRegion: (start: number, end: number) => {
                const region = activeRegionRef.current;
                if (!region) return;
                region.setOptions({ start, end });
                if (onRegionUpdate) onRegionUpdate(start, end);
            },
        }));

        return (
            <div className="relative w-full rounded-lg bg-[#08080f] overflow-hidden select-none">
                {audioUrl === null ? (
                    <div className="h-[150px] flex items-center justify-center text-gray-600 text-sm">
                        No track loaded
                    </div>
                ) : (
                    <>
                        {/* Error banner */}
                        {errorMsg && (
                            <div className="absolute top-0 left-0 right-0 z-20 bg-[#ff3b5c]/90 text-white px-3 py-2 text-xs text-center font-bold">
                                {errorMsg}
                            </div>
                        )}

                        {/* Loading overlay */}
                        {loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#08080f]/80 backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-6 h-6 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[#00d4ff] font-mono text-xs tracking-widest uppercase">
                                        Decoding audio...
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* BPM grid overlay canvas */}
                        <canvas
                            ref={gridCanvasRef}
                            className="absolute inset-0 z-[1] pointer-events-none w-full h-full"
                            style={{ top: 18 }} // offset below timeline
                        />

                        {/* Timeline ruler */}
                        <div
                            ref={timelineRef}
                            className="w-full bg-[#0d0d18] border-b border-white/5"
                        />

                        {/* Waveform */}
                        <div ref={containerRef} className="w-full relative z-[2]" />

                        {/* Chord timeline — proportional colour bar */}
                        {chords.length > 0 && duration > 0 && (
                            <div className="relative w-full h-[18px] bg-[#08080f] flex overflow-hidden">
                                {chords.map((c, i) => {
                                    const left = (c.start / duration) * 100;
                                    const width = ((c.end - c.start) / duration) * 100;
                                    return (
                                        <div
                                            key={i}
                                            title={c.chord}
                                            className="absolute h-full flex items-center justify-center overflow-hidden"
                                            style={{
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                background: 'rgba(139,92,246,0.15)',
                                                borderRight: '1px solid rgba(139,92,246,0.2)',
                                            }}
                                        >
                                            <span className="text-[9px] font-mono text-purple-300/70 truncate px-0.5 select-none">
                                                {c.chord}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }
);

export { WaveformCanvas };
export default WaveformCanvas;
