/**
 * ProcessingView — real-time pipeline progress with whimsical remarks.
 *
 * Shows:
 *  - Stage cards with live status
 *  - Overall progress bar
 *  - Rotating fun messages to keep the vibe alive during long demucs runs
 *  - Elapsed time counter
 */
import React, { useState, useEffect, useRef } from 'react';
import type { JobProgress, StageProgress } from '../types';

// ── Whimsical remarks ─────────────────────────────────────────────────────
const WHIMSY: Record<string, string[]> = {
  ingest: [
    'Taste-testing the audio…',
    'Checking the vibe frequency…',
    'Loading the goods…',
    'Reading the sonic DNA…',
  ],
  analysis: [
    'Counting every single beat… man this is catchy',
    'BPM detected. Key vibes loading…',
    'Mathematically proving this slaps…',
    'Interrogating the frequency spectrum…',
    'Finding the one… the downbeat, that is',
    'Teaching the algorithm to nod its head…',
  ],
  separation: [
    'Demucs is doing its thing… 🧠',
    'Surgically extracting stems. Like audio surgery but cooler',
    'Neural nets are vibing with your track…',
    'The M4 is earning its keep right now…',
    'Separating bass from treble like a DJ separating wheat from chaff',
    'Quality takes time. Spleeter would be done by now but, you know… standards',
    'If you can hear the bass in your head, the algorithm can too',
    'GPU going brrrr… in a dignified, Apple Silicon way',
    'Imagine 50,000 tiny robots unscrewing every note from each other…',
    'Teaching the model the difference between a hi-hat and a sneeze…',
    'Don\'t worry, the stems will be cleaner than your room…',
    'Claude would\'ve finished this prompt 10 minutes ago. Lucky for you, Demucs is thorough',
    'Fun fact: this model has heard more music than any human alive. It\'s fine',
  ],
  loop: [
    'Slicing loops to the grid…',
    'Finding the perfect 8-bar section…',
    'Making sure the downbeat hits right…',
  ],
  project: [
    'Wrapping it up with a bow…',
    'Assembling the final package…',
    'Almost there. Just dotting the i\'s and stemming the… stems',
    'Building your workspace…',
  ],
  default: [
    'Processing… hold tight',
    'Doing science…',
    'AI goes brrrr',
    'Turning noise into music (well, the other way around)…',
  ],
};

function getWhimsy(stageId: string | null | undefined): string {
  const pool = WHIMSY[stageId ?? 'default'] ?? WHIMSY.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Elapsed time formatter ────────────────────────────────────────────────
function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

// ── Icons ─────────────────────────────────────────────────────────────────
const SpinnerIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Props ─────────────────────────────────────────────────────────────────
interface ProcessingViewProps {
  activeJob: JobProgress;
  stageMeta: Record<string, { label: string; color: string; icon: string }>;
  onNewTrack: () => void;
  onRetry: () => void;
}

export function ProcessingView({ activeJob, stageMeta, onNewTrack, onRetry }: ProcessingViewProps) {
  // ── Whimsical remark rotation ───────────────────────────────────────────
  const [remark, setRemark] = useState(() => getWhimsy(activeJob.currentStage));
  const prevStageRef = useRef(activeJob.currentStage);

  useEffect(() => {
    // Immediately pick a new remark when the stage changes
    if (activeJob.currentStage !== prevStageRef.current) {
      setRemark(getWhimsy(activeJob.currentStage));
      prevStageRef.current = activeJob.currentStage;
    }

    // Rotate every 8 seconds
    const interval = setInterval(() => {
      setRemark(getWhimsy(activeJob.currentStage));
    }, 8000);

    return () => clearInterval(interval);
  }, [activeJob.currentStage]);

  // ── Elapsed timer ───────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [activeJob.jobId]);

  useEffect(() => {
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeJob.status, activeJob.jobId]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-8 w-full max-w-lg px-6">
        {/* Status header */}
        <div className="text-center space-y-2">
          {activeJob.status === 'failed' ? (
            <>
              <div className="text-4xl">❌</div>
              <h2 className="text-xl font-bold text-[#ff3b5c]">Pipeline Failed</h2>
              <p className="text-[#ff3b5c]/60 text-xs font-mono">{activeJob.detail}</p>
            </>
          ) : (
            <>
              <SpinnerIcon size={36} />
              <h2 className="text-xl font-bold text-white">Processing Track</h2>
              <p className="text-white/40 text-xs font-mono">
                {activeJob.currentStage
                  ? stageMeta[activeJob.currentStage]?.label ?? activeJob.currentStage
                  : 'Starting pipeline...'}
              </p>
            </>
          )}
        </div>

        {/* Whimsical remark */}
        {activeJob.status !== 'failed' && (
          <p className="text-[#8b5cf6]/60 text-xs italic text-center transition-opacity duration-500 min-h-[1.5em]">
            {remark}
          </p>
        )}

        {/* Elapsed & progress */}
        <div className="w-full">
          <div className="flex justify-between text-[10px] font-mono text-white/30 mb-1.5">
            <span className="flex items-center gap-2">
              Progress
              {activeJob.status !== 'failed' && activeJob.status !== 'completed' && (
                <span className="text-white/15">⏱ {fmtElapsed(elapsed)}</span>
              )}
            </span>
            <span>{Math.round((activeJob.progress ?? 0) * 100)}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.round((activeJob.progress ?? 0) * 100)}%`,
                background: activeJob.status === 'failed'
                  ? '#ff3b5c'
                  : 'linear-gradient(90deg, #00d4ff, #8b5cf6)',
              }}
            />
          </div>
        </div>

        {/* Stage cards */}
        <div className="w-full space-y-2">
          {activeJob.stages.map(stage => {
            const meta = stageMeta[stage.id] || { label: stage.label, color: '#888', icon: '⚙️' };
            return (
              <div
                key={stage.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
                  stage.status === 'done'
                    ? 'bg-[#00ff88]/5 border-[#00ff88]/20'
                    : stage.status === 'running'
                    ? 'bg-white/[0.03] border-white/10 shadow-lg'
                    : stage.status === 'error'
                    ? 'bg-[#ff3b5c]/5 border-[#ff3b5c]/20'
                    : 'bg-white/[0.01] border-white/5 opacity-40'
                }`}
              >
                <span className="text-lg w-7 text-center">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white/80">{meta.label}</div>
                  {stage.detail && stage.status !== 'pending' && (
                    <div className="text-[10px] text-white/30 font-mono truncate mt-0.5">
                      {stage.detail}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {stage.status === 'done' && (
                    <div className="text-[#00ff88]"><CheckIcon /></div>
                  )}
                  {stage.status === 'running' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-white/40">
                        {Math.round(stage.progress * 100)}%
                      </span>
                      <SpinnerIcon size={14} />
                    </div>
                  )}
                  {stage.status === 'error' && (
                    <div className="text-[#ff3b5c]"><AlertIcon /></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Retry / new track on failure */}
        {activeJob.status === 'failed' && (
          <div className="flex gap-3">
            <button
              onClick={onNewTrack}
              className="px-4 py-2 rounded-lg text-xs font-bold
                         bg-white/5 text-white/60 border border-white/10
                         hover:bg-white/10 transition-colors"
            >
              Start Over
            </button>
            <button
              onClick={onRetry}
              className="px-4 py-2 rounded-lg text-xs font-bold
                         bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30
                         hover:bg-[#00d4ff]/25 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProcessingView;
