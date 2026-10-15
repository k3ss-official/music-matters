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
  musical_key?: string | null;
  fileUrl?: string;
  file_url?: string;
  energy?: number;
  tags?: string[];
}

export interface DiscoveryMatch {
  id: string;
  track_id?: string | null;
  title: string;
  artist: string;
  producer?: string | null;
  remixer?: string | null;
  year?: number | null;
  track_type?: string | null;
  bpm?: number | null;
  key?: string | null;
  duration?: number | null;
  status: string;
  source: string;
  in_library: boolean;
  preview_url?: string | null;
  stems_count?: number;
  loops_count?: number;
  confidence: number;
  match_reasons: string[];
}

export interface MultiAngleDiscoveryRequest {
  angle?: 'all' | 'title' | 'lyrics' | 'natural_language' | 'producer' | 'shazam' | 'recording';
  query?: string;
  lyrics?: string;
  description?: string;
  producer?: string;
  remixer?: string;
  year_from?: number | null;
  year_to?: number | null;
  track_type?: string;
  bpm_min?: number | null;
  bpm_max?: number | null;
  musical_key?: string;
  include_online?: boolean;
  limit?: number;
}

export interface MultiAngleDiscoveryResponse {
  angle: string;
  query: string;
  count: number;
  matches: DiscoveryMatch[];
}

export interface AudioConditioningResult {
  cleaned: boolean;
  dc_offset_removed?: number;
  highpass_hz?: number;
  declipped_samples?: number;
  normalized?: boolean;
  target_dbfs?: number;
  peak_before_db?: number;
  peak_after_db?: number;
  rms_db?: number;
  sample_rate?: number;
  channels?: number;
}

export interface LoopBundleResult {
  bundle_id: string;
  track_id: string;
  label: string;
  start_time: number;
  end_time: number;
  bar_count: number;
  post_production: boolean;
  complete_loop?: LoopPreview | null;
  stem_loops: LoopPreview[];
  total_saved: number;
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
  duration?: number | null;
  loop_count?: number;
  stems?: string[];
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
