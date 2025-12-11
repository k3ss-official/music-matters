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
} from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000, // 5 minutes for long operations
});

// Health & Info
export const checkHealth = async (): Promise<{ status: string; services: Record<string, boolean> }> => {
  const response = await api.get('/health');
  return response.data;
};

export const getAppInfo = async () => {
  const response = await api.get('/info');
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

export const getArtistTracks = async (
  artistName: string,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    trackTypes?: string[];
  }
): Promise<TrackSearchResponse> => {
  const params: Record<string, any> = {};
  
  if (filters?.dateFrom) params.date_from = filters.dateFrom;
  if (filters?.dateTo) params.date_to = filters.dateTo;
  if (filters?.trackTypes?.length) {
    // Send multiple track_type params
    const searchParams = new URLSearchParams();
    filters.trackTypes.forEach(type => searchParams.append('track_type', type));
    const response = await api.get(`/artist/${encodeURIComponent(artistName)}/tracks?${searchParams.toString()}`);
    return response.data;
  }
  
  const response = await api.get(`/artist/${encodeURIComponent(artistName)}/tracks`, { params });
  return response.data;
};

// Download
export const downloadTrack = async (
  artist: string,
  title: string,
  url?: string
): Promise<DownloadResult> => {
  const response = await api.post('/download', { artist, title, url });
  return response.data;
};

// Analysis
export const analyzeTrack = async (filePath: string): Promise<AnalysisResult> => {
  const response = await api.post('/analyze', { file_path: filePath });
  return response.data;
};

// Sample Extraction
export const extractSamples = async (
  filePath: string,
  options: {
    artist?: string;
    title?: string;
    barCount?: number;
    sectionPreference?: string;
    extractStems?: boolean;
    selectedStems?: string[];
    maxSamples?: number;
  }
): Promise<SampleExtractionResponse> => {
  const response = await api.post('/samples/extract', {
    file_path: filePath,
    artist: options.artist || 'Unknown',
    title: options.title || 'Unknown',
    bar_count: options.barCount || 16,
    section_preference: options.sectionPreference,
    extract_stems: options.extractStems || false,
    selected_stems: options.selectedStems,
    max_samples: options.maxSamples || 3,
  });
  return response.data;
};

export const extractCustomSample = async (
  filePath: string,
  startTime: number,
  endTime: number,
  options: {
    artist?: string;
    title?: string;
    extractStems?: boolean;
  }
): Promise<Sample> => {
  const response = await api.post('/samples/custom', {
    file_path: filePath,
    start_time: startTime,
    end_time: endTime,
    artist: options.artist || 'Unknown',
    title: options.title || 'Unknown',
    extract_stems: options.extractStems || false,
  });
  return response.data;
};

export const listSamples = async (): Promise<{ name: string; path: string; size: number }[]> => {
  const response = await api.get('/samples');
  return response.data.samples;
};

export const deleteSample = async (sampleId: string): Promise<{ deleted: string }> => {
  const response = await api.delete(`/samples/${sampleId}`);
  return response.data;
};

// Stem Separation
export const getStemInfo = async (): Promise<StemInfo> => {
  const response = await api.get('/stems/info');
  return response.data;
};

export const separateStems = async (
  filePath: string,
  selectedStems?: string[]
): Promise<StemResult> => {
  const response = await api.post('/stems/separate', {
    file_path: filePath,
    selected_stems: selectedStems,
  });
  return response.data;
};

// Audio file URL helper
export const getAudioUrl = (filename: string): string => {
  return `${API_BASE}/audio/${encodeURIComponent(filename)}`;
};

// File download helper
export const getDownloadUrl = (filePath: string): string => {
  return `${API_BASE}/download-file?path=${encodeURIComponent(filePath)}`;
};

export default api;
