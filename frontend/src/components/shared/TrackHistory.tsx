import type { TrackSummary } from '../types';

export interface TrackHistoryProps {
  tracks: TrackSummary[];
  onTrackSelect?: (trackId: string) => void;
  selectedTrackId?: string | null;
}

export function TrackHistory({ tracks, onTrackSelect, selectedTrackId }: TrackHistoryProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'project_ready':
      case 'completed':
        return '#4CAF50';
      case 'processing':
      case 'running':
        return '#FFA726';
      case 'failed':
      case 'error':
        return '#f44336';
      default:
        return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'project_ready':
        return 'Ready';
      case 'stems_ready':
        return 'Stems Done';
      case 'analysed':
        return 'Analyzed';
      case 'ingested':
        return 'Ingested';
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2>Track History</h2>
        <div className="muted">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} processed
        </div>
      </header>

      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {tracks.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</div>
            <div>No tracks yet</div>
            <div className="muted small">Upload a track to get started</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tracks.map((track) => {
              const isSelected = track.track_id === selectedTrackId;
              return (
                <div
                  key={track.track_id}
                  onClick={() => onTrackSelect?.(track.track_id)}
                  style={{
                    padding: '12px',
                    border: isSelected ? '2px solid #2196F3' : '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: onTrackSelect ? 'pointer' : 'default',
                    background: isSelected ? '#f0f8ff' : 'white',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#f9f9f9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {track.title}
                      </div>
                      {track.artist && (
                        <div className="muted small" style={{ marginBottom: '4px' }}>
                          {track.artist}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'white',
                        background: getStatusColor(track.status),
                      }}
                    >
                      {getStatusLabel(track.status)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#666' }}>
                    {track.bpm && track.bpm > 0 && (
                      <div>
                        <strong>BPM:</strong> {track.bpm.toFixed(1)}
                      </div>
                    )}
                    {track.musical_key && (
                      <div>
                        <strong>Key:</strong> {track.musical_key}
                      </div>
                    )}
                    <div style={{ marginLeft: 'auto' }}>
                      {formatDate(track.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
