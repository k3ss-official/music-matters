/**
 * SubstemMixer — 5-row mixer panel.
 *
 * Per row: checkbox | color strip | name | waveform | S | M | gain slider | dB | meter
 *
 * NO EQ CONTROLS HERE — EQ lives exclusively in SubstemEQShaper above.
 */
import React, { useCallback } from 'react';
import type { IsolationSession, Substem } from '../../types/isolation';
import { updateSubstem } from '../../services/isolationApi';

interface Props {
  session: IsolationSession;
  onSessionUpdate: (session: IsolationSession) => void;
}

function MiniWaveform({ peaks, color, muted }: { peaks: number[]; color: string; muted: boolean }) {
  const sample = peaks.filter((_, i) => i % 4 === 0).slice(0, 50);
  return (
    <svg
      className={`w-full h-[28px] transition-opacity ${muted ? 'opacity-20' : 'opacity-70'}`}
      viewBox={`0 0 ${sample.length} 28`}
      preserveAspectRatio="none"
    >
      {sample.map((p, i) => {
        const barH = Math.max(1, p * 24);
        return (
          <rect key={i} x={i} y={(28 - barH) / 2} width={0.7} height={barH} fill={color} />
        );
      })}
    </svg>
  );
}

interface RowProps {
  sub: Substem;
  index: number;
  sessionId: string;
  onSessionUpdate: (session: IsolationSession) => void;
  hasSolo: boolean;
}

function SubstemRow({ sub, index, sessionId, onSessionUpdate, hasSolo }: RowProps) {
  const isMuted = sub.muted || (hasSolo && !sub.solo);

  const patch = useCallback(
    async (updates: Partial<Substem>) => {
      try {
        const updated = await updateSubstem(sessionId, sub.id, updates);
        onSessionUpdate(updated);
      } catch (e) {
        console.error('substem update failed', e);
      }
    },
    [sessionId, sub.id, onSessionUpdate],
  );

  const handleGainChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      patch({ gain_db: parseFloat(e.target.value) });
    },
    [patch],
  );

  const gainPct = ((sub.gain_db + 24) / 36) * 100;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-all
        ${sub.selected ? 'bg-white/[0.06] border border-white/10' : 'border border-transparent hover:bg-white/[0.03]'}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => patch({ selected: !sub.selected })}
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all
          ${sub.selected ? 'border-[#7F77DD] bg-[#7F77DD]/20' : 'border-white/20 hover:border-white/40'}`}
        title={sub.selected ? 'Deselect' : 'Select for export'}
      >
        {sub.selected && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <polyline points="1,4 3,6 7,2" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Color marker */}
      <div
        className="w-1 h-6 rounded-full flex-shrink-0"
        style={{ background: sub.color }}
      />

      {/* Name */}
      <span
        className={`text-[11px] font-mono w-[80px] flex-shrink-0 truncate
          ${isMuted ? 'text-white/20' : 'text-white/70'}`}
        title={sub.name}
      >
        {sub.name}
      </span>

      {/* Waveform strip */}
      <div className="flex-1 min-w-0 h-7">
        <MiniWaveform peaks={sub.waveform_peaks} color={sub.color} muted={isMuted} />
      </div>

      {/* Solo button */}
      <button
        onClick={() => patch({ solo: !sub.solo })}
        className={`w-6 h-6 rounded text-[9px] font-mono font-bold flex-shrink-0 transition-all
          ${sub.solo
            ? 'bg-[#FAC775]/30 border border-[#FAC775]/60 text-[#FAC775]'
            : 'bg-white/5 border border-white/10 text-white/30 hover:text-white/60'}`}
        title={sub.solo ? 'Unsolo' : 'Solo'}
      >
        S
      </button>

      {/* Mute button */}
      <button
        onClick={() => patch({ muted: !sub.muted })}
        className={`w-6 h-6 rounded text-[9px] font-mono font-bold flex-shrink-0 transition-all
          ${sub.muted
            ? 'bg-[#ff3b5c]/30 border border-[#ff3b5c]/50 text-[#ff3b5c]'
            : 'bg-white/5 border border-white/10 text-white/30 hover:text-white/60'}`}
        title={sub.muted ? 'Unmute' : 'Mute'}
      >
        M
      </button>

      {/* Gain slider */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-[90px]">
        <input
          type="range"
          min={-24}
          max={12}
          step={0.5}
          value={sub.gain_db}
          onChange={handleGainChange}
          className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${sub.color}80 0%, ${sub.color} ${gainPct}%, rgba(255,255,255,0.1) ${gainPct}%, rgba(255,255,255,0.1) 100%)`,
          }}
        />
      </div>

      {/* dB readout */}
      <div className={`text-[10px] font-mono w-[34px] text-right flex-shrink-0
        ${isMuted ? 'text-white/20' : sub.gain_db === 0 ? 'text-white/40' : sub.gain_db > 0 ? 'text-[#1D9E75]' : 'text-[#ff3b5c]'}`}>
        {sub.gain_db > 0 ? '+' : ''}{sub.gain_db.toFixed(1)}
      </div>

      {/* Output meter */}
      <div className="w-2 h-6 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
        {!isMuted && (
          <div
            className="w-full rounded-full bg-gradient-to-t from-[#1D9E75] to-[#FAC775]"
            style={{ height: '40%', marginTop: '60%' }}
          />
        )}
      </div>
    </div>
  );
}

export function SubstemMixer({ session, onSessionUpdate }: Props) {
  const hasSolo = session.substems.some(s => s.solo);

  return (
    <div className="bg-[#1a1830] border border-white/5 rounded-xl p-4 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#1D9E75]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
            Substem Mixer
          </span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-white/20">
          <span className="w-4 text-center">S</span>
          <span className="w-4 text-center">M</span>
          <span className="w-[90px] text-center">Gain</span>
          <span className="w-[34px] text-right">dB</span>
          <span className="w-2 text-center">VU</span>
        </div>
      </div>

      {session.substems.length === 0 ? (
        <div className="py-6 text-center text-[11px] font-mono text-white/20">
          Click "Split Substems" in the Parent Stem panel above to generate substems
        </div>
      ) : (
        session.substems.map((sub, i) => (
          <SubstemRow
            key={sub.id}
            sub={sub}
            index={i}
            sessionId={session.id}
            onSessionUpdate={onSessionUpdate}
            hasSolo={hasSolo}
          />
        ))
      )}
    </div>
  );
}
