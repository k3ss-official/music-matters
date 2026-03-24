/**
 * SSE client for real-time job progress updates.
 * Replaces the 3-second polling with server-pushed events.
 */

import type { JobProgress } from '../types';

const API_BASE = '/api';

export interface SSECallbacks {
  onUpdate: (job: JobProgress) => void;
  onDone: (job: JobProgress) => void;
  onError: (error: Event | string) => void;
}

/**
 * Subscribe to real-time updates for a job via Server-Sent Events.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToJob(jobId: string, callbacks: SSECallbacks): () => void {
  const url = `${API_BASE}/stream/${jobId}/stream`;
  const source = new EventSource(url);

  source.addEventListener('job_update', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      // Map snake_case from backend to camelCase for frontend
      const job: JobProgress = {
        jobId: data.job_id,
        trackId: data.track_id,
        status: data.status,
        currentStage: data.current_stage,
        progress: data.progress,
        detail: data.detail,
        stages: (data.stages || []).map((s: any) => ({
          id: s.id,
          label: s.label,
          progress: s.progress,
          status: s.status,
          detail: s.detail,
          etaSeconds: s.eta_seconds,
        })),
        startedAt: data.started_at,
        completedAt: data.completed_at,
      };
      callbacks.onUpdate(job);
    } catch (e) {
      console.error('Failed to parse SSE job_update', e);
    }
  });

  source.addEventListener('job_done', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const job: JobProgress = {
        jobId: data.job_id,
        trackId: data.track_id,
        status: data.status,
        currentStage: data.current_stage,
        progress: data.progress,
        detail: data.detail,
        stages: (data.stages || []).map((s: any) => ({
          id: s.id,
          label: s.label,
          progress: s.progress,
          status: s.status,
          detail: s.detail,
          etaSeconds: s.eta_seconds,
        })),
        startedAt: data.started_at,
        completedAt: data.completed_at,
      };
      callbacks.onDone(job);
      source.close();
    } catch (e) {
      console.error('Failed to parse SSE job_done', e);
    }
  });

  source.onerror = (event) => {
    callbacks.onError(event);
    // EventSource will auto-reconnect by default, but if we get
    // repeated errors, the caller should handle cleanup
  };

  return () => {
    source.close();
  };
}
