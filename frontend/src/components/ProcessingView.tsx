/**
 * ProcessingView — real-time pipeline progress with multi-stage status bars
 * and live storytelling narrative.
 */
import React, { useState, useEffect, useRef } from 'react';
import type { JobProgress, StageProgress } from '../types';
import { CheckCircle2, AlertCircle, Loader2, Sparkles, Clock, Activity } from 'lucide-react';

// ── Stage narrative explanations ──────────────────────────────────────────
const STAGE_NARRATIVE: Record<string, {
  headline: string;
  substeps: string[];
  whimsy: string[];
}> = {
  ingest: {
    headline: 'Stage 1/5 · Source Acquisition & 24-bit WAV Staging',
    substeps: [
      'Resolving stream manifest / verifying local audio file integrity',
      'Transcoding & staging 44.1 kHz 24-bit PCM WAV into Music Library',
      'Registering track record in SQLite WAL database',
    ],
    whimsy: [
      'Taste-testing the audio…',
      'Checking the vibe frequency…',
      'Reading the sonic DNA…',
    ],
  },
  analysis: {
    headline: 'Stage 2/5 · SOTA Beat Grid, Downbeat, Key & Structure Analysis',
    substeps: [
      'Extracting onset strength envelope & tempo histogram',
      'Locking downbeats, bar boundaries & phrase structure',
      'Computing harmonic key & Camelot wheel compatibility',
    ],
    whimsy: [
      'Counting every single beat… man this is catchy',
      'BPM detected. Key vibes loading…',
      'Mathematically proving this slaps…',
      'Finding the one… the downbeat, that is',
    ],
  },
  separation: {
    headline: 'Stage 3/5 · 6-Stem Neural Separation (htdemucs_6s)',
    substeps: [
      'Loading htdemucs_6s weights onto Apple Silicon / compute engine',
      'Isolating Drums, Bass, Vocals, Guitar, Piano, and Other stems',
      'Writing phase-aligned 24-bit stem WAVs to library',
    ],
    whimsy: [
      'Demucs is doing its thing… surgically extracting 6 stems',
      'The M4 is earning its keep right now…',
      'Separating bass from treble like a DJ separating wheat from chaff',
      'Imagine 50,000 tiny robots unscrewing every note from each other…',
    ],
  },
  loop: {
    headline: 'Stage 4/5 · Bar-Quantized Loop Slicing',
    substeps: [
      'Aligning slice points to detected downbeat grid',
      'Rendering 4, 8, 16, and 32-bar stem loops',
      'Scoring loop energy & tagging sections',
    ],
    whimsy: [
      'Slicing loops to the grid…',
      'Finding the perfect 8-bar section…',
      'Making sure the downbeat hits right…',
    ],
  },
  project: {
    headline: 'Stage 5/5 · Workspace & DAW Project Assembly',
    substeps: [
      'Generating waveform peak caches for instant scrubbing',
      'Linking stem lanes, phrases, and Ableton export templates',
      'Finalising track workspace',
    ],
    whimsy: [
      'Wrapping it up with a bow…',
      'Assembling the final package…',
      'Building your workspace…',
    ],
  },
};

const DEFAULT_STAGES: StageProgress[] = [
  { id: 'ingest', label: 'Ingest', progress: 0, status: 'pending' },
  { id: 'analysis', label: 'Analysis', progress: 0, status: 'pending' },
  { id: 'separation', label: 'Separation', progress: 0, status: 'pending' },
  { id: 'loop', label: 'Loop Slicing', progress: 0, status: 'pending' },
  { id: 'project', label: 'Project Assembly', progress: 0, status: 'pending' },
];

function getWhimsy(stageId: string | null | undefined): string {
  const pool = STAGE_NARRATIVE[stageId ?? '']?.whimsy ?? [
    'Processing audio pipeline…',
    'Running local DSP & neural models…',
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

interface ProcessingViewProps {
  activeJob: JobProgress;
  stageMeta: Record<string, { label: string; color: string; icon: string }>;
  onNewTrack: () => void;
  onRetry: () => void;
}

export function ProcessingView({ activeJob, stageMeta, onNewTrack, onRetry }: ProcessingViewProps) {
  const [remark, setRemark] = useState(() => getWhimsy(activeJob.currentStage));
  const prevStageRef = useRef(activeJob.currentStage);

  // Live narrative log history
  const [narrativeLog, setNarrativeLog] = useState<Array<{ time: string; text: string; stage: string }>>([]);
  const lastLoggedRef = useRef<string>('');

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setNarrativeLog([
      {
        time: '0s',
        stage: 'pipeline',
        text: 'Pipeline initialized — queuing audio stages on local engine.',
      },
    ]);
    lastLoggedRef.current = '';
  }, [activeJob.jobId]);

  useEffect(() => {
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeJob.status, activeJob.jobId]);

  // Rotate whimsical remark
  useEffect(() => {
    if (activeJob.currentStage !== prevStageRef.current) {
      setRemark(getWhimsy(activeJob.currentStage));
      prevStageRef.current = activeJob.currentStage;
    }
    const interval = setInterval(() => {
      setRemark(getWhimsy(activeJob.currentStage));
    }, 7000);
    return () => clearInterval(interval);
  }, [activeJob.currentStage]);

  // Append real-time narrative entries as stage or detail updates arrive
  useEffect(() => {
    const currentId = activeJob.currentStage || 'ingest';
    const runningStage = activeJob.stages.find(s => s.id === currentId) || activeJob.stages.find(s => s.status === 'running');
    const detailText = runningStage?.detail || activeJob.detail || STAGE_NARRATIVE[currentId]?.headline;
    if (!detailText) return;

    const key = `${currentId}:${detailText}`;
    if (key !== lastLoggedRef.current) {
      lastLoggedRef.current = key;
      const stamp = fmtElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      setNarrativeLog(prev => [
        ...prev.slice(-11),
        { time: stamp, stage: currentId, text: detailText },
      ]);
    }
  }, [activeJob.currentStage, activeJob.detail, activeJob.stages]);

  const stages = activeJob.stages && activeJob.stages.length > 0 ? activeJob.stages : DEFAULT_STAGES;
  const overallPct = Math.min(100, Math.max(2, Math.round((activeJob.progress ?? 0) * 100)));
  const currentStageId = activeJob.currentStage || stages.find(s => s.status === 'running')?.id || 'ingest';
  const activeNarrative = STAGE_NARRATIVE[currentStageId] ?? STAGE_NARRATIVE.ingest;
  const activeStageObj = stages.find(s => s.id === currentStageId);
  const activeStagePct = Math.round((activeStageObj?.progress ?? 0) * 100);

  return (
    <div className="flex-1 flex items-center justify-center overflow-y-auto py-6 px-6">
      <div className="flex flex-col gap-5 w-full max-w-2xl bg-mm-panel/70 border border-mm-border rounded-2xl p-6 shadow-2xl">
        {/* Top Status Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {activeJob.status === 'failed' ? (
              <div className="w-11 h-11 rounded-xl bg-[#ff3b5c]/15 border border-[#ff3b5c]/30 flex items-center justify-center text-[#ff3b5c] shrink-0">
                <AlertCircle size={22} />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-mm-purple/15 border border-mm-purple/30 flex items-center justify-center text-mm-purple shrink-0">
                <Loader2 size={22} className="animate-spin" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {activeJob.status === 'failed' ? 'Pipeline Interrupted' : 'Processing Track Pipeline'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-mm-purple/20 text-mm-purple">
                  {activeJob.status}
                </span>
              </div>
              <p className="text-xs font-mono text-mm-muted mt-0.5">
                {activeJob.status === 'failed'
                  ? activeJob.detail || 'An error occurred during audio processing.'
                  : activeNarrative.headline}
              </p>
            </div>
          </div>

          {/* Elapsed Timer Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mm-surface border border-mm-border text-xs font-mono text-mm-body shrink-0">
            <Clock size={12} className="text-mm-purple" />
            <span>{fmtElapsed(elapsed)}</span>
          </div>
        </div>

        {/* Master Multi-Segment Progress Bar */}
        <div className="space-y-2 bg-mm-surface/80 border border-mm-border rounded-xl p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Activity size={13} className="text-mm-teal" />
              <span>Overall Pipeline Progress</span>
            </span>
            <span className="font-mono font-bold text-mm-teal">{overallPct}%</span>
          </div>

          {/* Master smooth bar */}
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${overallPct}%`,
                background:
                  activeJob.status === 'failed'
                    ? '#ff3b5c'
                    : 'linear-gradient(90deg, #7F77DD 0%, #1D9E75 100%)',
              }}
            />
          </div>

          {/* Segmented per-stage mini bars */}
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {stages.map((st) => {
              const pct = st.status === 'done' ? 100 : st.status === 'running' ? Math.max(12, Math.round(st.progress * 100)) : 0;
              return (
                <div key={st.id} className="space-y-1">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          st.status === 'done'
                            ? '#1D9E75'
                            : st.status === 'error'
                              ? '#ff3b5c'
                              : '#7F77DD',
                      }}
                    />
                  </div>
                  <div className="text-[9px] font-mono text-mm-muted truncate text-center">
                    {stageMeta[st.id]?.label ?? st.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Stage Narrative Card */}
        {activeJob.status !== 'failed' && (
          <div className="bg-mm-surface/90 border border-mm-purple/30 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Sparkles size={13} className="text-mm-purple" />
                <span>Live Engine Narrative</span>
              </div>
              <span className="text-[10px] font-mono text-mm-purple">
                Stage {activeStagePct}%
              </span>
            </div>

            <p className="text-xs text-mm-body font-mono">
              {activeStageObj?.detail || activeJob.detail || activeNarrative.substeps[0]}
            </p>

            {/* Sub-step checklist */}
            <div className="space-y-1 pt-1">
              {activeNarrative.substeps.map((step, idx) => {
                const done = activeStagePct >= (idx + 1) * 33;
                const active = !done && activeStagePct >= idx * 33;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-[11px] ${
                      done ? 'text-mm-teal' : active ? 'text-white font-medium' : 'text-mm-muted/60'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        done ? 'bg-mm-teal' : active ? 'bg-mm-purple animate-ping' : 'bg-white/20'
                      }`}
                    />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>

            <div className="pt-1 border-t border-white/5 text-[11px] italic text-mm-purple/80">
              “{remark}”
            </div>
          </div>
        )}

        {/* Detailed Stage Cards with Individual Progress Bars */}
        <div className="space-y-2">
          {stages.map((stage) => {
            const meta = stageMeta[stage.id] || { label: stage.label, color: '#7F77DD', icon: '⚙️' };
            const pct = stage.status === 'done' ? 100 : Math.round((stage.progress ?? 0) * 100);
            return (
              <div
                key={stage.id}
                className={`px-4 py-2.5 rounded-xl border transition-all duration-300 ${
                  stage.status === 'done'
                    ? 'bg-[#1D9E75]/5 border-[#1D9E75]/25'
                    : stage.status === 'running'
                      ? 'bg-white/[0.04] border-mm-purple/40 shadow-md'
                      : stage.status === 'error'
                        ? 'bg-[#ff3b5c]/5 border-[#ff3b5c]/30'
                        : 'bg-white/[0.01] border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base w-6 text-center">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/90">{meta.label}</span>
                      <div className="flex items-center gap-1.5">
                        {stage.status === 'done' && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-[#1D9E75]">
                            <CheckCircle2 size={13} /> Done
                          </span>
                        )}
                        {stage.status === 'running' && (
                          <span className="flex items-center gap-1.5 text-[10px] font-mono text-mm-purple">
                            <span>{pct}%</span>
                            <Loader2 size={12} className="animate-spin" />
                          </span>
                        )}
                        {stage.status === 'error' && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-[#ff3b5c]">
                            <AlertCircle size={13} /> Error
                          </span>
                        )}
                        {stage.status === 'pending' && (
                          <span className="text-[10px] font-mono text-mm-muted">Waiting</span>
                        )}
                      </div>
                    </div>
                    {stage.detail && stage.status !== 'pending' && (
                      <div className="text-[10px] text-mm-muted font-mono truncate mt-0.5">
                        {stage.detail}
                      </div>
                    )}
                    {stage.status === 'running' && (
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full bg-mm-purple rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(8, pct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Narrative Feed Log */}
        {narrativeLog.length > 0 && (
          <div className="bg-black/30 border border-mm-border rounded-xl p-3 space-y-1.5 max-h-28 overflow-y-auto font-mono text-[10px]">
            <div className="text-[9px] uppercase tracking-widest text-mm-muted font-bold">
              Activity Log
            </div>
            {narrativeLog.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-2 text-mm-body/80">
                <span className="text-mm-muted shrink-0 w-10">[{entry.time}]</span>
                <span className="text-mm-purple uppercase shrink-0 w-16">{entry.stage}</span>
                <span className="truncate">{entry.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onNewTrack}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold
                       bg-white/5 text-mm-body border border-mm-border
                       hover:bg-white/10 hover:text-white transition-colors"
          >
            ← Back to Library (Run in Background)
          </button>

          {activeJob.status === 'failed' && (
            <div className="flex gap-2">
              <button
                onClick={onRetry}
                className="px-4 py-2 rounded-lg text-xs font-bold
                           bg-mm-purple text-white hover:brightness-110 transition-all"
              >
                Retry Pipeline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProcessingView;
