/**
 * SubstemEQShaper — Active Substem EQ / Shaper panel.
 *
 * Contains:
 *  - Target selector: Substem 1–5 + Combined Selection buttons
 *  - Five tall vertical EQ faders: Low 80Hz, Low-Mid 240Hz, Mid 1.2kHz,
 *    High-Mid 5kHz, High 12kHz  (range: -12 dB to +12 dB)
 *  - Output meter (placeholder bar)
 *  - Bypass / Reset buttons
 *
 * NON-NEGOTIABLE: EQ controls live ONLY here, not in substem rows.
 */
import React, { useState, useCallback } from 'react';
import type { IsolationSession, EQ5Band } from '../../types/isolation';
import { updateSubstem } from '../../services/isolationApi';

interface Props {
  session: IsolationSession;
  onSessionUpdate: (session: IsolationSession) => void;
}

const EQ_BANDS: { key: keyof EQ5Band; label: string; freq: string }[] = [
  { key: 'low_db',      label: 'Low',      freq: '80Hz'   },
  { key: 'low_mid_db',  label: 'Low-Mid',  freq: '240Hz'  },
  { key: 'mid_db',      label: 'Mid',      freq: '1.2kHz' },
  { key: 'high_mid_db', label: 'High-Mid', freq: '5kHz'   },
  { key: 'high_db',     label: 'High',     freq: '12kHz'  },
];

const GAIN_MIN = -12;
const GAIN_MAX = 12;

function gainToPercent(db: number): number {
  return ((db - GAIN_MAX) / (GAIN_MIN - GAIN_MAX)) * 100;
}

interface EQFaderProps {
  band: typeof EQ_BANDS[0];
  value: number;
  bypassed: boolean;
  onChange: (key: keyof EQ5Band, db: number) => void;
}

function EQFader({ band, value, bypassed, onChange }: EQFaderProps) {
  const thumbTop = gainToPercent(value);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (bypassed) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientY - rect.top) / rect.height;
      const db = GAIN_MAX + pct * (GAIN_MIN - GAIN_MAX);
      onChange(band.key, Math.max(GAIN_MIN, Math.min(GAIN_MAX, Math.round(db * 2) / 2)));
    },
    [bypassed, band.key, onChange],
  );

  const isZero = Math.abs(value) < 0.1;
  const isBoost = value > 0;

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      {/* dB readout */}
      <div className={`text-[10px] font-mono font-bold w-full text-center
        ${bypassed ? 'text-white/20' : isZero ? 'text-white/40' : isBoost ? 'text-[#1D9E75]' : 'text-[#ff3b5c]'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}
      </div>

      {/* Fader track */}
      <div
        onClick={handleClick}
        className={`relative w-6 h-[120px] rounded-full cursor-pointer
          ${bypassed ? 'bg-white/5' : 'bg-white/[0.07] hover:bg-white/10'}
          transition-colors`}
        title={`${band.label} (${band.freq}): ${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
      >
        {/* Zero line */}
        <div className="absolute left-0 right-0 h-px bg-white/10 top-1/2" />

        {/* Fill bar */}
        {!isZero && (
          <div
            className={`absolute left-1 right-1 rounded-sm
              ${isBoost ? 'bg-[#1D9E75]/60' : 'bg-[#ff3b5c]/60'}`}
            style={
              isBoost
                ? { bottom: '50%', height: `${Math.abs(value / GAIN_MAX) * 50}%` }
                : { top: '50%', height: `${Math.abs(value / GAIN_MIN) * 50}%` }
            }
          />
        )}

        {/* Thumb */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-5 h-2.5 rounded
            ${bypassed ? 'bg-white/10' : 'bg-white/60 shadow-md'}
            transition-all`}
          style={{ top: `calc(${thumbTop}% - 5px)` }}
        />
      </div>

      {/* Labels */}
      <div className={`text-[9px] font-mono font-bold text-center leading-tight
        ${bypassed ? 'text-white/20' : 'text-white/50'}`}>
        {band.label}
      </div>
      <div className={`text-[9px] font-mono text-center
        ${bypassed ? 'text-white/10' : 'text-white/25'}`}>
        {band.freq}
      </div>
    </div>
  );
}

export function SubstemEQShaper({ session, onSessionUpdate }: Props) {
  const [bypassed, setBypassed] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeTargetId = session.active_eq_target;
  const activeSubstem = session.substems.find(s => s.id === activeTargetId);

  const currentEQ: EQ5Band = activeSubstem?.eq_5band ?? {
    low_db: 0, low_mid_db: 0, mid_db: 0, high_mid_db: 0, high_db: 0,
  };

  const selectedSubstems = session.substems.filter(s => s.selected);
  const isCombined = activeTargetId === '__combined__';

  const handleBandChange = useCallback(
    async (key: keyof EQ5Band, db: number) => {
      if (!activeSubstem || bypassed || saving) return;
      setSaving(true);
      try {
        const newEQ = { ...currentEQ, [key]: db };
        const updated = await updateSubstem(session.id, activeSubstem.id, { eq_5band: newEQ });
        onSessionUpdate(updated);
      } finally {
        setSaving(false);
      }
    },
    [activeSubstem, bypassed, saving, session.id, currentEQ, onSessionUpdate],
  );

  const handleReset = useCallback(async () => {
    if (!activeSubstem || saving) return;
    setSaving(true);
    try {
      const zeroEQ: EQ5Band = { low_db: 0, low_mid_db: 0, mid_db: 0, high_mid_db: 0, high_db: 0 };
      const updated = await updateSubstem(session.id, activeSubstem.id, { eq_5band: zeroEQ });
      onSessionUpdate(updated);
    } finally {
      setSaving(false);
    }
  }, [activeSubstem, saving, session.id, onSessionUpdate]);

  return (
    <div className="bg-[#1a1830] border border-white/5 rounded-xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#7F77DD]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
            Active Substem EQ / Shaper
          </span>
        </div>
        {saving && (
          <span className="text-[9px] font-mono text-white/30 animate-pulse">saving…</span>
        )}
      </div>

      {/* Target selector */}
      <div className="flex flex-wrap gap-1.5">
        {session.substems.map((sub, i) => (
          <button
            key={sub.id}
            onClick={() => {
              /* fire-and-forget — just update local active target via session PATCH */
              import('../../services/isolationApi').then(({ updateIsolationSession }) => {
                updateIsolationSession(session.id, { active_eq_target: sub.id })
                  .then(onSessionUpdate)
                  .catch(console.error);
              });
            }}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all
              ${activeTargetId === sub.id && !isCombined
                ? 'text-white border'
                : 'text-white/40 border border-white/10 hover:border-white/30 hover:text-white/70'}`}
            style={
              activeTargetId === sub.id && !isCombined
                ? { borderColor: sub.color, color: sub.color, background: `${sub.color}22` }
                : {}
            }
          >
            Sub {i + 1}
          </button>
        ))}
        {session.substems.length > 0 && (
          <button
            onClick={() => {
              import('../../services/isolationApi').then(({ updateIsolationSession }) => {
                updateIsolationSession(session.id, { active_eq_target: '__combined__' })
                  .then(onSessionUpdate)
                  .catch(console.error);
              });
            }}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all
              ${isCombined
                ? 'bg-[#7F77DD]/20 border border-[#7F77DD]/50 text-[#7F77DD]'
                : 'text-white/40 border border-white/10 hover:border-white/30 hover:text-white/70'}`}
          >
            Combined
          </button>
        )}
        {session.substems.length === 0 && (
          <span className="text-[10px] font-mono text-white/20 italic">
            Split substems first to enable EQ targeting
          </span>
        )}
      </div>

      {/* EQ faders row */}
      <div className="flex items-stretch gap-3 justify-around px-2">
        {EQ_BANDS.map(band => (
          <EQFader
            key={band.key}
            band={band}
            value={currentEQ[band.key]}
            bypassed={bypassed || !activeSubstem}
            onChange={handleBandChange}
          />
        ))}

        {/* Output meter */}
        <div className="flex flex-col items-center gap-2 ml-2">
          <div className="text-[9px] font-mono text-white/20 text-center">OUT</div>
          <div className="w-3 h-[120px] bg-white/5 rounded-full overflow-hidden">
            <div
              className="w-full rounded-full bg-gradient-to-t from-[#1D9E75] via-[#FAC775] to-[#ff3b5c]"
              style={{ height: '35%', marginTop: '65%' }}
            />
          </div>
          <div className="text-[9px] font-mono text-white/20">dB</div>
        </div>
      </div>

      {/* dB scale labels */}
      <div className="flex items-center justify-center gap-1 text-[9px] font-mono text-white/15">
        <span>+12</span>
        <div className="flex-1 border-t border-dashed border-white/10" />
        <span>0</span>
        <div className="flex-1 border-t border-dashed border-white/10" />
        <span>-12</span>
      </div>

      {/* Bypass / Reset */}
      <div className="flex gap-2">
        <button
          onClick={() => setBypassed(v => !v)}
          className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all
            ${bypassed
              ? 'bg-[#FAC775]/20 border border-[#FAC775]/50 text-[#FAC775]'
              : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'}`}
        >
          {bypassed ? 'BYPASSED' : 'BYPASS'}
        </button>
        <button
          onClick={handleReset}
          disabled={!activeSubstem || saving}
          className="px-3 py-1.5 rounded text-[10px] font-mono font-bold
                     bg-white/5 border border-white/10 text-white/40
                     hover:text-white/70 hover:bg-white/10 transition-all
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          RESET EQ
        </button>
        {isCombined && (
          <span className="text-[9px] font-mono text-white/20 self-center ml-1 italic">
            Combined EQ is placeholder
          </span>
        )}
      </div>
    </div>
  );
}
