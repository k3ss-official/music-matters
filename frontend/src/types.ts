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

export type ProcessingMode = 'full' | 'stems-only' | 'master-stems' | 'custom';

export interface ProcessingOptions {
  analysis: boolean;
  separation: boolean;
  loopSlicing: boolean;
  mastering: boolean;
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

export interface TrackSummary {
  track_id: string;
  title: string;
  artist?: string | null;
  status: string;
  bpm?: number | null;
  musical_key?: string | null;
  created_at: string;
}

export interface TrackListResponse {
  items: TrackSummary[];
  total: number;
}

export interface TrackDetailResponse extends TrackSummary {
  metadata: Record<string, any>;
  stems: string[];
  loops: string[];
  provenance: Record<string, any>;
}

// Additional types for DJ Sample Discovery integration
export interface Artist {
  id: string;
  name: string;
  genres?: string[];
  imageUrl?: string;
}

export interface Track {
  id: string;
  artist: string;
  title: string;
  year?: number;
  bpm?: number;
  key?: string;
  camelot?: string;
  duration?: number;
  source?: string;
}

export interface Sample {
  id: string;
  trackId: string;
  start: number;
  end: number;
  section: string;
  score: number;
}

export interface AnalysisResult {
  track_id: string;
  bpm?: number;
  key?: string;
  structure?: Array<{ section: string; start: number; end: number; energy: number }>;
  mashup_potential?: number;
}

export interface DownloadResult {
  success: boolean;
  track_id: string;
  file_path?: string;
  error?: string;
}

export interface StemInfo {
  name: string;
  path: string;
}

export interface StemResult {
  track_id: string;
  stems: StemInfo[];
}

export interface TrackSearchResponse {
  success: boolean;
  tracks: Track[];
  total: number;
  query: string;
}

export interface SampleExtractionResponse {
  success: boolean;
  samples: Sample[];
  track_id: string;
}
