/**
 * ParentStemPanel — waveform display, region overlay, transport controls,
 * and info strip (BPM / Key / Region / artifact score).
 *
 * Waveform is rendered as an SVG bar chart from waveform_peaks on the session
 * parent stem. Real WaveSurfer integration is a future step (placeholder here).
 */
import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import type { IsolationSession } from '../../types/isolation';
import {
  extractRegion,
  splitSubstems,
  updateIsolationSession,
  getIsolationAudioUrl,
} from '../../services/isolationApi';

interface Props {
  session: IsolationSession;
  onSessionUpdate: (session: IsolationSession) => void;
}

function StemWaveform({
  peaks: realPeaks,
  regionStartNorm,
  regionEndNorm,
}: {
  peaks?: number[];
  regionStartNorm: number;
  regionEndNorm: number;
}) {
  const peaks = realPeaks && realPeaks.length > 0
    ? realPeaks
    : Array.from({ length: 160 }, (_, i) => {
        const phase = i * 0.31;
        const env = Math.sin((Math.PI * i) / 160);
        return Math.abs(Math.sin(phase) * 0.5 + Math.sin(phase * 2.3) * 0.3 + Math.sin(phase * 5.7) * 0.2) * env;
      });

  const clampedStart = Math.max(0, Math.min(1, regionStartNorm));
  const clampedEnd = Math.max(clampedStart, Math.min(1, regionEndNorm));
  const regionLeft = `${(clampedStart * 100).toFixed(1)}%`;
  const regionWidth = `${((clampedEnd - clampedStart) * 100).toFixed(1)}%`;

  return (
    <div className="relative w-full h-[72px] bg-[#0d0f1c] rounded overflow-hidden">
      {/* Region overlay */}
      {clampedEnd > clampedStart && (
        <div
          className="absolute top-0 h-full bg-[#7F77DD]/25 border-l border-r border-[#7F77DD]/70 z-10"
          style={{ left: regionLeft, width: regionWidth }}
        />
      )}
      {/* Waveform bars */}
      <svg className="w-full h-full" viewBox={`0 0 ${peaks.length} 72`} preserveAspectRatio="none">
        {peaks.map((p, i) => {
          const barH = Math.max(1, p * 64);
          return (
            <rect
              key={i}
              x={i}
              y={(72 - barH) / 2}
              width={0.65}
              height={barH}
              fill="#7F77DD"
              opacity={0.65}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function ParentStemPanel({ session, onSessionUpdate }: Props) {
  const [splitting, setSplitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [regionReady, setRegionReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasSplitAlready = session.substems.length > 0;
  const hasRealParent = Boolean(session.parent_stem_path);
  const availableStems = session.available_stems ?? [];
  const totalDuration =
    session.parent_duration && session.parent_duration > 0
      ? session.parent_duration
      : Math.max(session.region_end, 1);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }
    if (!hasRealParent) {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 1500);
      return;
    }
    try {
      const target = regionReady ? 'region' : 'parent';
      const url = getIsolationAudioUrl(session.id, target, Date.now());
      const audio = new Audio(url);
      audioRef.current = audio;
      if (target === 'parent' && session.region_start > 0) {
        audio.currentTime = session.region_start;
      }
      audio.ontimeupdate = () => {
        if (target === 'parent' && session.region_end > session.region_start) {
          if (audio.currentTime >= session.region_end) {
            audio.pause();
            setIsPlaying(false);
          }
        }
      };
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  };

  const handleStemSelect = async (stemName: string) => {
    stopAudio();
    setRegionReady(false);
    const updated = await updateIsolationSession(session.id, { parent_stem_name: stemName });
    onSessionUpdate(updated);
  };

  const handleSplit = async () => {
    setSplitting(true);
    try {
      const updated = await splitSubstems(session.id);
      setRegionReady(true);
      onSessionUpdate(updated);
    } finally {
      setSplitting(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await extractRegion(session.id);
      setRegionReady(true);
    } finally {
      setExtracting(false);
    }
  };

  const regionDuration = Math.max(0, session.region_end - session.region_start);
  const regionStartNorm = totalDuration > 0 ? session.region_start / totalDuration : 0;
  const regionEndNorm = totalDuration > 0 ? session.region_end / totalDuration : 0;

  return (
    <div className="bg-[#1a1830] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-2 h-2 rounded-full bg-[#7F77DD]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
            Parent Stem
          </span>
          <span className="text-[11px] font-mono text-white/70 ml-1">
            {session.parent_stem_name}
          </span>
          {availableStems.length > 0 && (
            <div className="flex items-center gap-1 ml-2">
              {availableStems.map(stem => (
                <button
                  key={stem}
                  onClick={() => handleStemSelect(stem)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors ${
                    session.parent_stem_name === stem
                      ? 'bg-[#7F77DD]/25 border border-[#7F77DD]/60 text-[#7F77DD] font-bold'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
                  }`}
                >
                  {stem}
                </button>
              ))}
            </div>
          )}
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            hasRealParent
              ? 'text-[#1D9E75] bg-[#1D9E75]/10 border-[#1D9E75]/30'
              : 'text-white/20 bg-[#7F77DD]/10 border-[#7F77DD]/20'
          }`}
        >
          {hasRealParent ? 'REAL STEM' : 'PLACEHOLDER'}
        </span>
      </div>

      {/* Waveform */}
      <StemWaveform
        peaks={session.parent_waveform_peaks}
        regionStartNorm={regionStartNorm}
        regionEndNorm={regionEndNorm}
      />

      {/* Transport */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleTogglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-[#7F77DD]/20 border border-[#7F77DD]/40
                     hover:bg-[#7F77DD]/30 text-[#7F77DD]
                     text-[11px] font-mono font-bold transition-colors"
        >
          {isPlaying ? <Square size={11} /> : <Play size={11} />}
          {isPlaying ? 'STOP' : 'PLAY'}
        </button>

        <button
          onClick={handleExtract}
          disabled={extracting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-white/5 border border-white/10
                     hover:bg-white/10 text-white/50 hover:text-white/80
                     text-[11px] font-mono font-bold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={extracting ? 'animate-spin' : ''} />
          EXTRACT REGION
        </button>

        <button
          onClick={handleSplit}
          disabled={splitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-[#7F77DD]/10 border border-[#7F77DD]/30
                     hover:bg-[#7F77DD]/20 text-[#7F77DD]
                     text-[11px] font-mono font-bold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={splitting ? 'animate-spin' : ''} />
          {hasSplitAlready ? 'RE-SPLIT SUBSTEMS' : 'SPLIT SUBSTEMS'}
        </button>
      </div>

      {/* Info strip */}
      <div className="flex items-center gap-4 border-t border-white/5 pt-3 flex-wrap">
        <InfoChip label="BPM" value={session.bpm.toFixed(1)} />
        <InfoChip label="Key" value={session.key ?? '—'} />
        <InfoChip label="Region" value={regionDuration > 0 ? `${session.region_start.toFixed(2)}s → ${session.region_end.toFixed(2)}s` : '—'} />
        <InfoChip label="Duration" value={regionDuration > 0 ? `${regionDuration.toFixed(2)}s` : '—'} />
        <InfoChip label="Mode" value={hasRealParent ? '5-Band FFT' : 'Placeholder'} dim={!hasRealParent} />
      </div>
    </div>
  );
}

function InfoChip({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-mono uppercase tracking-widest text-white/25">{label}</span>
      <span className={`text-[11px] font-mono font-bold ${dim ? 'text-white/25' : 'text-white/70'}`}>{value}</span>
    </div>
  );
}
