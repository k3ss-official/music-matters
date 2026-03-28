/**
 * CentreWorkspace — production waveform workspace
 *
 * Wires together:
 *  - WaveformCanvas (WaveSurfer v7, bidirectional region sync)
 *  - TransportBar (play/pause/stop/loop, time, volume, zoom, snap)
 *  - LoopEditorToolbar (IN/OUT nudge, quantize, bar presets, save/steal)
 *  - Smart Phrase row (click to jump region)
 *  - Save loop / steal region → API calls
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { TrackDetailResponse, JobProgress } from '../types';
import WaveformCanvas, { WaveformHandle } from './WaveformCanvas';
import { TransportBar } from './TransportBar';
import { LoopEditorToolbar } from './LoopEditorToolbar';
import { EditLoopSection } from './EditLoopSection';
import { StemLanes } from './StemLanes';
import { useStemMixer } from '../hooks/useStemMixer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
    getTrackAudioUrl,
    createCustomLoop,
    getSmartPhrases,
    type SmartPhrase,
} from '../services/api';
import { Zap, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CentreWorkspaceProps {
    trackId: string | null;
    trackDetail: TrackDetailResponse | null;
    /** Controlled region state (owned here, lifted to parent via onUpdateRegion) */
    regionStart: number;
    regionEnd: number;
    onUpdateRegion: (start: number, end: number) => void;
    /** Optional pass-through refs for parent access (legacy compatibility) */
    wavesurferRef?: React.MutableRefObject<any>;
    regionsRef?: React.MutableRefObject<any>;
    waveformReady: boolean;
    setWaveformReady: (ready: boolean) => void;
    errorMsg?: string | null;
    detailLoading?: boolean;
    activeJob?: JobProgress | null;
    onPlayStateChange?: (playing: boolean) => void;
    onTimeUpdate?: (time: number) => void;
    onOpenExportDialog?: () => void;
    /** Lifted stem selection — keeps ExportPanel in App.tsx in sync */
    onSelectedStemsChange?: (stems: string[]) => void;
}

// ── Phrase display helpers ─────────────────────────────────────────────────
const PHRASE_LABELS: Record<string, string> = {
    intro: 'Intro', outro: 'Outro', verse: 'Verse', chorus: 'Chorus',
    drop: 'Drop', bridge: 'Bridge', breakdown: 'Breakdown', build: 'Build',
    'pre-chorus': 'Pre-Ch', hook: 'Hook', instrumental: 'Inst',
};
const PHRASE_COLORS: Record<string, string> = {
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

function phraseLabel(t: string): string {
    return PHRASE_LABELS[t] ?? (t.charAt(0).toUpperCase() + t.slice(1));
}
function phraseColor(t: string): string {
    return PHRASE_COLORS[t] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}
function confidenceDot(c: number) {
    if (c >= 0.85) return 'bg-[#00ff88]';
    if (c >= 0.6) return 'bg-yellow-400';
    return 'bg-red-400';
}

// ── Component ─────────────────────────────────────────────────────────────
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
    errorMsg: externalError,
    detailLoading,
    activeJob,
    onPlayStateChange: onPlayStateChangeProp,
    onTimeUpdate: onTimeUpdateProp,
    onOpenExportDialog,
    onSelectedStemsChange,
}: CentreWorkspaceProps) {
    // ── Waveform ref ─────────────────────────────────────────────────────
    const waveformRef = useRef<WaveformHandle>(null);

    // ── Transport state ──────────────────────────────────────────────────
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);
    // Single snap state — controls both WaveformCanvas region snap AND EditLoopSection quantize
    const [snapEnabled, setSnapEnabled] = useState(false);

    // ── Error / save state ───────────────────────────────────────────────
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // ── Smart phrases ────────────────────────────────────────────────────
    const [smartPhrases, setSmartPhrases] = useState<SmartPhrase[]>([]);
    const [loadingPhrases, setLoadingPhrases] = useState(false);
    const [phrasesError, setPhrasesError] = useState<string | null>(null);

    // ── Loop selection state ──────────────────────────────────────────────
    const [activeBarPreset, setActiveBarPreset] = useState<number | null>(null);
    const [editLoopOpen, setEditLoopOpen] = useState(false);

    const bpm: number | null = trackDetail?.bpm ?? null;
    const downbeats: number[] = (trackDetail?.metadata?.downbeats as number[]) ?? [];
    const chords: Array<{ start: number; end: number; chord: string }> =
        (trackDetail?.metadata?.chords as any[]) ?? [];

    // ── Stem names (strip .wav) ───────────────────────────────────────────
    const stemNames = (trackDetail?.stems ?? []).map(s => s.replace(/\.wav$/, ''));

    // ── Stem mixer ───────────────────────────────────────────────────────
    const stemMixer = useStemMixer(trackId, stemNames);

    // Refs for stem transport wiring (avoid stale closures in callbacks)
    const isPlayingRef       = useRef(false);
    const lastTimeRef        = useRef(0);
    const stemPlayDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Selected stems for export ────────────────────────────────────────
    const [selectedStems, setSelectedStems] = useState<string[]>([]);

    // ── Audio URL ────────────────────────────────────────────────────────
    const audioUrl = trackId ? getTrackAudioUrl(trackId) : null;

    // ── Reset on track change ────────────────────────────────────────────
    useEffect(() => {
        setIsPlaying(false);
        setIsLooping(false);
        setCurrentTime(0);
        setDuration(0);
        setLoadError(null);
        setSaveSuccess(false);
        setActiveBarPreset(null);
        setEditLoopOpen(false);
    }, [trackId]);

    // ── Load smart phrases ────────────────────────────────────────────────
    useEffect(() => {
        if (!trackId || !waveformReady) return;
        setPhrasesError(null);
        setLoadingPhrases(true);
        getSmartPhrases(trackId)
            .then(resp => setSmartPhrases(Array.isArray(resp) ? resp : (resp.phrases || [])))
            .catch((err: any) => {
                setSmartPhrases([]);
                setPhrasesError(err?.response?.data?.detail || err?.message || 'Failed to load phrases');
            })
            .finally(() => setLoadingPhrases(false));
    }, [trackId, waveformReady]);

    useEffect(() => {
        if (!trackId) {
            setSmartPhrases([]);
            setPhrasesError(null);
        }
    }, [trackId]);

    // ── Volume routing: mute WaveSurfer when stems are loaded (stems ARE the audio) ──
    const stemsActive = stemMixer.isLoaded && stemNames.length > 0;
    useEffect(() => {
        if (stemsActive) {
            // Silence WaveSurfer — stem mixer provides all audio
            waveformRef.current?.setVolume(0);
            stemMixer.setMasterVolume(volume);
        } else {
            waveformRef.current?.setVolume(volume);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stemsActive, volume]);

    // ── Loop toggle ───────────────────────────────────────────────────────
    const handleToggleLoop = useCallback(() => {
        setIsLooping(prev => {
            const next = !prev;
            const w = waveformRef.current;
            // Keep WaveformCanvas regionLoopRef in sync with React state
            w?.setLooping(next);
            if (next && isPlaying) {
                // Turning ON while playing — switch to region loop immediately
                w?.playRegion();
            }
            return next;
        });
    }, [isPlaying]);

    // ── Region change (from toolbar nudge / preset) ───────────────────────
    const handleRegionChange = useCallback((s: number, e: number) => {
        onUpdateRegion(s, e);
        // Always sync WaveSurfer region (creates it if none exists)
        waveformRef.current?.syncRegion(s, e);
        // If currently looping, restart from new start
        if (isLooping && waveformRef.current?.isPlaying()) {
            waveformRef.current.seek(s);
        }
    }, [onUpdateRegion, isLooping]);

    // ── Save loop → API ───────────────────────────────────────────────────
    const handleSaveLoop = useCallback(async (start: number, end: number) => {
        if (!trackId || saving) return;
        setSaving(true);
        setSaveSuccess(false);
        try {
            const allStems = trackDetail?.stems || ['drums', 'bass', 'other', 'vocals'];
            await createCustomLoop(trackId, start, end, allStems);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error('Failed to save loop:', err);
        } finally {
            setSaving(false);
        }
    }, [trackId, trackDetail, saving]);


    // ── Bar preset toggle ─────────────────────────────────────────────────
    const handleBarPresetToggle = useCallback((bars: number) => {
        if (activeBarPreset === bars) {
            // Deselect — stop loop, return to normal play
            setActiveBarPreset(null);
            setEditLoopOpen(false);
            waveformRef.current?.stopRegion();
            setIsLooping(false);
            return;
        }
        setActiveBarPreset(bars);
        if (bpm && duration > 0) {
            const beatDur = 60 / bpm;
            const barDur = beatDur * 4;
            const playhead = waveformRef.current?.getCurrentTime() ?? currentTime;
            // Snap ON → align to nearest bar boundary; Snap OFF → start exactly at playhead
            const snappedStart = snapEnabled
                ? Math.round(playhead / barDur) * barDur
                : playhead;
            const newEnd = Math.min(snappedStart + barDur * bars, duration);
            // Just set the region — do NOT auto-start the loop.
            // User must press LOOP to activate looping.
            handleRegionChange(snappedStart, newEnd);
            waveformRef.current?.zoomToRegion(snappedStart, newEnd);
        }
    }, [bpm, duration, activeBarPreset, currentTime, handleRegionChange]);

    // ── Stem solo + play ──────────────────────────────────────────────────
    const handlePlayStem = useCallback((name: string) => {
        const currentState = stemMixer.stemStates.find(s => s.name === name);
        const wasSoloed = currentState?.soloed ?? false;
        stemMixer.toggleSolo(name);
        if (!wasSoloed && !isPlaying) {
            waveformRef.current?.play();
        }
    }, [stemMixer, isPlaying]);

    // ── EDIT toggle — zoom waveform into loop region ──────────────────────
    const handleEditToggle = useCallback(() => {
        setEditLoopOpen(prev => {
            const next = !prev;
            if (next) {
                const s = regionStart;
                const e = regionEnd;
                if (e > s) {
                    // Zoom in: force at least 200px/s so the region is always prominent
                    waveformRef.current?.zoomToRegion(s, e);
                } else if (bpm && duration > 0) {
                    // No region — snap a 4-bar region from playhead and zoom to it
                    const barDur = (60 / bpm) * 4;
                    const playhead = waveformRef.current?.getCurrentTime() ?? 0;
                    const snappedStart = Math.round(playhead / barDur) * barDur;
                    const newEnd = Math.min(snappedStart + barDur * 4, duration);
                    handleRegionChange(snappedStart, newEnd);
                    setTimeout(() => waveformRef.current?.zoomToRegion(snappedStart, newEnd), 30);
                }
            } else {
                waveformRef.current?.zoomFit();
            }
            return next;
        });
    }, [regionStart, regionEnd, bpm, duration, handleRegionChange]);

    // ── Export to Ableton (Cmd+E) ─────────────────────────────────────────
    const handleExportAbleton = useCallback(() => {
        if (!trackId) return;
        onOpenExportDialog?.();
    }, [trackId, onOpenExportDialog]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    useKeyboardShortcuts({
        waveformRef,
        regionStart,
        regionEnd,
        duration,
        bpm,
        smartPhrases,
        onUpdateRegion: handleRegionChange,
        onSaveLoop: () => handleSaveLoop(regionStart, regionEnd),
        onExportAbleton: handleExportAbleton,
        enabled: !!trackId,
    });

    // ── Smart phrase → set region ─────────────────────────────────────────
    const handleSmartPhrase = useCallback((phrase: SmartPhrase) => {
        onUpdateRegion(phrase.start_time, phrase.end_time);
        waveformRef.current?.syncRegion(phrase.start_time, phrase.end_time);
        waveformRef.current?.seek(phrase.start_time);
    }, [onUpdateRegion]);

    // ── No track loaded ───────────────────────────────────────────────────
    if (!trackId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#0a0a0f] text-white/20 text-sm font-mono tracking-wider uppercase">
                Select a track to begin
            </div>
        );
    }

    // ── Loading track detail ──────────────────────────────────────────────
    if (detailLoading || !trackDetail) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0f] gap-4">
                <Loader2 size={28} className="animate-spin text-[#00d4ff]" />
                <span className="text-[#00d4ff]/60 font-mono text-xs uppercase tracking-widest">
                    Loading track…
                </span>
            </div>
        );
    }

    const STAGE_LABELS: Record<string, string> = {
        ingest: 'Ingesting', analysis: 'Analysing', separation: 'Separating stems',
        loop: 'Slicing loops', project: 'Finalising',
    };
    const STAGE_COLOR: Record<string, string> = {
        ingest: '#00d4ff', analysis: '#8b5cf6', separation: '#00ff88',
        loop: '#f59e0b', project: '#00d4ff',
    };

    return (
        <div
            className="flex flex-col flex-1 min-h-0 bg-[#0a0a0f] overflow-hidden outline-none focus-within:ring-1 focus-within:ring-[#00d4ff]/20"
            tabIndex={-1}
        >

            {/* ── Pipeline job progress ───────────────────────────────────── */}
            {activeJob && activeJob.status !== 'completed' && (
                <div className="border-b border-white/5 bg-[#0d0d18] px-4 py-2 flex flex-col gap-1.5 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {activeJob.status === 'running' && (
                                <Loader2 size={11} className="animate-spin text-[#00d4ff]" />
                            )}
                            {activeJob.status === 'failed' && (
                                <AlertCircle size={11} className="text-[#ff3b5c]" />
                            )}
                            <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
                                {activeJob.status === 'failed'
                                    ? 'Pipeline failed'
                                    : activeJob.currentStage
                                        ? STAGE_LABELS[activeJob.currentStage] ?? activeJob.currentStage
                                        : 'Processing…'}
                            </span>
                        </div>
                        <span className="text-[10px] font-mono text-white/25">
                            {Math.round((activeJob.progress ?? 0) * 100)}%
                        </span>
                    </div>

                    {/* Stage pills */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {activeJob.stages.map(stage => (
                            <div
                                key={stage.id}
                                title={stage.detail ?? stage.label}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide border transition-all ${
                                    stage.status === 'done'
                                        ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20'
                                        : stage.status === 'running'
                                        ? 'bg-[#00d4ff]/10 text-[#00d4ff] border-[#00d4ff]/30 animate-pulse'
                                        : stage.status === 'error'
                                        ? 'bg-[#ff3b5c]/10 text-[#ff3b5c] border-[#ff3b5c]/20'
                                        : 'bg-white/5 text-white/25 border-white/5'
                                }`}
                            >
                                {stage.status === 'running' && <Loader2 size={7} className="animate-spin" />}
                                {stage.status === 'done' && <CheckCircle2 size={7} />}
                                {stage.status === 'error' && <AlertCircle size={7} />}
                                {stage.label}
                                {stage.status === 'running' && stage.progress > 0 && (
                                    <span className="opacity-60">
                                        {Math.round(stage.progress * 100)}%
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Progress bar */}
                    <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${Math.round((activeJob.progress ?? 0) * 100)}%`,
                                background: activeJob.status === 'failed' ? '#ff3b5c' : `linear-gradient(90deg, #00d4ff, #8b5cf6)`,
                            }}
                        />
                    </div>

                    {/* Detail text */}
                    {activeJob.detail && activeJob.status !== 'failed' && (
                        <p className="text-[9px] text-white/25 font-mono truncate">{activeJob.detail}</p>
                    )}
                    {activeJob.status === 'failed' && activeJob.detail && (
                        <p className="text-[9px] text-[#ff3b5c]/70 font-mono truncate">{activeJob.detail}</p>
                    )}
                </div>
            )}

            {/* ── Transport bar ──────────────────────────────────────────── */}
            <TransportBar
                waveformRef={waveformRef}
                isPlaying={isPlaying}
                isLooping={isLooping}
                currentTime={currentTime}
                duration={duration}
                volume={volume}
                bpm={bpm}
                onToggleLoop={handleToggleLoop}
                onVolumeChange={vol => {
                    setVolume(vol);
                    waveformRef.current?.setVolume(vol);
                }}
                activeBarPreset={activeBarPreset}
                onBarPresetToggle={handleBarPresetToggle}
                editLoopOpen={editLoopOpen}
                onEditToggle={handleEditToggle}
                snapEnabled={snapEnabled}
                onSnapToggle={() => setSnapEnabled(v => !v)}
            />

            {/* ── Waveform ───────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 relative px-0 overflow-x-auto">
                {/* External error banner */}
                {(externalError || loadError) && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#ff3b5c]/10 border-b border-[#ff3b5c]/20 text-[#ff3b5c] text-xs font-mono">
                        <AlertCircle size={12} />
                        {externalError || loadError}
                    </div>
                )}

                {/* Save success toast */}
                {saveSuccess && (
                    <div className="absolute top-2 right-4 z-30 flex items-center gap-2
                                    bg-[#00ff88]/15 border border-[#00ff88]/30 text-[#00ff88]
                                    px-3 py-2 rounded-lg text-xs font-mono tracking-wider shadow-xl">
                        <CheckCircle2 size={12} />
                        Loop saved
                    </div>
                )}

                {/* Saving indicator */}
                {saving && (
                    <div className="absolute top-2 right-4 z-30 flex items-center gap-2
                                    bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 text-[#8b5cf6]
                                    px-3 py-2 rounded-lg text-xs font-mono tracking-wider shadow-xl">
                        <Loader2 size={12} className="animate-spin" />
                        Saving...
                    </div>
                )}

                <WaveformCanvas
                    ref={waveformRef}
                    audioUrl={audioUrl}
                    downbeats={downbeats}
                    chords={chords}
                    bpm={bpm}
                    snapEnabled={snapEnabled}
                    isLooping={isLooping}
                    regionStart={regionStart}
                    regionEnd={regionEnd}
                    phraseMarkers={smartPhrases.map(p => p.start_time)}
                    wavesurferRef={wavesurferRef}
                    regionsRef={regionsRef}
                    onReady={dur => {
                        setDuration(dur);
                        setWaveformReady(true);
                    }}
                    onError={(err) => {
                        setLoadError(err.message);
                        setWaveformReady(false);
                    }}
                    onRegionUpdate={(s, e) => {
                        onUpdateRegion(s, e);
                        // If user dragged a custom region, clear the bar preset badge
                        // unless the new region length matches the active preset exactly
                        if (bpm && activeBarPreset) {
                            const expectedLen = (60 / bpm) * 4 * activeBarPreset;
                            if (Math.abs((e - s) - expectedLen) > 0.1) {
                                setActiveBarPreset(null);
                            }
                        }
                    }}
                    onTimeUpdate={t => {
                        setCurrentTime(t);
                        onTimeUpdateProp?.(t);
                        const dt = t - lastTimeRef.current;
                        lastTimeRef.current = t;
                        // Resync stems only on backward jump (loop restart) or
                        // very large forward jump (>2s = user seek, not bar-preset nav)
                        if (isPlayingRef.current && (dt < -0.1 || dt > 2.0)) {
                            stemMixer.seek(t);
                        }
                    }}
                    onPlayStateChange={playing => {
                        setIsPlaying(playing);
                        isPlayingRef.current = playing;
                        onPlayStateChangeProp?.(playing);
                        if (playing) {
                            // Debounce: WaveSurfer fires 'play' on loop restarts too.
                            // Cancel any pending call and schedule a fresh one so rapid
                            // back-to-back play events collapse into a single stemMixer.play().
                            if (stemPlayDebounceRef.current) clearTimeout(stemPlayDebounceRef.current);
                            stemPlayDebounceRef.current = setTimeout(() => {
                                if (!isPlayingRef.current) return; // paused before debounce fired
                                const offset = waveformRef.current?.getCurrentTime() ?? 0;
                                stemMixer.play(offset);
                            }, 30);
                        } else {
                            if (stemPlayDebounceRef.current) clearTimeout(stemPlayDebounceRef.current);
                            stemMixer.pause();
                        }
                    }}
                />
            </div>

            {/* ── Edit Loop section — sits above toolbar so it's always visible ── */}
            {editLoopOpen && (
                <EditLoopSection
                    regionStart={regionStart}
                    regionEnd={regionEnd}
                    bpm={bpm}
                    barCount={activeBarPreset ?? 0}
                    quantizeEnabled={snapEnabled}
                    onQuantizeToggle={() => setSnapEnabled(v => !v)}
                    onClose={() => setEditLoopOpen(false)}
                    onRegionChange={handleRegionChange}
                    duration={duration}
                />
            )}

            {/* ── Loop editor toolbar ────────────────────────────────────── */}
            <LoopEditorToolbar
                waveformRef={waveformRef}
                regionStart={regionStart}
                regionEnd={regionEnd}
                duration={duration}
                bpm={bpm}
                onRegionChange={handleRegionChange}
                onSaveLoop={handleSaveLoop}
                editLoopOpen={editLoopOpen}
            />

            {/* ── Stem lanes ─────────────────────────────────────────────── */}
            {stemNames.length > 0 && (
                <div className="shrink-0 max-h-[220px] overflow-y-auto border-t border-white/5">
                    <StemLanes
                        trackId={trackId ?? undefined}
                        availableStems={stemNames}
                        stemMixerStates={stemMixer.stemStates}
                        onToggleMute={stemMixer.toggleMute}
                        onToggleSolo={stemMixer.toggleSolo}
                        onPlayStem={handlePlayStem}
                        mixerLoaded={stemMixer.isLoaded}
                        isPlaying={isPlaying}
                        selectedStems={selectedStems}
                        editLoopOpen={editLoopOpen}
                        regionStart={regionStart}
                        regionEnd={regionEnd}
                        trackDuration={duration}
                        onToggleStemSelection={name => {
                            setSelectedStems(prev => {
                                const next = prev.includes(name)
                                    ? prev.filter(s => s !== name)
                                    : [...prev, name];
                                onSelectedStemsChange?.(next);
                                return next;
                            });
                        }}
                    />
                </div>
            )}

            {/* ── Smart phrases ──────────────────────────────────────────── */}
            {(loadingPhrases || smartPhrases.length > 0 || phrasesError) && (
                <div className="px-4 py-2 bg-[#0d0d18] border-t border-white/5 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 mr-1">
                        <Zap size={11} className="text-[#8b5cf6]" />
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                            Phrases
                        </span>
                    </div>

                    {loadingPhrases && (
                        <div className="flex items-center gap-1.5 text-white/25 text-xs">
                            <Loader2 size={11} className="animate-spin" />
                            <span className="font-mono text-[10px]">Detecting...</span>
                        </div>
                    )}

                    {phrasesError && (
                        <span className="text-[10px] text-red-400/60 font-mono">{phrasesError}</span>
                    )}

                    {smartPhrases.map((phrase, i) => (
                        <button
                            key={i}
                            onClick={() => handleSmartPhrase(phrase)}
                            title={`${phrase.type} · ${phrase.start_time.toFixed(2)}s–${phrase.end_time.toFixed(2)}s · ${Math.round((phrase.confidence ?? 0) * 100)}% confidence`}
                            className={`
                                flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono
                                transition-all hover:scale-105 active:scale-95 cursor-pointer
                                ${phraseColor(phrase.type)}
                            `}
                        >
                            <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${confidenceDot(phrase.confidence ?? 0)}`}
                            />
                            {phraseLabel(phrase.type)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default CentreWorkspace;
