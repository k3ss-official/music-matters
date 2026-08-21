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

// Minimal type for WaveSurfer internals — not part of the public API.
// Do not extend WaveSurfer: v7's class options type is incompatible with a Record.
interface WaveSurferInternal {
    renderer: { scrollContainer: { scrollWidth: number; clientWidth: number } };
    options: Record<string, unknown>;
}

function asInternal(ws: WaveSurfer | null): WaveSurferInternal | null {
    return ws as unknown as WaveSurferInternal | null;
}

// Minimal type for a WaveSurfer RegionsPlugin region handle.
// The full Region class is not exported as a named type in WaveSurfer v7.
interface WaveSurferRegion {
    id: string;
    start: number;
    end: number;
    setOptions(opts: Record<string, unknown>): void;
    remove(): void;
}

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
    /** Remove the active region entirely (clears the loop window) */
    clearRegion: () => void;
    /** Zoom and scroll to show only the region between start and end */
    zoomToRegion: (start: number, end: number) => void;
    /** Zoom to fit region in center of screen */
    zoomToFitRegion: (start: number, end: number) => void;
    /** Current playhead position in seconds */
    getCurrentTime: () => number;
    /** Return the underlying HTMLMediaElement so a second WaveSurfer instance can share it */
    getMediaElement: () => HTMLMediaElement | null;
}

export interface WaveformCanvasProps {
    audioUrl: string | null;
    /**
     * Optional shared HTMLMediaElement from a parent WaveformCanvas.
     * When provided, WaveSurfer uses this element instead of fetching audioUrl again
     * (zero extra network/decode cost). Use for the loop-editor pane.
     */
    mediaElement?: HTMLMediaElement | null;
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
    /** Real beat-grid phase anchor (seconds) — aligns grid + snap to the actual first beat */
    beatAnchor?: number;
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
    /** If true, hide the overview minimap strip (e.g. in the loop-editor pane) */
    hideOverview?: boolean;
    /** Waveform height in px (main browse view is taller than the editor pane) */
    waveHeight?: number;
}

// How close (seconds) to a beat before we snap
const SNAP_THRESHOLD_S = 0.08;

// Region visual style — clearly visible loop window
const REGION_COLOR = 'rgba(127, 119, 221, 0.30)';
const REGION_BORDER = 'rgba(127, 119, 221, 0.9)';

function buildBeatGrid(bpm: number, duration: number, anchor = 0): number[] {
    const beatDuration = 60 / bpm;
    const beats: number[] = [];
    // Align the grid to the track's real beat phase (anchor), not time 0.
    let phase = anchor % beatDuration;
    if (phase < 0) phase += beatDuration;
    for (let t = phase; t < duration; t += beatDuration) {
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
            mediaElement,
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
            beatAnchor = 0,
            snapEnabled = true,
            regionStart,
            regionEnd,
            phraseMarkers = [],
            isLooping = false,
            hideOverview = false,
            waveHeight = 110,
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
        const beatAnchorRef = useRef(beatAnchor);
        const phraseMarkersRef = useRef(phraseMarkers);
        const regionLoopRef = useRef(false); // whether we're looping the region
        const rafRef = useRef<number | null>(null);
        // Alt key tracking for snap bypass
        const altHeldRef = useRef(false);
        // Guard: prevents syncRegion → region-updated → onRegionUpdate infinite loop
        const isSyncingRef = useRef(false);

        snapEnabledRef.current = snapEnabled;
        downbeatsRef.current = downbeats;
        chordsRef.current = chords;
        bpmRef.current = bpm;
        beatAnchorRef.current = beatAnchor;
        phraseMarkersRef.current = phraseMarkers;
        zoomRef.current = zoom;

        // ── Snap helper ───────────────────────────────────────────────────────
        const snapTime = useCallback((time: number): number => {
            if (!snapEnabledRef.current || altHeldRef.current) return time;
            // Build grid from downbeats + BPM beats (anchored to real phase) + phrases
            const dur = wsRef.current?.getDuration() || 0;
            let grid: number[] = [...downbeatsRef.current, ...phraseMarkersRef.current];
            // Magnetic snap to the nearest beat: threshold = half a beat so any
            // position grabs the closest beat (DJ-style), unless there's no BPM.
            let threshold = 0.08;
            if (bpmRef.current && dur > 0) {
                const beatDur = 60 / bpmRef.current;
                grid = [...grid, ...buildBeatGrid(bpmRef.current, dur, beatAnchorRef.current)];
                threshold = beatDur / 2;
            }
            grid = [...new Set(grid.map(t => parseFloat(t.toFixed(4))))].sort((a, b) => a - b);
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
                    ? Math.min(z * 1.15, 2000)   // scroll up = zoom in
                    : Math.max(z / 1.15, 10));    // scroll down = zoom out
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

            // 1. BPM-estimated beats (faint, as a background grid) — anchored to real phase
            if (bpmRef.current) {
                const beatDur = 60 / bpmRef.current;
                let phase = (beatAnchorRef.current || 0) % beatDur;
                if (phase < 0) phase += beatDur;
                let beat = phase;
                let beatIdx = 0;
                while (beat < dur) {
                    const x = Math.round((beat / dur) * W);
                    const isBar = beatIdx % 4 === 0;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, H);
                    ctx.strokeStyle = isBar
                        ? 'rgba(127,119,221,0.12)'
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
                    ctx.strokeStyle = 'rgba(127,119,221,0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }, []);

        // ── Init WaveSurfer ───────────────────────────────────────────────────
        useEffect(() => {
            if (!containerRef.current || !timelineRef.current || !minimapRef.current) return;
            if (!audioUrl && !mediaElement) return;

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
                // If a shared media element is provided, reuse it (no re-fetch / re-decode).
                // Otherwise load from URL as normal.
                ...(mediaElement ? { media: mediaElement } : { url: audioUrl! }),
                waveColor: 'rgba(127, 119, 221, 0.45)',
                progressColor: '#7F77DD',
                cursorColor: '#7F77DD',
                cursorWidth: 2,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                height: waveHeight,
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
                        waveColor: 'rgba(127, 119, 221, 0.28)',
                        progressColor: 'rgba(127, 119, 221, 0.55)',
                        cursorColor: '#7F77DD',
                        cursorWidth: 1,
                        overlayColor: 'rgba(127, 119, 221, 0.08)',
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
            wsRegions.on('region-updated', (region: WaveSurferRegion) => {
                if (isSyncingRef.current) return; // programmatic update via syncRegion — skip to avoid loop
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
            wsRegions.on('region-created', (region: WaveSurferRegion) => {
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
                        left:  { backgroundColor: '#7F77DD', width: '4px', borderRadius: '2px 0 0 2px' },
                        right: { backgroundColor: '#1D9E75', width: '4px', borderRadius: '0 2px 2px 0' },
                    },
                });
                activeRegionRef.current = region;
                // If this region was created programmatically (syncRegion / parent push),
                // adopt + style it but DON'T re-snap or emit — that feedback was collapsing
                // the loop when the editor pane opened.
                if (isSyncingRef.current) return;
                let s = snapEnabledRef.current ? snapTime(region.start) : region.start;
                let e = snapEnabledRef.current ? snapTime(region.end) : region.end;
                // Quantize a freshly-drawn loop to the nearest clean musical length
                // (1/2/4/8/16/32 beats) anchored at the snapped start — so a rough
                // drag becomes a proper loop instead of an odd "3b 2bt" length.
                if (snapEnabledRef.current && bpmRef.current) {
                    const beatDur = 60 / bpmRef.current;
                    const rawBeats = (e - s) / beatDur;
                    const LENGTHS = [1, 2, 4, 8, 16, 32];
                    let best = LENGTHS[0];
                    for (const L of LENGTHS) {
                        if (Math.abs(rawBeats - L) < Math.abs(rawBeats - best)) best = L;
                    }
                    e = s + best * beatDur;
                }
                // Move the freshly-drawn region onto the snapped/quantized bounds
                if (Math.abs(s - region.start) > 0.001 || Math.abs(e - region.end) > 0.001) {
                    region.setOptions({ start: s, end: e });
                }
                if (onRegionUpdate) onRegionUpdate(s, e);
            });

            // ── Playback events ───────────────────────────────────────────────
            ws.on('audioprocess', (currentTime: number) => {
                if (onTimeUpdate) onTimeUpdate(currentTime);
                // Loop region playback.
                // Guard against a degenerate region (end <= start) which would
                // make the wrap-condition true every tick → setTime() storm → hang.
                const r = activeRegionRef.current;
                if (regionLoopRef.current && r && r.end - r.start > 0.05) {
                    if (currentTime >= r.end - 0.05) {
                        ws.setTime(r.start);
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

            // ── Mouse interaction (Audacity model) ──────────────────────────
            // Waveform body click  → WaveSurfer seeks automatically (interact:true),
            //                        we do NOT auto-play here.
            // Timeline ruler click → seek + play (see DOM listener below).
            ws.on('interaction', () => {
                if (!ws.isPlaying()) {
                    ws.play();
                    if (onPlayStateChange) onPlayStateChange(true);
                }
            });

            // Timeline ruler click → seek to that position and start playing
            const timelineEl = timelineRef.current;
            const handleTimelineClick = (e: MouseEvent) => {
                if (destroyed) return;
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const t = visibleStartRef.current + (e.clientX - rect.left) / Math.max(zoomRef.current, 1);
                const clamped = Math.max(0, Math.min(t, ws.getDuration()));
                ws.setTime(clamped);
                if (!ws.isPlaying()) {
                    ws.play();
                    if (onPlayStateChange) onPlayStateChange(true);
                }
            };
            if (timelineEl) timelineEl.addEventListener('click', handleTimelineClick);

            ws.on('error', (err: Error | string) => {
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
                if (timelineEl) timelineEl.removeEventListener('click', handleTimelineClick);
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
                // Lock the view on the region when looping — stop WaveSurfer scrolling away.
                // ws.options is internal state not exposed by the public WaveSurfer type.
                const ws = asInternal(wsRef.current);
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
            getMediaElement: () => wsRef.current?.getMediaElement() ?? null,
            syncRegion: (start: number, end: number) => {
                const regions = wsRegionsRef.current;
                if (!regions) return;
                isSyncingRef.current = true;
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
                isSyncingRef.current = false;
                // Do NOT call onRegionUpdate here — syncRegion is parent→child push, not user drag
            },
            clearRegion: () => {
                regionLoopRef.current = false;
                if (activeRegionRef.current) {
                    try { activeRegionRef.current.remove(); } catch {}
                    activeRegionRef.current = null;
                }
                // Re-enable normal scrolling/centering after a loop is cleared
                const ws = asInternal(wsRef.current);
                if (ws) {
                    ws.options.autoScroll = true;
                    ws.options.autoCenter = true;
                }
            },
            zoomToRegion: (start: number, end: number) => {
                const ws = wsRef.current;
                if (!ws || end <= start) return;
                const container = containerRef.current;
                if (!container) return;
                const W = container.offsetWidth || 800;
                const regionDuration = end - start;
                const paddedDuration = regionDuration * 1.3; // 15% padding each side
                const newZoom = Math.round(W / paddedDuration);
                const clampedZoom = Math.min(Math.max(newZoom, 10), 2000);
                const regionMid = start + regionDuration / 2;

                try { ws.zoom(clampedZoom); } catch {}
                setZoom(clampedZoom);

                // Use WaveSurfer's public setScroll() API — renderer scrollContainer is
                // updated synchronously by ws.zoom(), rAF ensures browser layout committed
                const centerScroll = () => {
                    try {
                        const renderer = asInternal(ws).renderer;
                        if (!renderer) return;
                        const { scrollWidth, clientWidth } = renderer.scrollContainer;
                        const dur = ws.getDuration() || 1;
                        const pixelMid = (regionMid / dur) * scrollWidth;
                        ws.setScroll(Math.max(0, pixelMid - clientWidth / 2));
                    } catch {}
                };
                requestAnimationFrame(centerScroll);
                setTimeout(centerScroll, 80);
            },
            zoomToFitRegion: (start: number, end: number) => {
                const ws = wsRef.current;
                if (!ws || end <= start) return;
                const container = containerRef.current;
                if (!container) return;
                const W = container.offsetWidth || 800;
                const regionDuration = end - start;
                const paddedDuration = regionDuration * 1.15;
                const newZoom = Math.round(W / paddedDuration);
                const clampedZoom = Math.min(Math.max(newZoom, 20), 500);
                const regionMid = start + regionDuration / 2;

                try { ws.zoom(clampedZoom); } catch {}
                setZoom(clampedZoom);

                const centerScroll = () => {
                    try {
                        const renderer = asInternal(ws).renderer;
                        if (!renderer) return;
                        const { scrollWidth, clientWidth } = renderer.scrollContainer;
                        const dur = ws.getDuration() || 1;
                        const pixelMid = (regionMid / dur) * scrollWidth;
                        ws.setScroll(Math.max(0, pixelMid - clientWidth / 2));
                    } catch {}
                };
                requestAnimationFrame(centerScroll);
                setTimeout(centerScroll, 80);
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
            <div ref={outerRef} className="relative w-full rounded-lg bg-[#0d0f1c] overflow-hidden select-none">
                {(audioUrl === null && !mediaElement) ? (
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
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0f1c]/80 backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-6 h-6 border-2 border-[#7F77DD] border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[#7F77DD] font-mono text-xs tracking-widest uppercase">
                                        Decoding audio...
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* ── Overview / minimap strip (hidden in loop-editor pane) ── */}
                        <div className="relative w-full" style={{ height: hideOverview ? 0 : MINIMAP_H, overflow: 'hidden' }}>
                            <div
                                ref={minimapRef}
                                className="w-full h-full bg-[#0d0f1c] border-b border-white/[0.04] overflow-hidden"
                                title="Overview — click to navigate"
                            />
                            {/* Loop region indicator overlaid on the minimap (% of full track) */}
                            {duration > 0 && regionStart !== undefined && regionEnd !== undefined && regionEnd > regionStart && (
                                <div
                                    className="absolute top-0 h-full pointer-events-none"
                                    style={{
                                        left: `${(regionStart / duration) * 100}%`,
                                        width: `${Math.max(0.3, ((regionEnd - regionStart) / duration) * 100)}%`,
                                        background: 'rgba(127, 119, 221, 0.18)',
                                        borderLeft: '2px solid rgba(127, 119, 221, 0.8)',
                                        borderRight: '2px solid rgba(29, 158, 117, 0.8)',
                                        zIndex: 10,
                                    }}
                                />
                            )}
                        </div>

                        {/* BPM grid overlay canvas */}
                        <canvas
                            ref={gridCanvasRef}
                            className="absolute inset-0 z-[1] pointer-events-none w-full h-full"
                            style={{ top: (hideOverview ? 0 : MINIMAP_H) + TIMELINE_H }}
                        />

                        {/* Timeline ruler + IN/OUT marker overlay */}
                        <div className="relative w-full">
                            <div
                                ref={timelineRef}
                                className="w-full bg-[#0d0f1c] border-b border-white/5"
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
                                                        style={{ color: '#7F77DD', background: 'rgba(127,119,221,0.15)' }}>
                                                        IN
                                                    </span>
                                                    {/* Triangle */}
                                                    <div style={{
                                                        width: 0, height: 0,
                                                        borderLeft: '5px solid transparent',
                                                        borderRight: '5px solid transparent',
                                                        borderTop: '6px solid #7F77DD',
                                                    }} />
                                                </div>
                                                {/* Vertical line */}
                                                <div className="absolute top-0 bottom-0 w-px left-1/2 -translate-x-px"
                                                    style={{ background: '#7F77DD', opacity: 0.7 }} />
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
                                                        style={{ color: '#1D9E75', background: 'rgba(29,158,117,0.15)' }}>
                                                        OUT
                                                    </span>
                                                    <div style={{
                                                        width: 0, height: 0,
                                                        borderLeft: '5px solid transparent',
                                                        borderRight: '5px solid transparent',
                                                        borderTop: '6px solid #1D9E75',
                                                    }} />
                                                </div>
                                                <div className="absolute top-0 bottom-0 w-px left-1/2 -translate-x-px"
                                                    style={{ background: '#1D9E75', opacity: 0.7 }} />
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
                            const shade  = 'rgba(13,15,28,0.58)';
                            const style: React.CSSProperties = {
                                top: (hideOverview ? 0 : MINIMAP_H) + TIMELINE_H,
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
                            <div className="relative w-full h-[18px] bg-[#0d0f1c] flex overflow-hidden">
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
                                                background: 'rgba(127,119,221,0.15)',
                                                borderRight: '1px solid rgba(127,119,221,0.2)',
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
