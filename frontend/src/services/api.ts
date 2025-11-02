import type {
  IngestPayload,
  JobProgress,
  LoopPreview,
  StageProgress,
  SearchResult,
  TrackQuery,
} from '../types';

const API_BASE = '/api/v1';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function searchTracks(query: TrackQuery): Promise<SearchResult[]> {
  const response = await fetch(`${API_BASE}/library/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  const payload = await handleResponse<RawSearchResult[]>(response);
  return payload.map(toSearchResult);
}

export async function ingestSource(payload: IngestPayload): Promise<{
  jobId: string;
  trackId: string;
}> {
  const response = await fetch(`${API_BASE}/jobs/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ job_id: string; track_id: string }>(response).then(
    ({ job_id, track_id }) => ({
      jobId: job_id,
      trackId: track_id,
    }),
  );
}

export async function uploadFile(
  file: File,
  tags?: string[],
  collection?: string,
): Promise<{
  jobId: string;
  trackId: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (tags && tags.length > 0) {
    formData.append('tags', tags.join(','));
  }
  if (collection) {
    formData.append('collection', collection);
  }

  const response = await fetch(`${API_BASE}/jobs/upload`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<{ job_id: string; track_id: string }>(response).then(
    ({ job_id, track_id }) => ({
      jobId: job_id,
      trackId: track_id,
    }),
  );
}

export async function fetchJob(jobId: string): Promise<JobProgress> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`);
  const payload = await handleResponse<RawJobProgress>(response);
  return toJobProgress(payload);
}

export async function listLoops(trackId: string, barLength?: number): Promise<LoopPreview[]> {
  const query = barLength ? `?bar_length=${barLength}` : '';
  const response = await fetch(`${API_BASE}/library/tracks/${trackId}/loops${query}`);
  const payload = await handleResponse<RawLoopPreview[]>(response);
  return payload.map(toLoopPreview);
}

export async function triggerLoopReslice(
  trackId: string,
  barLength: number,
): Promise<LoopPreview[]> {
  const response = await fetch(
    `${API_BASE}/library/tracks/${trackId}/loops/reslice`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bar_length: barLength }),
    },
  );
  const payload = await handleResponse<RawLoopPreview[]>(response);
  return payload.map(toLoopPreview);
}

interface RawJobProgress {
  job_id: string;
  track_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  current_stage: string;
  progress?: number;
  eta?: string;
  detail?: string;
  stages: RawStageProgress[];
  started_at?: string;
  completed_at?: string;
}

interface RawStageProgress {
  id: string;
  label: string;
  progress: number;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string | null;
  eta_seconds?: number | null;
}

interface RawLoopPreview {
  id: string;
  label: string;
  start_bar: number;
  bar_count: number;
  stem: string;
  bpm: number;
  musical_key?: string | null;
  energy?: number | null;
  file_url?: string | null;
}

interface RawSearchResult {
  track_id: string;
  title: string;
  artist?: string | null;
  source: string;
  status: string;
  confidence: number;
}

function toJobProgress(raw: RawJobProgress): JobProgress {
  return {
    jobId: raw.job_id,
    trackId: raw.track_id,
    status: raw.status,
    currentStage: (raw.current_stage ?? undefined) as JobProgress['currentStage'],
    progress: raw.progress ?? undefined,
    eta: raw.eta,
    detail: raw.detail ?? undefined,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    stages: raw.stages.map(toStageProgress),
  };
}

function toStageProgress(raw: RawStageProgress): StageProgress {
  return {
    id: raw.id as StageProgress['id'],
    label: raw.label,
    progress: raw.progress,
    status: raw.status,
    detail: raw.detail ?? undefined,
    etaSeconds: raw.eta_seconds ?? undefined,
  };
}

function toLoopPreview(raw: RawLoopPreview): LoopPreview {
  return {
    id: raw.id,
    label: raw.label,
    startBar: raw.start_bar,
    barCount: raw.bar_count,
    stem: raw.stem,
    bpm: raw.bpm,
    key: raw.musical_key ?? undefined,
    energy: raw.energy ?? undefined,
    fileUrl: raw.file_url ?? undefined,
  };
}

function toSearchResult(raw: RawSearchResult): SearchResult {
  return {
    trackId: raw.track_id,
    title: raw.title,
    artist: raw.artist,
    source: raw.source,
    status: raw.status,
    confidence: raw.confidence,
  };
}
