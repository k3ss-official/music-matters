import type { JobProgress, StageProgress } from '../types';

interface ProgressTimelineProps {
  job?: JobProgress;
}

const DEFAULT_STAGE_ORDER: StageProgress[] = [
  {
    id: 'ingest',
    label: 'Ingest',
    progress: 0,
    status: 'pending',
    detail: 'Queue a source to kick things off.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    progress: 0,
    status: 'pending',
    detail: 'Beat grid + key detection will land here.',
  },
  {
    id: 'separation',
    label: 'Separation',
    progress: 0,
    status: 'pending',
    detail: 'Demucs splits the stems.',
  },
  {
    id: 'loop',
    label: 'Loop Slicing',
    progress: 0,
    status: 'pending',
    detail: 'Loop bank gets curated.',
  },
  {
    id: 'project',
    label: 'Project Assembly',
    progress: 0,
    status: 'pending',
    detail: 'DAW template locks in the goods.',
  },
];

function StageBar({ stage }: { stage: StageProgress }) {
  const pct = Math.min(100, Math.max(0, Math.round((stage.progress ?? 0) * 100)));
  return (
    <div className={`stage ${stage.status}`}>
      <div className="stage-meta">
        <span className="stage-title">{stage.label}</span>
        <span className="stage-progress">{pct}%</span>
      </div>
      <div className="stage-bar">
        <div className="stage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {stage.detail && <div className="stage-detail">{stage.detail}</div>}
    </div>
  );
}

export function ProgressTimeline({ job }: ProgressTimelineProps) {
  const stages = job?.stages ?? DEFAULT_STAGE_ORDER;
  
  const currentStage = stages.find(s => s.status === 'running');
  const completedCount = stages.filter(s => s.status === 'done').length;
  const totalStages = stages.length;

  return (
    <section className="card">
      <header className="card-header">
        <h2>Pipeline Progress</h2>
        {job && job.status === 'running' && (
          <div style={{ 
            padding: '12px', 
            background: '#4CAF50', 
            color: 'white', 
            borderRadius: '8px',
            marginBottom: '12px',
            fontWeight: 'bold'
          }}>
            🔄 PROCESSING: {currentStage?.label || 'Starting...'}
            <div style={{ fontSize: '14px', marginTop: '4px', opacity: 0.9 }}>
              Stage {completedCount + 1} of {totalStages} • {Math.round((job.progress ?? 0) * 100)}% complete
            </div>
            {currentStage?.detail && (
              <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.85 }}>
                {currentStage.detail}
              </div>
            )}
          </div>
        )}
        {job && job.status === 'completed' && (
          <div style={{ 
            padding: '12px', 
            background: '#2196F3', 
            color: 'white', 
            borderRadius: '8px',
            marginBottom: '12px',
            fontWeight: 'bold'
          }}>
            ✅ COMPLETE — Check loops below!
          </div>
        )}
        {job && job.status === 'failed' && (
          <div style={{ 
            padding: '12px', 
            background: '#f44336', 
            color: 'white', 
            borderRadius: '8px',
            marginBottom: '12px',
            fontWeight: 'bold'
          }}>
            ❌ FAILED: {job.detail || 'Unknown error'}
          </div>
        )}
        <div className="muted">
          {job
            ? `${job.status === 'running' ? 'Processing…' : job.status}${
                job.detail ? ` · ${job.detail}` : ''
              }`
            : 'Ingest to light up the pipeline.'}
        </div>
      </header>

      <div className="stage-toggle-row">
        {stages.map((stage) => (
          <span
            key={stage.id}
            className={[
              'stage-pill',
              stage.status === 'running' ? 'running' : '',
              stage.status === 'done' ? 'active' : '',
              !job && stage.status === 'pending' ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {stage.label}
          </span>
        ))}
      </div>

      <div className="timeline">
        {stages.map((stage) => (
          <StageBar key={stage.id} stage={stage} />
        ))}
      </div>
    </section>
  );
}
