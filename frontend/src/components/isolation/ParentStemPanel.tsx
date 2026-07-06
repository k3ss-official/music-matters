/**
 * ParentStemPanel — waveform display, region overlay, transport controls,
 * and info strip (BPM / Key / Region / artifact score).
 *
 * Waveform is rendered as an SVG bar chart from waveform_peaks on the session
 * parent stem. Real WaveSurfer integration is a future step (placeholder here).
 */
import React, { useState } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import type { IsolationSession } from '../../types/isolation';
import { extractRegion, splitSubstems } from '../../services/isolationApi';

interface Props {
  session: IsolationSession;
  onSessionUpdate: (session: IsolationSession) => void;
}

function FakeWaveform({ regionStart, regionEnd }: { regionStart: number; regionEnd: number }) {
  const peaks = Array.from({ length: 160 }, (_, i) => {
    const phase = i * 0.31;
    const env = Math.sin((Math.PI * i) / 160);
    return Math.abs(Math.sin(phase) * 0.5 + Math.sin(phase * 2.3) * 0.3 + Math.sin(phase * 5.7) * 0.2) * env;
  });

  const regionLeft = `${(regionStart * 100).toFixed(1)}%`;
  const regionWidth = `${((regionEnd - regionStart) * 100).toFixed(1)}%`;

  return (
    <div className="relative w-full h-[72px] bg-[#0d0f1c] rounded overflow-hidden">
      {/* Region overlay */}
      {regionEnd > regionStart && (
        <div
          className="absolute top-0 h-full bg-[#7F77DD]/25 border-l border-r border-[#7F77DD]/70 z-10"
          style={{ left: regionLeft, width: regionWidth }}
        />
      )}
      {/* Waveform bars */}
      <svg className="w-full h-full" viewBox="0 0 160 72" preserveAspectRatio="none">
        {peaks.map((p, i) => {
          const barH = Math.max(1, p * 64);
          return (
            <rect
              key={i}
              x={i}
              y={(72 - barH) / 2}
              width={0.6}
              height={barH}
              fill="#7F77DD"
              opacity={0.6}
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

  const hasSplitAlready = session.substems.length > 0;

  const handleSplit = async () => {
    setSplitting(true);
    try {
      const updated = await splitSubstems(session.id);
      onSessionUpdate(updated);
    } finally {
      setSplitting(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await extractRegion(session.id);
    } finally {
      setExtracting(false);
    }
  };

  const regionDuration = session.region_end - session.region_start;
  const regionStartNorm = session.region_end > 0 ? session.region_start / session.region_end : 0;
  const regionEndNorm = session.region_end > 0 ? 1.0 : 0;

  return (
    <div className="bg-[#1a1830] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#7F77DD]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
            Parent Stem
          </span>
          <span className="text-[11px] font-mono text-white/70 ml-1">
            {session.parent_stem_name}
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/20 bg-[#7F77DD]/10 border border-[#7F77DD]/20 px-2 py-0.5 rounded">
          PLACEHOLDER
        </span>
      </div>

      {/* Waveform */}
      <FakeWaveform
        regionStart={regionStartNorm}
        regionEnd={regionEndNorm}
      />

      {/* Transport */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsPlaying(v => !v)}
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
          disabled={splitting || hasSplitAlready}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-[#7F77DD]/10 border border-[#7F77DD]/30
                     hover:bg-[#7F77DD]/20 text-[#7F77DD]
                     text-[11px] font-mono font-bold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={splitting ? 'animate-spin' : ''} />
          {hasSplitAlready ? 'SUBSTEMS READY' : 'SPLIT SUBSTEMS'}
        </button>
      </div>

      {/* Info strip */}
      <div className="flex items-center gap-4 border-t border-white/5 pt-3">
        <InfoChip label="BPM" value={session.bpm.toFixed(1)} />
        <InfoChip label="Key" value={session.key ?? '—'} />
        <InfoChip label="Region" value={regionDuration > 0 ? `${session.region_start.toFixed(2)}s → ${session.region_end.toFixed(2)}s` : '—'} />
        <InfoChip label="Duration" value={regionDuration > 0 ? `${regionDuration.toFixed(2)}s` : '—'} />
        <InfoChip label="Artifact Score" value="— [placeholder]" dim />
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
