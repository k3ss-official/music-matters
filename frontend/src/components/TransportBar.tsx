/**
 * TransportBar — production DJ transport controls
 *
 * Features:
 *  - Play/Pause full track
 *  - Stop (return to start)
 *  - Loop Region toggle (lights up when active)
 *  - Playhead time display (MM:SS.ms)
 *  - Track duration display
 *  - BPM badge
 *  - Volume slider with mute toggle
 *  - Zoom In / Zoom Out / Zoom Fit buttons
 *  - Snap toggle
 */
import React, { useCallback } from 'react';
import {
    Play,
    Pause,
    Square,
    Volume2,
    VolumeX,
    ZoomIn,
    ZoomOut,
    Maximize2,
    AlignJustify,
    SkipBack,
    SkipForward,
} from 'lucide-react';
import type { WaveformHandle } from './WaveformCanvas';

export interface TransportBarProps {
    waveformRef: React.RefObject<WaveformHandle>;
    isPlaying: boolean;
    isLooping: boolean;
    currentTime: number;      // seconds
    duration: number;         // seconds
    volume: number;           // 0–1
    bpm?: number | null;
    snapEnabled: boolean;
    onToggleLoop: () => void;
    onVolumeChange: (v: number) => void;
    onSnapToggle: () => void;
}

// Format seconds → MM:SS.ms (e.g. "01:23.456")
function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export const TransportBar: React.FC<TransportBarProps> = ({
    waveformRef,
    isPlaying,
    isLooping,
    currentTime,
    duration,
    volume,
    bpm,
    snapEnabled,
    onToggleLoop,
    onVolumeChange,
    onSnapToggle,
}) => {
    const handlePlayPause = useCallback(() => {
        const w = waveformRef.current;
        if (!w) return;
        if (isPlaying) {
            w.pause();
        } else {
            if (isLooping) {
                w.playRegion();
            } else {
                w.play();
            }
        }
    }, [waveformRef, isPlaying, isLooping]);

    const handleStop = useCallback(() => {
        waveformRef.current?.stop();
    }, [waveformRef]);

    const handleLoopToggle = useCallback(() => {
        // All loop-switch logic lives in CentreWorkspace.handleToggleLoop
        onToggleLoop();
    }, [onToggleLoop]);

    const isMuted = volume === 0;

    const handleMuteToggle = useCallback(() => {
        onVolumeChange(isMuted ? 0.8 : 0);
    }, [isMuted, onVolumeChange]);

    const handleVolumeInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onVolumeChange(parseFloat(e.target.value));
    }, [onVolumeChange]);

    return (
        <div
            className={`
                w-full flex items-center gap-3 px-4 py-2
                bg-[#0d0d1a] border-b border-white/5
                select-none flex-wrap
            `}
            style={{ minHeight: 52 }}
        >
            {/* ── Playback buttons ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                {/* Skip to start */}
                <button
                    onClick={() => waveformRef.current?.seek(0)}
                    title="Skip to start"
                    className="w-7 h-7 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <SkipBack size={13} />
                </button>

                {/* Stop */}
                <button
                    onClick={handleStop}
                    title="Stop (return to start)"
                    className="w-8 h-8 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/60 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <Square size={14} />
                </button>

                {/* Play / Pause */}
                <button
                    onClick={handlePlayPause}
                    title={isPlaying ? 'Pause' : 'Play'}
                    className={`
                        w-10 h-10 flex items-center justify-center rounded-full
                        transition-all focus:outline-none
                        ${isPlaying
                            ? 'bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-lg shadow-purple-900/40'
                            : 'bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] border border-[#00d4ff]/30'}
                    `}
                >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>

                {/* Skip to end */}
                <button
                    onClick={() => { const d = waveformRef.current?.getDuration(); if (d) waveformRef.current?.seek(d); }}
                    title="Skip to end"
                    className="w-7 h-7 flex items-center justify-center rounded bg-white/5
                               hover:bg-white/10 text-white/40 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <SkipForward size={13} />
                </button>

                {/* Loop Region toggle */}
                <button
                    onClick={handleLoopToggle}
                    title={isLooping ? 'Loop ON — click to disable' : 'Loop OFF — click to enable'}
                    className={`
                        flex items-center justify-center px-2.5 h-8 rounded
                        font-mono text-[11px] font-bold tracking-widest
                        transition-all focus:outline-none
                        ${isLooping
                            ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/50 shadow-[0_0_8px_rgba(0,255,136,0.25)]'
                            : 'bg-white/5 hover:bg-white/10 text-white/35 hover:text-white/70 border border-white/10'}
                    `}
                >
                    LOOP
                </button>
            </div>

            {/* ── Time display ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-[#00d4ff] tracking-widest tabular-nums text-[13px]">
                    {fmtTime(currentTime)}
                </span>
                <span className="text-white/20">/</span>
                <span className="text-white/35 tracking-widest tabular-nums">
                    {fmtTime(duration)}
                </span>
            </div>

            {/* ── BPM badge ────────────────────────────────────────────────── */}
            {bpm != null && (
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/25">
                    <span className="font-mono text-[11px] text-[#8b5cf6] tracking-widest">
                        {bpm.toFixed(1)} BPM
                    </span>
                </div>
            )}

            {/* ── Snap toggle ──────────────────────────────────────────────── */}
            <button
                onClick={onSnapToggle}
                title="Beat Snap"
                className={`
                    flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono
                    tracking-widest transition-colors focus:outline-none
                    ${snapEnabled
                        ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
                        : 'bg-white/5 text-white/30 hover:text-white/50 border border-white/10'}
                `}
            >
                <AlignJustify size={11} />
                SNAP
            </button>

            {/* ── Spacer ───────────────────────────────────────────────────── */}
            <div className="flex-1" />

            {/* ── Zoom controls ────────────────────────────────────────────── */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => waveformRef.current?.zoomOut()}
                    title="Zoom out"
                    className="w-7 h-7 flex items-center justify-center rounded
                               bg-white/5 hover:bg-white/10 text-white/50 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <ZoomOut size={12} />
                </button>
                <button
                    onClick={() => waveformRef.current?.zoomFit()}
                    title="Zoom fit"
                    className="w-7 h-7 flex items-center justify-center rounded
                               bg-white/5 hover:bg-white/10 text-white/50 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <Maximize2 size={11} />
                </button>
                <button
                    onClick={() => waveformRef.current?.zoomIn()}
                    title="Zoom in"
                    className="w-7 h-7 flex items-center justify-center rounded
                               bg-white/5 hover:bg-white/10 text-white/50 hover:text-white
                               transition-colors focus:outline-none"
                >
                    <ZoomIn size={12} />
                </button>
            </div>

            {/* ── Volume ───────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleMuteToggle}
                    title={isMuted ? 'Unmute' : 'Mute'}
                    className="text-white/40 hover:text-white/80 transition-colors focus:outline-none"
                >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={handleVolumeInput}
                    className="w-20 h-1 accent-[#00d4ff] cursor-pointer"
                    title={`Volume: ${Math.round(volume * 100)}%`}
                />
                <span className="text-white/25 font-mono text-[10px] w-7 tabular-nums">
                    {Math.round(volume * 100)}%
                </span>
            </div>
        </div>
    );
};

export default TransportBar;
