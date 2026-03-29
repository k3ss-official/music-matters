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
import MinimapPlugin from 'wavesurfer.js/dist/plugins/minimap.js';

// Heights (px) for layout coordinate calculations
const MINIMAP_H = 48;
const TIMELINE_H = 18;

// ─── Public handle exposed via ref ────────────────────────────────────────────
export interface WaveformHandle {
    play: () => void;
    pause: () => void;
    stop: () => void;
    playRegion: () => void;
    stopRegion: () => void;
    /** Directly set the internal loop flag (keeps regionLoopRef in sync with React isLooping state) */
    setLooping: (enabled: boolean) => void;
    seek: (seconds: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomFit: () => void;
    setVolume: (v: number) => void;
    getDuration: () => number;
    isPlaying: () => boolean;
    /** Force the WaveSurfer region to match new times (for toolbar nudges) */
    syncRegion: (start: number, end: number) => void;
    /** Zoom and scroll to show only the region between start and end */
    zoomToRegion: (start: number, end: number) => void;
    /** Zoom to fit region in center of screen */
    zoomToFitRegion: (start: number, end: number) => void;
    /** Current playhead position in seconds */
    getCurrentTime: () => number;
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
    /** Phrase boundary times for snap grid (e.g. from allin1 smart phrases) */
    phraseMarkers?: number[];
    /** Whether loop mode is active — controls region dim overlay visibility */
    isLooping?: boolean;
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
            phraseMarkers = [],
            isLooping = false,
        },
        ref
    ) {
        const containerRef = useRef<HTMLDivElement>(null);
        const timelineRef = useRef<HTMLDivElement>(null);
        const minimapRef = useRef<HTMLDivElement>(null);
        const gridCanvasRef = useRef<HTMLCanvasElement>(null);
        const outerRef = useRef<HTMLDivElement>(null);

        const [loading, setLoading] = useState(false);
        const [errorMsg, setErrorMsg] = useState<string | null>(null);
        const [duration, setDuration] = useState(0);
        const [zoom, setZoom] = useState(50);
        // Visible time window (updated on WaveSurfer scroll events)
        const [visibleStart, setVisibleStart] = useState(0);
        const visibleStartRef = useRef(0);
        const zoomRef = useRef(50);
        // Drag state for IN/OUT markers
        const draggingMarker = useRef<'IN' | 'OUT' | null>(null);

        // Internal refs to avoid stale closures
        const wsRef = useRef<WaveSurfer | null>(null);
        const wsRegionsRef = useRef<any>(null);
        const activeRegionRef = useRef<any>(null);
        const snapEnabledRef = useRef(snapEnabled);
        const downbeatsRef = useRef(downbeats);
        const chordsRef = useRef(chords);
        const bpmRef = useRef(bpm);
        const phraseMarkersRef = useRef(phraseMarkers);
        const regionLoopRef = useRef(false); // whether we're looping the region
        const rafRef = useRef<number | null>(null);
        // Alt key tracking for snap bypass
        const altHeldRef = useRef(false);

        snapEnabledRef.current = snapEnabled;
        downbeatsRef.current = downbeats;
        chordsRef.current = chords;
        bpmRef.current = bpm;
        phraseMarkersRef.current = phraseMarkers;
        zoomRef.current = zoom;

        // ── Snap helper ───────────────────────────────────────────────────────
        const snapTime = useCallback((time: number): number => {
            if (!snapEnabledRef.current || altHeldRef.current) return time;
            // Build grid from downbeats + BPM beats + phrase boundaries
            const dur = wsRef.current?.getDuration() || 0;
            let grid: number[] = [...downbeatsRef.current, ...phraseMarkersRef.current];
            if (bpmRef.current && dur > 0) {
                grid = [...grid, ...buildBeatGrid(bpmRef.current, dur)];
                // dedupe
                grid = [...new Set(grid.map(t => parseFloat(t.toFixed(4))))].sort((a, b) => a - b);
            }
            // Adaptive threshold: 4 pixels in seconds (tighter snap at high zoom)
            const threshold = Math.max(0.01, 4 / Math.max(zoomRef.current, 1));
            return snapToNearest(time, grid, threshold);
        }, []);

        // ── Alt key tracking for snap bypass ─────────────────────────────────
        useEffect(() => {
            const onDown = (e: KeyboardEvent) => { if (e.key === 'Alt') altHeldRef.current = true; };
            const onUp   = (e: KeyboardEvent) => { if (e.key === 'Alt') altHeldRef.current = false; };
            window.addEventListener('keydown', onDown);
            window.addEventListener('keyup',   onUp);
            return () => {
                window.removeEventListener('keydown', onDown);
                window.removeEventListener('keyup',   onUp);
            };
        }, []);

        // ── Mouse wheel = zoom ────────────────────────────────────────────────
        useEffect(() => {
            const el = outerRef.current;
            if (!el) return;
            const onWheel = (e: WheelEvent) => {
                e.preventDefault();
                // Standard convention: scroll up = zoom out (see more), scroll down = zoom in (see less)
                setZoom(z => e.deltaY < 0
                    ? Math.max(z / 1.15, 10)   // scroll up = zoom out
                    : Math.min(z * 1.15, 2000)); // scroll down = zoom in
            };
            el.addEventListener('wheel', onWheel, { passive: false });
            return () => el.removeEventListener('wheel', onWheel);
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
            if (!containerRef.current || !timelineRef.current || !minimapRef.current || !audioUrl) return;

            // Clean up previous instance
            if (wsRef.current) {
                wsRef.current.destroy();
                wsRef.current = null;
                activeRegionRef.current = null;
            }

            let destroyed = false;
            setErrorMsg(null);
            setLoading(true);
            setDuration(0);

            const ws = WaveSurfer.create({
                container: containerRef.current,
                url: audioUrl,
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
                autoScroll: true,
                autoCenter: true,
                plugins: [
                    TimelinePlugin.create({
                        container: timelineRef.current,
                        height: TIMELINE_H,
                        timeInterval: 1,
                        primaryLabelInterval: 10,
                        secondaryLabelInterval: 5,
                        style: { fontSize: '10px', color: '#555' },
                    }),
                    MinimapPlugin.create({
                        container: minimapRef.current!,
                        height: MINIMAP_H,
                        waveColor: 'rgba(139, 92, 246, 0.28)',
                        progressColor: 'rgba(139, 92, 246, 0.55)',
                        cursorColor: '#00d4ff',
                        cursorWidth: 1,
                        overlayColor: 'rgba(0, 212, 255, 0.08)',
                        barWidth: 1,
                        barGap: 0,
                        barRadius: 0,
                        interact: true,
                    }),
                ],
            });

            const wsRegions = ws.registerPlugin(RegionsPlugin.create());

            // Enable drag-to-create: left mouse down + drag on waveform draws a new region
            wsRegions.enableDragSelection({
                color: REGION_COLOR,
            });

            wsRef.current = ws;
            wsRegionsRef.current = wsRegions;
            if (wavesurferRef) wavesurferRef.current = ws;
            if (regionsRef) regionsRef.current = wsRegions;

            // ── Ready ────────────────────────────────────────────────────────
            ws.on('ready', () => {
                if (destroyed) return;
                setLoading(false);
                const dur = ws.getDuration();
                setDuration(dur);
                drawGrid();
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
                    handleStyle: {
                        left:  { backgroundColor: '#00d4ff', width: '4px', borderRadius: '2px 0 0 2px' },
                        right: { backgroundColor: '#00ff88', width: '4px', borderRadius: '0 2px 2px 0' },
                    },
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
                if (regionLoopRef.current) {
                    // Loop: seek to region start (or track start if no region)
                    ws.setTime(activeRegionRef.current ? activeRegionRef.current.start : 0);
                    ws.play();
                } else {
                    if (onPlayStateChange) onPlayStateChange(false);
                }
            });

            ws.on('error', (err: any) => {
                if (destroyed) return;
                const msg = typeof err === 'string' ? err : err?.message || 'Failed to load audio';
                // Ignore abort errors — caused by React StrictMode double-invoke cleanup
                if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('signal')) return;
                setLoading(false);
                setErrorMsg(msg);
                if (onError) onError(new Error(msg), audioUrl);
            });

            ws.on('zoom', () => { drawGrid(); });
            ws.on('redraw', () => { drawGrid(); });
            ws.on('scroll', (vStart: number) => {
                visibleStartRef.current = vStart;
                setVisibleStart(vStart);
            });

            return () => {
                destroyed = true;
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
                try {
                    wsRef.current.zoom(zoom);
                } catch {
                    // WaveSurfer throws "No audio loaded" before audio is ready — safe to ignore
                }
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
                if (!ws) return;
                regionLoopRef.current = true;
                const region = activeRegionRef.current;
                // If region exists seek to its start, else play from current position
                if (region) ws.setTime(region.start);
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
            setLooping: (enabled: boolean) => {
                regionLoopRef.current = enabled;
                // Lock the view on the region when looping — stop WaveSurfer scrolling away
                const ws = wsRef.current as any;
                if (ws) {
                    ws.options.autoScroll = !enabled;
                    ws.options.autoCenter = !enabled;
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
            getCurrentTime: () => wsRef.current?.getCurrentTime() ?? 0,
            isPlaying: () => wsRef.current?.isPlaying() ?? false,
            syncRegion: (start: number, end: number) => {
                const regions = wsRegionsRef.current;
                if (!regions) return;
                if (activeRegionRef.current) {
                    activeRegionRef.current.setOptions({ start, end });
                } else {
                    // No region yet — create one
                    const region = regions.addRegion({
                        start,
                        end,
                        color: REGION_COLOR,
                        drag: true,
                        resize: true,
                        minLength: 0.1,
                    });
                    activeRegionRef.current = region;
                }
                if (onRegionUpdate) onRegionUpdate(start, end);
            },
            zoomToRegion: (start: number, end: number) => {
                const ws = wsRef.current;
                if (!ws || end <= start) return;
                const container = containerRef.current;
                if (!container) return;
                const W = container.offsetWidth || 800;
                const regionDuration = end - start;
                // Fit region with 15% padding each side
                const paddedDuration = regionDuration * 1.3;
                const newZoom = Math.round(W / paddedDuration);
                const clampedZoom = Math.min(Math.max(newZoom, 10), 2000);
                setZoom(clampedZoom);
                // Apply zoom and center in middle of screen
                setTimeout(() => {
                    try { 
                        ws.zoom(clampedZoom);
                        const centerTime = start + regionDuration / 2;
                        ws.setTime(centerTime);
                    } catch {}
                }, 50);
            },
            zoomToFitRegion: (start: number, end: number) => {
                const ws = wsRef.current;
                if (!ws || end <= start) return;
                const container = containerRef.current;
                if (!container) return;
                const W = container.offsetWidth || 800;
                const regionDuration = end - start;
                // Fit region with 15% padding to ensure it doesn't go off screen
                const paddedDuration = regionDuration * 1.15;
                const newZoom = Math.round(W / paddedDuration);
                // Clamp zoom to reasonable range for loop editing
                const clampedZoom = Math.min(Math.max(newZoom, 20), 500);
                setZoom(clampedZoom);
                // Apply zoom and center immediately
                setTimeout(() => {
                    try { 
                        ws.zoom(clampedZoom);
                        // Center the region in the middle of screen
                        const centerTime = start + regionDuration / 2;
                        ws.setTime(centerTime);
                    } catch {}
                }, 50);
            },
        }));

        // Convert pointer X (relative to container) → audio time
        const pxToTime = useCallback((clientX: number): number => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect || !duration) return 0;
            const relX = clientX - rect.left;
            const t = visibleStartRef.current + relX / zoomRef.current;
            return Math.max(0, Math.min(t, duration));
        }, [duration]);

        const handleMarkerPointerDown = useCallback((
            e: React.PointerEvent<HTMLDivElement>,
            marker: 'IN' | 'OUT'
        ) => {
            e.preventDefault();
            e.stopPropagation();
            draggingMarker.current = marker;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }, []);

        const handleMarkerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
            if (!draggingMarker.current) return;
            const t = pxToTime(e.clientX);
            const s = regionStart ?? 0;
            const en = regionEnd ?? duration;
            if (draggingMarker.current === 'IN') {
                const clamped = Math.max(0, Math.min(t, en - 0.1));
                if (onRegionUpdate) onRegionUpdate(clamped, en);
            } else {
                const clamped = Math.max(s + 0.1, Math.min(t, duration));
                if (onRegionUpdate) onRegionUpdate(s, clamped);
            }
        }, [pxToTime, regionStart, regionEnd, duration, onRegionUpdate]);

        const handleMarkerPointerUp = useCallback(() => {
            draggingMarker.current = null;
        }, []);

        return (
            <div ref={outerRef} className="relative w-full rounded-lg bg-[#08080f] overflow-hidden select-none">
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

                        {/* ── Overview / minimap strip ── */}
                        <div
                            ref={minimapRef}
                            className="w-full bg-[#06060e] border-b border-white/[0.04] overflow-hidden"
                            style={{ height: MINIMAP_H }}
                            title="Overview — click to navigate"
                        />

                        {/* BPM grid overlay canvas */}
                        <canvas
                            ref={gridCanvasRef}
                            className="absolute inset-0 z-[1] pointer-events-none w-full h-full"
                            style={{ top: MINIMAP_H + TIMELINE_H }} // below minimap + timeline
                        />

                        {/* Timeline ruler + IN/OUT marker overlay */}
                        <div className="relative w-full">
                            <div
                                ref={timelineRef}
                                className="w-full bg-[#0d0d18] border-b border-white/5"
                            />
                            {/* Draggable IN/OUT markers on the timeline strip */}
                            {duration > 0 && regionStart !== undefined && regionEnd !== undefined && (
                                <div
                                    className="absolute inset-0 overflow-hidden"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {/* IN marker */}
                                    {(() => {
                                        const left = (regionStart - visibleStart) * zoom;
                                        return (
                                            <div
                                                className="absolute top-0 bottom-0 flex flex-col items-center cursor-ew-resize"
                                                style={{
                                                    left: left - 12,
                                                    width: 24,
                                                    pointerEvents: 'auto',
                                                    zIndex: 10,
                                                }}
                                                onPointerDown={e => handleMarkerPointerDown(e, 'IN')}
                                                onPointerMove={handleMarkerPointerMove}
                                                onPointerUp={handleMarkerPointerUp}
                                            >
                                                <div
                                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0"
                                                    style={{ pointerEvents: 'none' }}
                                                >
                                                    {/* Label */}
                                                    <span className="text-[9px] font-bold font-mono leading-none px-1 rounded-sm"
                                                        style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.15)' }}>
                                                        IN
                                                    </span>
                                                    {/* Triangle */}
                                                    <div style={{
                                                        width: 0, height: 0,
                                                        borderLeft: '5px solid transparent',
                                                        borderRight: '5px solid transparent',
                                                        borderTop: '6px solid #00d4ff',
                                                    }} />
                                                </div>
                                                {/* Vertical line */}
                                                <div className="absolute top-0 bottom-0 w-px left-1/2 -translate-x-px"
                                                    style={{ background: '#00d4ff', opacity: 0.7 }} />
                                            </div>
                                        );
                                    })()}
                                    {/* OUT marker */}
                                    {(() => {
                                        const left = (regionEnd - visibleStart) * zoom;
                                        return (
                                            <div
                                                className="absolute top-0 bottom-0 flex flex-col items-center cursor-ew-resize"
                                                style={{
                                                    left: left - 12,
                                                    width: 24,
                                                    pointerEvents: 'auto',
                                                    zIndex: 10,
                                                }}
                                                onPointerDown={e => handleMarkerPointerDown(e, 'OUT')}
                                                onPointerMove={handleMarkerPointerMove}
                                                onPointerUp={handleMarkerPointerUp}
                                            >
                                                <div
                                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0"
                                                    style={{ pointerEvents: 'none' }}
                                                >
                                                    <span className="text-[9px] font-bold font-mono leading-none px-1 rounded-sm"
                                                        style={{ color: '#00ff88', background: 'rgba(0,255,136,0.15)' }}>
                                                        OUT
                                                    </span>
                                                    <div style={{
                                                        width: 0, height: 0,
                                                        borderLeft: '5px solid transparent',
                                                        borderRight: '5px solid transparent',
                                                        borderTop: '6px solid #00ff88',
                                                    }} />
                                                </div>
                                                <div className="absolute top-0 bottom-0 w-px left-1/2 -translate-x-px"
                                                    style={{ background: '#00ff88', opacity: 0.7 }} />
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Loop region dim overlays — only visible when LOOP mode is ON */}
                        {isLooping && duration > 0 && regionStart !== undefined && regionEnd !== undefined && regionEnd > regionStart && (() => {
                            const leftW  = Math.max(0, (regionStart - visibleStart) * zoom);
                            const rightL = Math.max(0, (regionEnd   - visibleStart) * zoom);
                            const shade  = 'rgba(8,8,15,0.58)';
                            const style: React.CSSProperties = {
                                top: MINIMAP_H + TIMELINE_H,   // below minimap + timeline ruler
                                bottom: chords.length > 0 ? 18 : 0,
                                pointerEvents: 'none',
                                position: 'absolute',
                                zIndex: 3,
                                background: shade,
                            };
                            return (
                                <>
                                    {leftW > 0 && (
                                        <div style={{ ...style, left: 0, width: leftW }} />
                                    )}
                                    <div style={{ ...style, left: rightL, right: 0 }} />
                                </>
                            );
                        })()}

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
