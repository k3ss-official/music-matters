export type StageKey =
  | 'ingest'
  | 'analysis'
  | 'separation'
  | 'loop'
  | 'project';

export interface JobProgress {
  jobId: string;
  trackId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStage?: StageKey | null;
  stages: StageProgress[];
  startedAt?: string;
  completedAt?: string;
  eta?: string;
  detail?: string;
  progress?: number;
}

export interface StageProgress {
  id: StageKey;
  label: string;
  progress: number; // 0-1
  etaSeconds?: number;
  detail?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface LoopPreview {
  id: string;
  label: string;
  startBar: number;
  barCount: number;
  stem: string;
  bpm: number;
  key?: string;
  fileUrl?: string;
  energy?: number;
}

export interface SearchResult {
  trackId: string;
  title: string;
  artist?: string | null;
  confidence: number;
  source: string;
  status: string;
}

export interface TrackQuery {
  query: string;
  collection?: string;
  tags?: string[];
}

export interface IngestPayload {
  source: string;
  collection?: string;
  tags?: string[];
}
