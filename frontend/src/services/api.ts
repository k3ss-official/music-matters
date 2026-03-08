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
