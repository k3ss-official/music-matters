/**
 * IsolationRightSidebar — Multi-Select / Combined Output list,
 * Audition Mode buttons, Export Settings, and EXPORT LOOP button.
 */
import React, { useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { IsolationSession, AuditionMode } from '../../types/isolation';
import { updateIsolationSession, exportLoop } from '../../services/isolationApi';

interface Props {
  session: IsolationSession;
  onSessionUpdate: (session: IsolationSession) => void;
}

type ExportState = 'idle' | 'loading' | 'success' | 'error';

const AUDITION_MODES: { key: AuditionMode; label: string; description: string }[] = [
  {
    key: 'selected_only',
    label: 'Selected Only',
    description: 'Hear only the selected substems',
  },
  {
    key: 'parent_minus_selected',
    label: 'Parent − Selected',
    description: 'Hear what remains after removing selected substems',
  },
  {
    key: 'full_context',
    label: 'Full Context',
    description: 'Hear all substems together',
  },
];

export function IsolationRightSidebar({ session, onSessionUpdate }: Props) {
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportMessage, setExportMessage] = useState('');

  const selectedSubstems = session.substems.filter(s => s.selected);

  const handleAuditionMode = async (mode: AuditionMode) => {
    try {
      const updated = await updateIsolationSession(session.id, { audition_mode: mode });
      onSessionUpdate(updated);
    } catch (e) {
      console.error('audition mode update failed', e);
    }
  };

  const handleExport = async () => {
    setExportState('loading');
    setExportMessage('');
    try {
      const result = await exportLoop(session.id);
      setExportState('success');
      setExportMessage(result.message);
    } catch (e: unknown) {
      setExportState('error');
      setExportMessage(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const handleExportSettingChange = async (key: string, value: string | number) => {
    try {
      const updated = await updateIsolationSession(session.id, {
        export_settings: { ...session.export_settings, [key]: value },
      });
      onSessionUpdate(updated);
    } catch (e) {
      console.error('export settings update failed', e);
    }
  };

  return (
    <div className="w-[260px] bg-[#0a0a0f] border-l border-white/5 flex flex-col gap-4 p-4 overflow-y-auto flex-shrink-0">

      {/* Multi-Select / Combined Output */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
          Combined Output
        </div>
        {selectedSubstems.length === 0 ? (
          <div className="text-[10px] font-mono text-white/20 italic py-1">
            No substems selected — check rows in the mixer
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {selectedSubstems.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sub.color }} />
                <span className="text-[11px] font-mono text-white/60 truncate">{sub.name}</span>
                <span className="ml-auto text-[10px] font-mono text-white/25">
                  {sub.gain_db > 0 ? '+' : ''}{sub.gain_db.toFixed(1)}dB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/5" />

      {/* Audition Mode */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
          Audition Mode
        </div>
        <div className="flex flex-col gap-1">
          {AUDITION_MODES.map(({ key, label, description }) => (
            <button
              key={key}
              onClick={() => handleAuditionMode(key)}
              className={`text-left px-3 py-2 rounded-lg text-[11px] font-mono transition-all
                ${session.audition_mode === key
                  ? 'bg-[#00d4ff]/15 border border-[#00d4ff]/40 text-[#00d4ff]'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/70 hover:border-white/20'}`}
              title={description}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[9px] font-mono text-white/20 italic">
          Audition playback is placeholder — real mixing is a future DSP step
        </div>
      </div>

      <div className="border-t border-white/5" />

      {/* Export Settings */}
      <div className="flex flex-col gap-3">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
          Export Settings
        </div>

        <ExportField
          label="Format"
          id="format"
          type="select"
          value={session.export_settings.format}
          options={['wav', 'aiff', 'flac']}
          onChange={v => handleExportSettingChange('format', v)}
        />

        <ExportField
          label="Sample Rate"
          id="sample_rate"
          type="select"
          value={String(session.export_settings.sample_rate)}
          options={['44100', '48000', '88200', '96000']}
          onChange={v => handleExportSettingChange('sample_rate', parseInt(v))}
        />

        <ExportField
          label="Bit Depth"
          id="bit_depth"
          type="select"
          value={String(session.export_settings.bit_depth)}
          options={['16', '24', '32']}
          onChange={v => handleExportSettingChange('bit_depth', parseInt(v))}
        />

        <ExportField
          label="Grid Snap"
          id="grid_snap"
          type="select"
          value={session.export_settings.grid_snap}
          options={['1_bar', '2_bars', '4_bars', 'free']}
          onChange={v => handleExportSettingChange('grid_snap', v)}
        />
      </div>

      <div className="border-t border-white/5" />

      {/* Export Loop button */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          onClick={handleExport}
          disabled={exportState === 'loading' || selectedSubstems.length === 0}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                     font-bold text-sm transition-all
                     ${selectedSubstems.length === 0
                       ? 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
                       : 'bg-[#00ff88]/10 border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/20 hover:border-[#00ff88]/60'}`}
        >
          {exportState === 'loading' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : exportState === 'success' ? (
            <CheckCircle2 size={15} />
          ) : exportState === 'error' ? (
            <AlertCircle size={15} />
          ) : (
            <Download size={15} />
          )}
          {exportState === 'loading' ? 'Exporting…'
            : exportState === 'success' ? 'Exported!'
            : exportState === 'error' ? 'Export Failed'
            : 'Export Loop'}
        </button>

        {selectedSubstems.length === 0 && (
          <div className="text-[10px] font-mono text-white/20 text-center">
            Select at least one substem to export
          </div>
        )}

        {exportMessage && (
          <div className={`text-[10px] font-mono text-center rounded p-2
            ${exportState === 'error'
              ? 'bg-[#ff3b5c]/10 text-[#ff3b5c]/80'
              : 'bg-white/5 text-white/40'}`}>
            {exportMessage}
          </div>
        )}

        {exportState === 'success' && (
          <button
            onClick={() => { setExportState('idle'); setExportMessage(''); }}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 text-center"
          >
            Export again
          </button>
        )}
      </div>
    </div>
  );
}

function ExportField({
  label,
  id,
  type,
  value,
  options,
  onChange,
}: {
  label: string;
  id: string;
  type: 'select';
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-[10px] font-mono text-white/40 flex-shrink-0">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#12121a] border border-white/10 rounded px-2 py-1
                   text-[10px] font-mono text-white/70
                   focus:outline-none focus:border-[#00d4ff]/40
                   hover:border-white/20 transition-colors"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
