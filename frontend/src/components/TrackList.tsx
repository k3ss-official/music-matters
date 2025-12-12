/**
 * Track List Component
 * Displays search results with selection
 */
import React from 'react';
import type { Track } from '../types';

interface TrackListProps {
  tracks: Track[];
  selectedTracks: string[];
  onToggleSelect: (trackId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isLoading?: boolean;
}

const trackTypeBadges: Record<string, { label: string; color: string }> = {
  original: { label: 'Original', color: 'bg-dj-accent/20 text-dj-accent' },
  remix: { label: 'Remix', color: 'bg-purple-500/20 text-purple-400' },
  collaboration: { label: 'Collab', color: 'bg-blue-500/20 text-blue-400' },
  production: { label: 'Prod', color: 'bg-orange-500/20 text-orange-400' },
};

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  selectedTracks,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    );
  }
  
  if (tracks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No tracks found</p>
      </div>
    );
  }
  
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-400">
          {selectedTracks.length} of {tracks.length} selected
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-sm text-dj-accent hover:underline"
          >
            Select All
          </button>
          <span className="text-gray-600">|</span>
          <button
            onClick={onDeselectAll}
            className="text-sm text-gray-400 hover:text-white"
          >
            Deselect All
          </button>
        </div>
      </div>
      
      {/* Track List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
        {tracks.map((track) => {
          const isSelected = selectedTracks.includes(track.id);
          const badge = trackTypeBadges[track.track_type] || trackTypeBadges.original;
          
          return (
            <div
              key={track.id}
              onClick={() => onToggleSelect(track.id)}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-dj-accent/10 border border-dj-accent/50'
                  : 'bg-gray-900/50 border border-gray-800 hover:border-gray-700'
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-dj-accent border-dj-accent'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              
              {/* Cover Art */}
              {track.cover_art_url ? (
                <img
                  src={track.cover_art_url}
                  alt={track.title}
                  className="w-12 h-12 rounded object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                  <MusicIcon className="w-6 h-6 text-gray-600" />
                </div>
              )}
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-white truncate">
                    {track.title}
                  </h4>
                  <span className={`badge ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-sm text-gray-400 truncate">
                  {track.artist}
                  {track.album && ` • ${track.album}`}
                </p>
              </div>
              
              {/* Meta */}
              <div className="text-right text-sm">
                {track.release_date && (
                  <div className="text-gray-400">
                    {formatDate(track.release_date)}
                  </div>
                )}
                {track.duration_ms && (
                  <div className="text-gray-500">
                    {formatDuration(track.duration_ms)}
                  </div>
                )}
              </div>
              
              {/* Featuring */}
              {track.featuring.length > 0 && (
                <div className="hidden lg:block text-xs text-gray-500 max-w-[150px] truncate">
                  ft. {track.featuring.join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Mini component for track row in sample view
interface TrackRowProps {
  track: Track;
  status: 'pending' | 'downloading' | 'analyzing' | 'extracting' | 'done' | 'error';
  progress?: number;
  error?: string;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  status,
  progress = 0,
  error,
}) => {
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'text-gray-500' },
    downloading: { label: 'Downloading...', color: 'text-blue-400' },
    analyzing: { label: 'Analyzing...', color: 'text-purple-400' },
    extracting: { label: 'Extracting...', color: 'text-dj-accent' },
    done: { label: 'Complete', color: 'text-green-400' },
    error: { label: 'Error', color: 'text-red-400' },
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full ${
        status === 'done' ? 'bg-green-400' :
        status === 'error' ? 'bg-red-400' :
        status === 'pending' ? 'bg-gray-500' :
        'bg-dj-accent animate-pulse'
      }`} />
      
      {/* Track info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{track.title}</div>
        <div className="text-sm text-gray-400 truncate">{track.artist}</div>
      </div>
      
      {/* Status */}
      <div className={`text-sm ${config.color}`}>
        {error ? error : config.label}
      </div>
      
      {/* Progress bar */}
      {(status === 'downloading' || status === 'analyzing' || status === 'extracting') && (
        <div className="w-20 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-dj-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

// Icons
const MusicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

// Helpers
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length >= 1) return parts[0];
  return dateStr;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default TrackList;
