import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { IsolationSession, Substem, EQ8Band } from '../types/isolation';
import type { LoopPreview } from '../types';
import {
  createIsolationSession,
  updateIsolationSession,
  splitSubstems,
  updateSubstem,
  isolateElement,
  previewIsolation,
  saveCompleteBundle,
  getIsolationAudioUrl,
} from '../services/isolationApi';
import { saveLoopBundle } from '../services/api';

interface UltraEditWindowProps {
  trackId: string;
  trackTitle: string;
  bpm: number;
  musicalKey: string;
  duration: number;
  loopStart: number;
  loopEnd: number;
  selectedBarCount: number;
  selectedBeatCount?: number | null;
  quantizeEnabled: boolean;
  activeStemName?: string;
  waveformPeaks?: number[];
  onLoopRegionChange: (start: number, end: number) => void;
  onSelectBeatLoop: (beats: number) => void;
  onSelectBarLoop: (bars: number) => void;
  onToggleQuantize: () => void;
  onLoopsSaved?: (loops: LoopPreview[]) => void;
}

const DEFAULT_EQ8: EQ8Band = {
  hz_31: 0,
  hz_63: 0,
  hz_125: 0,
  hz_250: 0,
  hz_500: 0,
  hz_1k: 0,
  hz_4k: 0,
  hz_12k: 0,
};

const EQ8_BANDS: Array<{ key: keyof EQ8Band; label: string; freq: string }> = [
  { key: 'hz_31', label: 'Sub', freq: '31Hz' },
  { key: 'hz_63', label: 'Punch', freq: '63Hz' },
  { key: 'hz_125', label: 'Warmth', freq: '125Hz' },
  { key: 'hz_250', label: 'Body', freq: '250Hz' },
  { key: 'hz_500', label: 'Box/Honk', freq: '500Hz' },
  { key: 'hz_1k', label: 'Presence', freq: '1kHz' },
  { key: 'hz_4k', label: 'Attack', freq: '4kHz' },
  { key: 'hz_12k', label: 'Air', freq: '12kHz' },
];

const QUICK_ELEMENTS = [
  { id: 'kick', label: 'Kick Drum', color: '#ff3b5c', desc: 'Sub + Beater Punch (38–145Hz)' },
  { id: 'bass', label: 'Bassline / Sub', color: '#f97316', desc: 'Deep Fundamental (22–220Hz)' },
  { id: 'vocal', label: 'Voice / Vocal', color: '#a855f7', desc: 'Center Formant (240–3.9kHz)' },
  { id: 'melody', label: 'Melody / Synth', color: '#00ff88', desc: 'Sustained Lead (320–4.6kHz)' },
  { id: 'snare', label: 'Snare / Clap', color: '#fbbf24', desc: 'Crack & Transient (160–4.2kHz)' },
  { id: 'hihat', label: 'Hi-Hat / Top', color: '#00d4ff', desc: 'Crisp Sizzle (4.8–18.5kHz)' },
];

interface RotaryPotProps {
  label: string;
  sublabel: string;
  valueDb: number;
  minDb?: number;
  maxDb?: number;
  accentColor: string;
  onChange: (val: number) => void;
}

const RotaryGainPot: React.FC<RotaryPotProps> = ({
  label,
  sublabel,
  valueDb,
  minDb = -18,
  maxDb = 12,
  accentColor,
  onChange,
}) => {
  const norm = Math.max(0, Math.min(1, (valueDb - minDb) / (maxDb - minDb)));
  const angle = -135 + norm * 270;

  return (
    <div className="flex flex-col items-center bg-[#09090f] border border-[#1e1e2c] rounded-lg px-2.5 py-2 select-none">
      <div className="text-[9px] font-mono font-bold tracking-wider text-zinc-300 uppercase">
        {label}
      </div>
      <div className="text-[8px] font-mono text-zinc-500 mb-1">{sublabel}</div>

      <div
        className="relative w-12 h-12 flex items-center justify-center cursor-pointer group"
        title="Double-click to reset to 0.0 dB"
        onDoubleClick={() => onChange(0)}
      >
        <svg viewBox="0 0 48 48" className="w-12 h-12">
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="#11111a"
            stroke="#27273a"
            strokeWidth="2.5"
          />
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke={accentColor}
            strokeWidth="2.5"
            strokeDasharray={`${norm * 90} 120`}
            strokeLinecap="round"
            transform="rotate(135 24 24)"
            opacity="0.85"
          />
          <g transform={`rotate(${angle} 24 24)`}>
            <line
              x1="24"
              y1="24"
              x2="24"
              y2="8"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="24" cy="9" r="1.8" fill="#ffffff" />
          </g>
          <circle cx="24" cy="24" r="4" fill="#1e1e2e" />
        </svg>
      </div>

      <input
        type="range"
        min={minDb}
        max={maxDb}
        step={0.5}
        value={valueDb}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20 h-1 accent-cyan-400 cursor-pointer my-1"
        aria-label={`${label} gain pot`}
      />

      <div className="flex items-center gap-1 mt-0.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(minDb, +(valueDb - 1.0).toFixed(1)))}
          className="px-1.5 py-0.2 text-[9px] font-mono bg-[#141420] hover:bg-[#1f1f30] text-zinc-400 rounded border border-[#252538]"
        >
          -
        </button>
        <span
          className="text-[10px] font-mono font-bold min-w-[44px] text-center"
          style={{ color: Math.abs(valueDb) > 0.05 ? accentColor : '#a1a1aa' }}
        >
          {valueDb > 0 ? `+${valueDb.toFixed(1)}` : valueDb.toFixed(1)} dB
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(maxDb, +(valueDb + 1.0).toFixed(1)))}
          className="px-1.5 py-0.2 text-[9px] font-mono bg-[#141420] hover:bg-[#1f1f30] text-zinc-400 rounded border border-[#252538]"
        >
          +
        </button>
      </div>
    </div>
  );
};

export const UltraEditWindow: React.FC<UltraEditWindowProps> = ({
  trackId,
  trackTitle,
  bpm,
  musicalKey,
  duration,
  loopStart,
  loopEnd,
  selectedBarCount,
  selectedBeatCount,
  quantizeEnabled,
  activeStemName = 'drums',
  waveformPeaks = [],
  onLoopRegionChange,
  onSelectBeatLoop,
  onSelectBarLoop,
  onToggleQuantize,
  onLoopsSaved,
}) => {
  const [session, setSession] = useState<IsolationSession | null>(null);
  const [eq8, setEq8] = useState<EQ8Band>(DEFAULT_EQ8);
  const [eqTargetIds, setEqTargetIds] = useState<string[]>([]);
  const [gainLeftDb, setGainLeftDb] = useState<number>(0);
  const [gainRightDb, setGainRightDb] = useState<number>(0);
  const [killLow, setKillLow] = useState<boolean>(false);
  const [killMid, setKillMid] = useState<boolean>(false);
  const [killHigh, setKillHigh] = useState<boolean>(false);
  const [postProduction, setPostProduction] = useState<boolean>(true);
  const [customElementPrompt, setCustomElementPrompt] = useState<string>('');
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savedBundleLoops, setSavedBundleLoops] = useState<LoopPreview[]>([]);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const effectiveBpm = bpm > 0 ? bpm : 120;
  const beatSec = 60 / effectiveBpm;
  const barSec = beatSec * 4;
  const loopLengthSec = Math.max(0.25, loopEnd - loopStart);
  const startBarNumber = Math.max(1, Math.round(loopStart / barSec) + 1);
  const beatCountApprox = Math.max(1, Math.round(loopLengthSec / beatSec));

  // Initialize or sync isolation session for the current track & loop window
  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    (async () => {
      try {
        const created = await createIsolationSession({
          source_track_id: trackId,
          parent_stem_name: activeStemName || 'drums',
          region_start: loopStart,
          region_end: loopEnd > loopStart ? loopEnd : Math.min(duration || 16, loopStart + barSec * 4),
          bpm: effectiveBpm,
          key: musicalKey || 'Am',
        });
        if (cancelled) return;
        const split = await splitSubstems(created.id);
        if (cancelled) return;
        setSession(split);
        if (split.substems.length > 0) {
          setEqTargetIds([split.substems[0].id]);
        }
      } catch {
        // Ignore transient init errors while track is still ingesting
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, activeStemName]);

  // Keep session region bounds synced when user changes loop selection on the head track
  useEffect(() => {
    if (!session || loopEnd <= loopStart) return;
    const timer = setTimeout(() => {
      updateIsolationSession(session.id, {
        region_start: loopStart,
        region_end: loopEnd,
        bpm: effectiveBpm,
      })
        .then((updated) => setSession(updated))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [loopStart, loopEnd, effectiveBpm]);

  const syncMasterDspToBackend = useCallback(
    async (overrides?: {
      nextEq8?: EQ8Band;
      nextTargets?: string[];
      nextGainL?: number;
      nextGainR?: number;
      nextKillL?: boolean;
      nextKillM?: boolean;
      nextKillH?: boolean;
      nextPostProd?: boolean;
    }) => {
      if (!session) return null;
      const payload = {
        eq_target_ids: overrides?.nextTargets ?? eqTargetIds,
        master_eq_8band: overrides?.nextEq8 ?? eq8,
        master_gain_left_db: overrides?.nextGainL ?? gainLeftDb,
        master_gain_right_db: overrides?.nextGainR ?? gainRightDb,
        master_kill_low: overrides?.nextKillL ?? killLow,
        master_kill_mid: overrides?.nextKillM ?? killMid,
        master_kill_high: overrides?.nextKillH ?? killHigh,
        post_production: overrides?.nextPostProd ?? postProduction,
      };
      try {
        const updated = await updateIsolationSession(session.id, payload);
        setSession(updated);
        return updated;
      } catch {
        return null;
      }
    },
    [session, eqTargetIds, eq8, gainLeftDb, gainRightDb, killLow, killMid, killHigh, postProduction],
  );

  const handleEqBandChange = (key: keyof EQ8Band, val: number) => {
    const next = { ...eq8, [key]: val };
    setEq8(next);
    syncMasterDspToBackend({ nextEq8: next });
  };

  const handleApplyEqPreset = (preset: 'flat' | 'kick' | 'vocal' | 'sub' | 'melody' | 'hihat') => {
    const map: Record<string, EQ8Band> = {
      flat: DEFAULT_EQ8,
      kick: { hz_31: 4.5, hz_63: 6.0, hz_125: 2.0, hz_250: -4.5, hz_500: -3.0, hz_1k: 1.5, hz_4k: 3.5, hz_12k: -6.0 },
      sub: { hz_31: 6.5, hz_63: 5.0, hz_125: 1.5, hz_250: -6.0, hz_500: -10.0, hz_1k: -12.0, hz_4k: -15.0, hz_12k: -15.0 },
      vocal: { hz_31: -12.0, hz_63: -9.0, hz_125: -3.0, hz_250: 1.5, hz_500: 2.5, hz_1k: 4.5, hz_4k: 5.0, hz_12k: 3.5 },
      melody: { hz_31: -10.0, hz_63: -6.0, hz_125: 0.0, hz_250: 2.5, hz_500: 3.5, hz_1k: 5.0, hz_4k: 4.0, hz_12k: 2.0 },
      hihat: { hz_31: -15.0, hz_63: -15.0, hz_125: -12.0, hz_250: -8.0, hz_500: -4.0, hz_1k: 1.0, hz_4k: 5.5, hz_12k: 7.5 },
    };
    const next = map[preset] || DEFAULT_EQ8;
    setEq8(next);
    syncMasterDspToBackend({ nextEq8: next });
  };

  const handleToggleTargetSound = (subId: string) => {
    const next = eqTargetIds.includes(subId)
      ? eqTargetIds.filter((id) => id !== subId)
      : [...eqTargetIds, subId];
    setEqTargetIds(next);
    syncMasterDspToBackend({ nextTargets: next });
  };

  const handleIsolateElement = async (elementKey: string) => {
    if (!session || !elementKey.trim()) return;
    setBusyAction(`Isolating ${elementKey}...`);
    setActiveElementId(elementKey);
    try {
      await updateIsolationSession(session.id, {
        region_start: loopStart,
        region_end: loopEnd,
        bpm: effectiveBpm,
      });
      const updated = await isolateElement(session.id, elementKey.trim(), true);
      setSession(updated);
      if (updated.eq_target_ids) {
        setEqTargetIds(updated.eq_target_ids);
      }
      setStatusMessage(`Isolated "${elementKey}" into Ultra Edit lane & assigned to 8-Ch Graphic EQ`);
    } catch (err: any) {
      setStatusMessage(`Element isolation failed: ${err?.message || 'error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubstemToggle = async (sub: Substem, field: 'solo' | 'muted' | 'kill_low' | 'kill_mid' | 'kill_high') => {
    if (!session) return;
    const nextVal = !Boolean(sub[field]);
    try {
      const updated = await updateSubstem(session.id, sub.id, { [field]: nextVal });
      setSession(updated);
    } catch {
      // ignore
    }
  };

  const handleAuditionPreview = async () => {
    if (!session) return;
    if (isAuditioning && audioRef.current) {
      audioRef.current.pause();
      setIsAuditioning(false);
      return;
    }
    setBusyAction('Rendering Ultra-Edit Audition...');
    try {
      await syncMasterDspToBackend();
      const res = await previewIsolation(session.id);
      if (res.status === 'mixed') {
        const url = getIsolationAudioUrl(session.id, 'preview', Date.now());
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.onended = () => setIsAuditioning(false);
        }
        audioRef.current.src = url;
        audioRef.current.loop = true;
        await audioRef.current.play();
        setIsAuditioning(true);
        setStatusMessage(
          postProduction
            ? 'Auditioning Ultra-Edit with Studio Post-Production Mastering (-0.3 dBFS)'
            : 'Auditioning Ultra-Edit loop (pre-master)',
        );
      } else {
        // Re-split if region was changed and substems were cleared
        const split = await splitSubstems(session.id);
        setSession(split);
        const retry = await previewIsolation(session.id);
        if (retry.status === 'mixed') {
          const url = getIsolationAudioUrl(session.id, 'preview', Date.now());
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.onended = () => setIsAuditioning(false);
          }
          audioRef.current.src = url;
          audioRef.current.loop = true;
          await audioRef.current.play();
          setIsAuditioning(true);
        }
      }
    } catch (err: any) {
      setStatusMessage(`Audition error: ${err?.message || 'failed'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveWorkflow = async (mode: 'isolated_only' | 'complete_loop' | 'full_bundle_with_6_stems') => {
    setBusyAction(
      mode === 'full_bundle_with_6_stems'
        ? 'Saving Isolated Sound + Complete Loop + 6 Stems...'
        : mode === 'complete_loop'
          ? 'Saving Complete Mastered Loop...'
          : 'Saving Ultra-Edited Isolated Sound...',
    );
    try {
      const label = `Bar ${startBarNumber} (${selectedBeatCount ? `${selectedBeatCount} Beats` : `${selectedBarCount}B`})`;
      if (session) {
        await updateIsolationSession(session.id, {
          region_start: loopStart,
          region_end: loopEnd,
          bpm: effectiveBpm,
          eq_target_ids: eqTargetIds,
          master_eq_8band: eq8,
          master_gain_left_db: gainLeftDb,
          master_gain_right_db: gainRightDb,
          master_kill_low: killLow,
          master_kill_mid: killMid,
          master_kill_high: killHigh,
          post_production: postProduction,
        });
        if (!session.substems || session.substems.length === 0) {
          await splitSubstems(session.id);
        }
        const res = await saveCompleteBundle(session.id, {
          label,
          save_isolated_sound: mode === 'isolated_only' || mode === 'full_bundle_with_6_stems',
          save_complete_loop: mode === 'complete_loop' || mode === 'full_bundle_with_6_stems',
          save_six_stems: mode === 'full_bundle_with_6_stems',
          post_production: postProduction,
        });
        const loops: LoopPreview[] = (res.saved_loops || []).map((l: any) => ({
          id: l.id,
          label: l.label,
          startBar: l.start_bar ?? l.startBar ?? startBarNumber,
          barCount: l.bar_count ?? l.barCount ?? selectedBarCount,
          stem: l.stem || 'mixdown',
          bpm: l.bpm || effectiveBpm,
          key: l.musical_key ?? l.key ?? musicalKey,
          fileUrl: l.file_url ?? l.fileUrl,
          energy: l.energy,
          tags: l.tags || [],
        }));
        setSavedBundleLoops(loops);
        onLoopsSaved?.(loops);
        setStatusMessage(res.message || `Saved ${loops.length} studio loop files!`);
      } else {
        const bundle = await saveLoopBundle(trackId, {
          start_time: loopStart,
          end_time: loopEnd,
          label,
          include_all_stems: mode === 'full_bundle_with_6_stems',
          post_production: postProduction,
        });
        const all = [
          ...(bundle.complete_loop ? [bundle.complete_loop] : []),
          ...(bundle.stem_loops || []),
        ];
        setSavedBundleLoops(all);
        onLoopsSaved?.(all);
        setStatusMessage(`Saved ${all.length} loop format files (Complete Loop + 6 Stems)`);
      }
    } catch (err: any) {
      setStatusMessage(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  // Extract zoom slice of peaks corresponding to [loopStart, loopEnd]
  const zoomedPeaks = React.useMemo(() => {
    const src =
      session?.substems?.find((s) => s.solo)?.waveform_peaks ||
      session?.substems?.[0]?.waveform_peaks ||
      waveformPeaks;
    if (!src || src.length === 0) {
      return Array.from({ length: 96 }, (_, i) =>
        Math.abs(Math.sin(i * 0.25) * 0.65 + Math.cos(i * 0.6) * 0.25),
      );
    }
    if (duration > 0 && src === waveformPeaks) {
      const sIdx = Math.max(0, Math.floor((loopStart / duration) * src.length));
      const eIdx = Math.min(src.length, Math.max(sIdx + 8, Math.ceil((loopEnd / duration) * src.length)));
      const slice = src.slice(sIdx, eIdx);
      return slice.length > 0 ? slice : src;
    }
    return src;
  }, [session, waveformPeaks, duration, loopStart, loopEnd]);

  // Build SVG path for the 8-band EQ frequency curve
  const eqCurvePoints = React.useMemo(() => {
    const vals = EQ8_BANDS.map((b) => eq8[b.key]);
    return vals
      .map((db, idx) => {
        const x = 16 + (idx / (vals.length - 1)) * 248;
        const y = 36 - (db / 15) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [eq8]);

  return (
    <section
      data-testid="ultra-edit-window"
      className="bg-[#08080e] border border-[#1f1f30] rounded-xl overflow-hidden shadow-2xl"
    >
      {/* Top Chef's Kiss Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-r from-[#0e0e18] via-[#121222] to-[#0e0e18] border-b border-[#1f1f30]">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[10px] font-mono font-bold tracking-widest uppercase">
            CHEF&apos;S KISS · ULTRA EDIT WINDOW
          </span>
          <span className="text-xs font-semibold text-zinc-200 truncate max-w-[220px]">
            {trackTitle}
          </span>
          <span className="text-[11px] font-mono text-zinc-400 bg-[#151524] px-2 py-0.5 rounded border border-[#242438]">
            Bar {startBarNumber} · {loopStart.toFixed(2)}s – {loopEnd.toFixed(2)}s ({loopLengthSec.toFixed(2)}s · {beatCountApprox} Beats)
          </span>
        </div>

        {/* Quantized Beat & Bar Snap-To Loop Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleQuantize}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all border ${
              quantizeEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-[#13131f] text-zinc-500 border-[#232336]'
            }`}
            title="Snap loop cleanly to beatgrid"
          >
            QUANTIZE SNAP: {quantizeEnabled ? 'ON' : 'OFF'}
          </button>

          <div className="flex items-center bg-[#0c0c14] border border-[#222234] rounded p-0.5 gap-0.5">
            <span className="text-[9px] font-mono text-zinc-500 px-1.5 uppercase">Beats:</span>
            {[1, 2, 4].map((beats) => (
              <button
                key={`beat-${beats}`}
                type="button"
                onClick={() => onSelectBeatLoop(beats)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                  selectedBeatCount === beats
                    ? 'bg-pink-500 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#191928]'
                }`}
              >
                {beats}B
              </button>
            ))}
          </div>

          <div className="flex items-center bg-[#0c0c14] border border-[#222234] rounded p-0.5 gap-0.5">
            <span className="text-[9px] font-mono text-zinc-500 px-1.5 uppercase">Bars:</span>
            {[1, 2, 4, 8, 16].map((bars) => (
              <button
                key={`bar-${bars}`}
                type="button"
                onClick={() => onSelectBarLoop(bars)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                  !selectedBeatCount && selectedBarCount === bars
                    ? 'bg-cyan-400 text-black'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#191928]'
                }`}
              >
                {bars} Bar{bars > 1 ? 's' : ''}
              </button>
            ))}
          </div>

          {/* Studio Post-Production Process Toggle */}
          <button
            type="button"
            data-testid="post-production-toggle"
            onClick={() => {
              const next = !postProduction;
              setPostProduction(next);
              syncMasterDspToBackend({ nextPostProd: next });
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all border ${
              postProduction
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_14px_rgba(245,158,11,0.25)]'
                : 'bg-[#141420] text-zinc-400 border-[#262638]'
            }`}
            title="Final Post-Production Studio Process: DC re-center, harmonic warmth exciter, studio bus glue & -0.3 dBFS true-peak limiter"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                postProduction ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            POST-PROD STUDIO MASTER: {postProduction ? 'ON (-0.3 dBFS)' : 'BYPASS'}
          </button>
        </div>
      </div>

      {/* Main Ultra-Edit Body: Left = Expanded Loop + Deep Element Isolator + Substem Lanes; Right = 8-Ch Single Graphic EQ + L/R Gain Pots + Lo/Mid/Hi Kills */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 p-3.5">
        {/* LEFT 7 COLUMNS: Zoomed Snap-To Loop + Surgical Element Isolator + Multi-Sound Lanes */}
        <div className="xl:col-span-7 flex flex-col gap-3">
          {/* Expanded Snap-To Loop Waveform Display */}
          <div className="bg-[#0c0c15] border border-[#1d1d2d] rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                  EXPANDED SNAP-TO LOOP VIEW
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {effectiveBpm.toFixed(1)} BPM · Key {musicalKey || 'Am'}
                </span>
              </div>

              {/* Fine Beat / Bar Jog Controls */}
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    const nextStart = Math.max(0, loopStart - beatSec);
                    const nextEnd = Math.max(nextStart + beatSec * 0.5, loopEnd - beatSec);
                    onLoopRegionChange(nextStart, nextEnd);
                  }}
                  className="px-2 py-0.5 rounded bg-[#151524] hover:bg-[#202036] text-zinc-300 border border-[#26263a]"
                  title="Shift Loop Left 1 Beat"
                >
                  ◀ -1 Beat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const maxDur = duration > 0 ? duration : loopEnd + barSec * 4;
                    const len = loopEnd - loopStart;
                    const nextStart = Math.min(maxDur - len, loopStart + beatSec);
                    onLoopRegionChange(Math.max(0, nextStart), Math.min(maxDur, nextStart + len));
                  }}
                  className="px-2 py-0.5 rounded bg-[#151524] hover:bg-[#202036] text-zinc-300 border border-[#26263a]"
                  title="Shift Loop Right 1 Beat"
                >
                  +1 Beat ▶
                </button>
                <button
                  type="button"
                  onClick={handleAuditionPreview}
                  className={`ml-1 px-2.5 py-0.5 rounded font-bold transition-all border ${
                    isAuditioning
                      ? 'bg-pink-500 text-white border-pink-400'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  }`}
                >
                  {isAuditioning ? '■ Stop Audition' : '▶ Audition Ultra-Edit'}
                </button>
              </div>
            </div>

            {/* Zoomed Loop Bar/Beat Grid + Waveform Bars */}
            <div className="relative h-24 bg-[#07070c] border border-[#191926] rounded-md overflow-hidden flex items-center px-2">
              {/* Beat grid lines */}
              {Array.from({ length: Math.min(16, Math.max(4, beatCountApprox)) }).map((_, bIdx, arr) => (
                <div
                  key={`grid-${bIdx}`}
                  style={{ left: `${(bIdx / arr.length) * 100}%` }}
                  className={`absolute top-0 bottom-0 border-l ${
                    bIdx % 4 === 0 ? 'border-cyan-400/30' : 'border-zinc-800/70'
                  } pointer-events-none`}
                >
                  <span className="text-[8px] font-mono text-zinc-500 pl-1">
                    {bIdx % 4 === 0 ? `B${Math.floor(bIdx / 4) + startBarNumber}` : `.${(bIdx % 4) + 1}`}
                  </span>
                </div>
              ))}

              {/* Waveform Peak Bars */}
              <div className="w-full h-16 flex items-center justify-between gap-[1.5px] z-10">
                {zoomedPeaks.slice(0, 120).map((pk, idx) => {
                  const pct = Math.max(8, Math.min(100, Math.round(pk * 100)));
                  const isKilled = killLow && killMid && killHigh;
                  return (
                    <div
                      key={idx}
                      style={{
                        height: `${isKilled ? 4 : pct}%`,
                        background: postProduction
                          ? 'linear-gradient(180deg, #fbbf24 0%, #00d4ff 50%, #ff3b5c 100%)'
                          : 'linear-gradient(180deg, #00d4ff 0%, #6366f1 100%)',
                      }}
                      className="flex-1 rounded-full opacity-90 transition-all duration-150"
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Deep Element Isolator ("isolate a beat, a sound, a melody, a kick drum, a voice...") */}
          <div className="bg-[#0c0c15] border border-[#1d1d2d] rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                DEEP ELEMENT ISOLATOR · TARGET HIDDEN SOUND IN LOOP
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                1-click spectral + transient surgical targeter
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 mb-2">
              {QUICK_ELEMENTS.map((el) => {
                const active = activeElementId === el.id;
                return (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => handleIsolateElement(el.id)}
                    className={`flex flex-col items-start p-2 rounded-md border text-left transition-all ${
                      active
                        ? 'bg-[#19192b] border-cyan-400 shadow-[0_0_10px_rgba(0,212,255,0.2)]'
                        : 'bg-[#10101b] border-[#222234] hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: el.color }}
                      />
                      <span className="text-[10px] font-mono font-bold text-zinc-100 truncate">
                        {el.label}
                      </span>
                    </div>
                    <span className="text-[8px] font-mono text-zinc-500 mt-0.5 line-clamp-1">
                      {el.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom natural-language sound targeter */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customElementPrompt}
                onChange={(e) => setCustomElementPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customElementPrompt.trim()) {
                    handleIsolateElement(customElementPrompt);
                  }
                }}
                placeholder="Or describe any hidden sound to isolate (e.g. 'acid synth stab', 'percussion shaker', 'vocal chop')..."
                className="flex-1 bg-[#08080f] border border-[#232336] rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <button
                type="button"
                onClick={() => customElementPrompt.trim() && handleIsolateElement(customElementPrompt)}
                className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-[10px] font-mono font-bold uppercase whitespace-nowrap"
              >
                Isolate Sound
              </button>
            </div>
          </div>

          {/* Multi-Sound Edit Window Lanes (assign 8-Ch EQ to one or more sounds + per-sound Kill & Solo/Mute) */}
          <div className="bg-[#0c0c15] border border-[#1d1d2d] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                SOUNDS IN EDIT WINDOW ({session?.substems?.length || 5} LAYERS)
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                Click [EQ ASSIGN] on one or more sounds to route through the 8-Channel Graphic EQ
              </span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {(session?.substems || []).map((sub) => {
                const isEqAssigned = eqTargetIds.includes(sub.id);
                return (
                  <div
                    key={sub.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border transition-all ${
                      isEqAssigned
                        ? 'bg-[#131324] border-cyan-500/50'
                        : 'bg-[#090912] border-[#1d1d2b]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color || '#00d4ff' }}
                      />
                      <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                        {sub.name}
                      </span>
                    </div>

                    {/* Mini waveform bar preview */}
                    <div className="hidden sm:flex items-center gap-[1px] h-5 w-28 bg-[#06060b] px-1 rounded">
                      {(sub.waveform_peaks || []).slice(0, 28).map((p, i) => (
                        <div
                          key={i}
                          style={{
                            height: `${Math.max(15, Math.round(p * 100))}%`,
                            backgroundColor: sub.color || '#00d4ff',
                          }}
                          className="flex-1 rounded-sm opacity-75"
                        />
                      ))}
                    </div>

                    {/* Controls: EQ Assign (multi-sound), Solo, Mute, Per-Sound Lo/Mid/Hi Kills */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleTargetSound(sub.id)}
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border transition-all ${
                          isEqAssigned
                            ? 'bg-cyan-400 text-black border-cyan-300'
                            : 'bg-[#141422] text-zinc-400 border-[#26263a] hover:text-zinc-200'
                        }`}
                        title="Assign the 8-Channel Single Graphic EQ to this sound"
                      >
                        {isEqAssigned ? '✓ EQ ASSIGNED' : '+ EQ ASSIGN'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSubstemToggle(sub, 'solo')}
                        className={`w-6 h-5 rounded text-[9px] font-mono font-bold border ${
                          sub.solo
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-[#141422] text-zinc-400 border-[#252538]'
                        }`}
                        title="Solo this sound"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubstemToggle(sub, 'muted')}
                        className={`w-6 h-5 rounded text-[9px] font-mono font-bold border ${
                          sub.muted
                            ? 'bg-rose-500 text-white border-rose-400'
                            : 'bg-[#141422] text-zinc-400 border-[#252538]'
                        }`}
                        title="Mute this sound"
                      >
                        M
                      </button>

                      {/* Per-sound Lo / Mid / Hi Kill mini switches */}
                      {(['kill_low', 'kill_mid', 'kill_high'] as const).map((kField, kIdx) => {
                        const labels = ['LO', 'MID', 'HI'];
                        const activeKill = Boolean(sub[kField]);
                        return (
                          <button
                            key={kField}
                            type="button"
                            onClick={() => handleSubstemToggle(sub, kField)}
                            className={`px-1.5 h-5 rounded text-[8px] font-mono font-bold border ${
                              activeKill
                                ? 'bg-red-600 text-white border-red-400'
                                : 'bg-[#12121e] text-zinc-500 border-[#232336] hover:text-zinc-300'
                            }`}
                            title={`Kill ${labels[kIdx]} frequencies on ${sub.name}`}
                          >
                            {labels[kIdx]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLUMNS: 8-Channel Single Graphic EQ + Left/Right Gain Pots + Lo-Mid-Hi Kill Switches */}
        <div className="xl:col-span-5 flex flex-col gap-3">
          {/* 8-Channel Single Graphic EQ Card */}
          <div
            data-testid="eight-channel-eq"
            className="bg-[#0c0c15] border border-[#1d1d2d] rounded-lg p-3 flex flex-col justify-between"
          >
            <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                  8-CHANNEL SINGLE GRAPHIC EQ
                </div>
                <div className="text-[9px] font-mono text-zinc-500">
                  Assigned to {eqTargetIds.length > 0 ? `${eqTargetIds.length} sound(s)` : 'Master Edit Bus'}
                </div>
              </div>

              {/* EQ Presets */}
              <div className="flex flex-wrap items-center gap-1">
                {(['kick', 'sub', 'vocal', 'melody', 'hihat', 'flat'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleApplyEqPreset(p)}
                    className="px-1.5 py-0.5 rounded bg-[#151524] hover:bg-[#222238] text-[9px] font-mono text-zinc-300 border border-[#26263b] uppercase"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Live SVG Frequency Response Curve */}
            <div className="h-16 bg-[#07070d] border border-[#191928] rounded mb-2.5 px-2 flex items-center justify-center">
              <svg viewBox="0 0 280 72" className="w-full h-14 overflow-visible">
                <line x1="16" y1="36" x2="264" y2="36" stroke="#27273a" strokeDasharray="3 3" strokeWidth="1" />
                <polyline
                  fill="none"
                  stroke="#00d4ff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={eqCurvePoints}
                />
              </svg>
            </div>

            {/* 8 Vertical Graphic EQ Sliders */}
            <div className="grid grid-cols-8 gap-1.5 pt-1 pb-1 bg-[#080810] border border-[#181826] rounded-lg px-2">
              {EQ8_BANDS.map((band) => {
                const val = eq8[band.key];
                return (
                  <div key={band.key} className="flex flex-col items-center py-1">
                    <span
                      className={`text-[9px] font-mono font-bold mb-1 ${
                        Math.abs(val) > 0.1 ? 'text-cyan-300' : 'text-zinc-500'
                      }`}
                    >
                      {val > 0 ? `+${val.toFixed(0)}` : val.toFixed(0)}
                    </span>
                    <div className="h-24 flex items-center justify-center">
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        step={0.5}
                        value={val}
                        onChange={(e) => handleEqBandChange(band.key, parseFloat(e.target.value))}
                        onDoubleClick={() => handleEqBandChange(band.key, 0)}
                        style={{
                          writingMode: 'vertical-lr',
                          direction: 'rtl',
                        }}
                        className="h-20 w-4 accent-cyan-400 cursor-pointer"
                        aria-label={`EQ ${band.freq}`}
                      />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-zinc-300 mt-1">
                      {band.freq}
                    </span>
                    <span className="text-[8px] font-mono text-zinc-500">{band.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual Left & Right Gain Pots + Hardware Lo / Mid / Hi Kill Buttons */}
          <div className="bg-[#0c0c15] border border-[#1d1d2d] rounded-lg p-3">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300 mb-2">
              STEREO L/R GAIN POTS &amp; CROSSOVER KILL SWITCHES
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-center">
              <RotaryGainPot
                label="LEFT POT"
                sublabel="L Channel Gain"
                valueDb={gainLeftDb}
                accentColor="#00d4ff"
                onChange={(val) => {
                  setGainLeftDb(val);
                  syncMasterDspToBackend({ nextGainL: val });
                }}
              />

              <RotaryGainPot
                label="RIGHT POT"
                sublabel="R Channel Gain"
                valueDb={gainRightDb}
                accentColor="#ff3b5c"
                onChange={(val) => {
                  setGainRightDb(val);
                  syncMasterDspToBackend({ nextGainR: val });
                }}
              />

              {/* Lo / Mid / Hi Kill Buttons */}
              <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5 bg-[#09090f] border border-[#1e1e2c] rounded-lg p-2.5">
                <div className="text-[9px] font-mono font-bold text-zinc-400 uppercase text-center mb-0.5">
                  3-BAND KILL BUTTONS
                </div>
                <button
                  type="button"
                  data-testid="kill-high-btn"
                  onClick={() => {
                    const next = !killHigh;
                    setKillHigh(next);
                    syncMasterDspToBackend({ nextKillH: next });
                  }}
                  className={`py-1.5 px-2 rounded font-mono text-[10px] font-bold uppercase border transition-all ${
                    killHigh
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                      : 'bg-[#141422] text-zinc-300 border-[#27273a] hover:border-red-500/40'
                  }`}
                >
                  {killHigh ? '● HI KILLED (>2.5k)' : '○ HI KILL (>2.5k)'}
                </button>

                <button
                  type="button"
                  data-testid="kill-mid-btn"
                  onClick={() => {
                    const next = !killMid;
                    setKillMid(next);
                    syncMasterDspToBackend({ nextKillM: next });
                  }}
                  className={`py-1.5 px-2 rounded font-mono text-[10px] font-bold uppercase border transition-all ${
                    killMid
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                      : 'bg-[#141422] text-zinc-300 border-[#27273a] hover:border-red-500/40'
                  }`}
                >
                  {killMid ? '● MID KILLED' : '○ MID KILL (200-2.5k)'}
                </button>

                <button
                  type="button"
                  data-testid="kill-low-btn"
                  onClick={() => {
                    const next = !killLow;
                    setKillLow(next);
                    syncMasterDspToBackend({ nextKillL: next });
                  }}
                  className={`py-1.5 px-2 rounded font-mono text-[10px] font-bold uppercase border transition-all ${
                    killLow
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                      : 'bg-[#141422] text-zinc-300 border-[#27273a] hover:border-red-500/40'
                  }`}
                >
                  {killLow ? '● LO KILLED (<200Hz)' : '○ LO KILL (<200Hz)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save & Project Export Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0c0c16] border-t border-[#1f1f30]">
        <div className="flex items-center gap-2 text-xs font-mono">
          {busyAction ? (
            <span className="text-amber-300 animate-pulse font-semibold">{busyAction}</span>
          ) : statusMessage ? (
            <span className="text-emerald-400 font-semibold">{statusMessage}</span>
          ) : (
            <span className="text-zinc-400">
              Ready to save isolated street sound, complete quantized loop, and all 6 stems for future projects.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSaveWorkflow('isolated_only')}
            disabled={Boolean(busyAction)}
            className="px-3 py-1.5 rounded-lg bg-[#161628] hover:bg-[#20203a] text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all"
          >
            1. Save Isolated Sound
          </button>

          <button
            type="button"
            onClick={() => handleSaveWorkflow('complete_loop')}
            disabled={Boolean(busyAction)}
            className="px-3 py-1.5 rounded-lg bg-[#161628] hover:bg-[#20203a] text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold transition-all"
          >
            2. Save Complete Loop
          </button>

          <button
            type="button"
            data-testid="save-complete-and-6-stems-btn"
            onClick={() => handleSaveWorkflow('full_bundle_with_6_stems')}
            disabled={Boolean(busyAction)}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 hover:opacity-95 text-white text-xs font-mono font-bold shadow-[0_0_20px_rgba(0,212,255,0.3)] transition-all"
          >
            ★ Save Isolated Sound + Complete Loop + All 6 Stems
          </button>
        </div>
      </div>

      {/* Saved Loop Format Files Drawer (appears once saved so user can immediately audition/download) */}
      {savedBundleLoops.length > 0 && (
        <div className="px-4 py-2.5 bg-[#06060b] border-t border-[#191928]">
          <div className="text-[10px] font-mono font-bold uppercase text-emerald-400 mb-1.5">
            SAVED LOOP FORMAT FILES READY FOR FUTURE PROJECTS ({savedBundleLoops.length} FILES)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {savedBundleLoops.map((loop) => (
              <a
                key={loop.id}
                href={loop.fileUrl || `/api/library/tracks/${trackId}/loops/${loop.id}/audio`}
                download={`${loop.label.replace(/\s+/g, '_')}.wav`}
                className="flex flex-col justify-between p-2 rounded bg-[#0e0e18] hover:bg-[#171728] border border-[#242438] text-left transition-all"
              >
                <span className="text-[10px] font-mono font-bold text-zinc-200 truncate">
                  {loop.stem.toUpperCase()}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 truncate mt-0.5">
                  {loop.label}
                </span>
                <span className="text-[8px] font-mono text-cyan-400 mt-1 uppercase">
                  ↓ WAV ({loop.barCount}B · {Math.round(loop.bpm)} BPM)
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
