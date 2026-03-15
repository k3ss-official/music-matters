/**
 * API Service for communicating with the Python backend
 */
import axios from 'axios';
import type {
  Artist,
  Track,
  Sample,
  AnalysisResult,
  DownloadResult,
  StemInfo,
  StemResult,
  TrackSearchResponse,
  SampleExtractionResponse,
  TrackSummary,
  TrackListResponse,
  TrackDetailResponse,
  JobProgress,
  IngestPayload,
  ProcessingOptions,
  LoopPreview
} from '../types';


// ---------------------------------------------------------------------------
// Typed error helper
// ---------------------------------------------------------------------------
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly detail: string,
        public readonly raw?: unknown,
    ) {
        super(detail);
        this.name = 'ApiError';
    }
}

function handleAxiosError(err: unknown): never {
    const axErr = err as import('axios').AxiosError<{ detail?: string }>;
    const status = axErr.response?.status ?? 0;
    const detail = axErr.response?.data?.detail || (err as any)?.message || 'Unknown error';
    throw new ApiError(status, detail, err);
}

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for long operations
});

// --- v2 Main API ---

// Library
export const listTracks = async (limit = 50, offset = 0): Promise<TrackListResponse> => {
  const response = await api.get('/library/tracks', { params: { limit, offset } });
  return response.data;
};

export const getTrackDetail = async (trackId: string): Promise<TrackDetailResponse> => {
  const response = await api.get(`/library/tracks/${trackId}`);
  return response.data;
};

export const deleteTrack = async (trackId: string): Promise<void> => {
  await api.delete(`/library/tracks/${trackId}`);
};

// Ingest
export const ingestSource = async (payload: IngestPayload & { options?: ProcessingOptions }): Promise<{ job_id: string; track_id: string }> => {
  const response = await api.post('/ingest/ingest', payload);
  return response.data;
};

export const uploadTrack = async (file: File, options: ProcessingOptions): Promise<{ job_id: string; track_id: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('options', JSON.stringify(options));

  const response = await api.post('/ingest/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// Jobs
export const listActiveJobs = async (): Promise<JobProgress[]> => {
  const response = await api.get('/jobs/active');
  return response.data;
};

// Loops
export const createCustomLoop = async (trackId: string, startTime: number, endTime: number, stems: string[]): Promise<LoopPreview> => {
  const response = await api.post(`/library/tracks/${trackId}/loops/custom`, {
    start_time: startTime,
    end_time: endTime,
    stems
  });
  return response.data;
};


// ---------------------------------------------------------------------------
// Batch ingest
// ---------------------------------------------------------------------------
export const batchIngest = async (
    queries: string[],
    options?: import('../types').ProcessingOptions,
    collection?: string,
): Promise<{ jobs: Array<{ job_id: string; track_id: string }>; total: number }> => {
    try {
        const response = await api.post('/ingest/batch', {
            queries,
            options: options ? {
                analysis: options.analysis,
                separation: options.separation,
                loop_slicing: options.loopSlicing,
                mastering: options.mastering,
            } : undefined,
            collection,
        });
        return response.data;
    } catch (err) {
        handleAxiosError(err);
    }
};

// ---------------------------------------------------------------------------
// MIDI mapping
// ---------------------------------------------------------------------------
export interface MidiPadMapping {
    note: number;
    channel: number;
    row: number;
    col: number;
    function: string;
    label: string;
    color_idle: number;
    color_active: number;
    group: 'stem_lane' | 'phrase' | 'transport';
}

export interface MidiMappingResponse {
    device: string;
    grid: string;
    total_pads: number;
    note_layout: string;
    mappings: MidiPadMapping[];
}

export const getApcMiniMk2Mapping = async (): Promise<MidiMappingResponse> => {
    try {
        const response = await api.get('/midi/apc-mini-mk2/mapping');
        return response.data;
    } catch (err) {
        handleAxiosError(err);
    }
};

// ---------------------------------------------------------------------------
// Ableton export — triggers a real browser file download
// ---------------------------------------------------------------------------
export const downloadAbletonExport = async (
    trackId: string,
    stems: string[],
    startTime: number = 0,
    endTime: number = 0,
): Promise<{ blob: Blob; filename: string }> => {
    try {
        const metaResp = await api.post('/export/ableton', {
            track_id: trackId,
            stems,
            start_time: startTime,
            end_time: endTime,
        });
        const meta = metaResp.data as { success: boolean; output_file: string; download_url?: string };
        const downloadUrl = meta.download_url || `/api/download-file?path=${encodeURIComponent(meta.output_file)}`;
        const fileResp = await api.get(downloadUrl, { responseType: 'blob' });
        const filename = (meta.output_file.split('/').pop() || meta.output_file.split('\\').pop() || 'project.als') as string;
        return { blob: fileResp.data as Blob, filename };
    } catch (err) {
        handleAxiosError(err);
    }
};

export interface SmartPhrase {
  type: string;
  start_time: number;
  end_time: number;
  start_bar: number;
  bar_count: number;
  confidence: number;
  energy: number;
}

export interface SmartPhrasesResponse {
  phrases: SmartPhrase[];
  duration: number;
  bpm: number;
}

export const getSmartPhrases = async (trackId: string): Promise<SmartPhrasesResponse> => {
  const response = await api.get(`/library/tracks/${trackId}/phrases`);
  return response.data;
};

export interface AbletonExportResponse {
  success: boolean;
  format: string;
  output_file: string;
  stem_count: number;
  download_url: string;
}

export const exportToAbleton = async (
  trackId: string, 
  stems: string[], 
  startTime: number = 0, 
  endTime: number = 0
): Promise<AbletonExportResponse> => {
  const response = await api.post('/export/ableton', {
    track_id: trackId,
    stems,
    start_time: startTime,
    end_time: endTime
  });
  return response.data;
};

// --- Legacy / Domain Specific APIs ---

// Health & Info
export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await api.get('/health');
  return response.data;
};

// Artist Search
export const searchArtists = async (query: string): Promise<Artist[]> => {
  const response = await api.get('/search/artists', { params: { q: query } });
  return response.data.results;
};

// Track Search
export const searchTracks = async (query: string, limit = 20): Promise<Track[]> => {
  const response = await api.get('/search/tracks', { params: { q: query, limit } });
  return response.data.results;
};

// Audio file URL helper
export const getAudioUrl = (filename: string): string => {
  return `${API_BASE}/audio/${encodeURIComponent(filename)}`;
};

export const getTrackAudioUrl = (trackId: string): string => {
  return `${API_BASE}/audio/tracks/${trackId}`;
};

export const getStemAudioUrl = (trackId: string, stemName: string): string => {
  return `${API_BASE}/audio/stems/${trackId}/${stemName}`;
};

// File download helper
export const getDownloadUrl = (filePath: string): string => {
  return `${API_BASE}/download-file?path=${encodeURIComponent(filePath)}`;
};

export default api;
