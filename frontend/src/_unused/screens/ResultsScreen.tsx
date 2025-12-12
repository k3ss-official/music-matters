/**
 * Results Screen - Preview tracks and GRAB
 */
import React, { useState, useRef, useEffect } from 'react';
import { Track, SearchParams, getPreview } from '../api';

interface Props {
  tracks: Track[];
  searchParams: SearchParams | null;
  aiSuggestion: { track: Track; message: string } | null;
  onBack: () => void;
  onGrab: (track: Track) => void;
}

export function ResultsScreen({ tracks, searchParams, aiSuggestion, onBack, onGrab }: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Filter out rejected tracks
  const visibleTracks = tracks.filter(t => !rejectedIds.has(t.id));

  const handlePlay = async (track: Track) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingId === track.id) {
      setPlayingId(null);
      return;
    }

    setLoadingPreview(track.id);

    try {
      // Get preview URL
      let previewUrl = track.preview_url;
      
      if (!previewUrl) {
        const result = await getPreview(track);
        if (result.success && result.preview_url) {
          previewUrl = result.preview_url;
        }
      }

      if (previewUrl) {
        const audio = new Audio(previewUrl);
        audio.volume = 0.8;
        
        audio.onended = () => {
          setPlayingId(null);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          setPlayingId(null);
          audioRef.current = null;
        };

        await audio.play();
        audioRef.current = audio;
        setPlayingId(track.id);
      }
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setLoadingPreview(null);
    }
  };

  const handleReject = (trackId: string) => {
    // Stop if playing
    if (playingId === trackId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
    }
    
    setRejectedIds(prev => new Set([...prev, trackId]));
  };

  const handleGrab = (track: Track) => {
    // Stop playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
    }
    
    onGrab(track);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const getSectionHintStyle = (hint: string | undefined) => {
    if (!hint) return 'bg-gray-700 text-gray-300';
    
    if (hint.includes('DROP')) return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    if (hint.includes('VOCAL')) return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
    if (hint.includes('INTRO')) return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    if (hint.includes('OUTRO')) return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    if (hint.includes('BREAKDOWN')) return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    
    return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button 
            onClick={onBack}
            className="text-gray-400 hover:text-white transition-colors mb-2 flex items-center gap-1"
          >
            ← Back to Search
          </button>
          <h2 className="text-2xl font-bold text-white">
            {searchParams?.artist}
            {searchParams?.year_from && searchParams?.year_to && (
              <span className="text-gray-400 font-normal ml-2">
                ({searchParams.year_from} - {searchParams.year_to})
              </span>
            )}
          </h2>
          <p className="text-gray-500">
            {visibleTracks.length} tracks found
            {rejectedIds.size > 0 && ` (${rejectedIds.size} rejected)`}
          </p>
        </div>
      </div>

      {/* AI Suggestion */}
      {aiSuggestion && !rejectedIds.has(aiSuggestion.track.id) && (
        <div className="mb-6 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 
                        border border-emerald-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-emerald-400 text-sm font-medium">🤖 AI Suggestion</span>
          </div>
          <p className="text-white">{aiSuggestion.message}</p>
        </div>
      )}

      {/* Track List */}
      <div className="space-y-3">
        {visibleTracks.map(track => (
          <div 
            key={track.id}
            className={`p-4 rounded-xl border transition-all ${
              playingId === track.id 
                ? 'bg-emerald-500/10 border-emerald-500/50' 
                : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50'
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Play/Stop Button */}
              <button
                onClick={() => handlePlay(track)}
                disabled={loadingPreview === track.id}
                className={`w-12 h-12 flex items-center justify-center rounded-full 
                           transition-all flex-shrink-0 ${
                  playingId === track.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {loadingPreview === track.id ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : playingId === track.id ? (
                  <span className="text-lg">⏹</span>
                ) : (
                  <span className="text-lg ml-1">▶</span>
                )}
              </button>

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-medium truncate">{track.title}</h3>
                  {track.year && (
                    <span className="text-gray-500 text-sm">({track.year})</span>
                  )}
                  {track.track_type !== 'original' && (
                    <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400">
                      {track.track_type}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {/* Section Hint */}
                  {track.section_hint && (
                    <span className={`px-2 py-0.5 text-xs rounded ${getSectionHintStyle(track.section_hint)}`}>
                      {track.section_hint}
                    </span>
                  )}
                  
                  {/* BPM */}
                  {track.bpm && (
                    <span className="text-gray-500 text-sm">{track.bpm} BPM</span>
                  )}
                  
                  {/* Key */}
                  {track.key && (
                    <span className="text-gray-500 text-sm">{track.key}</span>
                  )}
                  
                  {/* Duration */}
                  {track.duration_ms && (
                    <span className="text-gray-500 text-sm">
                      {Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  )}
                  
                  {/* Source */}
                  <span className="text-gray-600 text-xs">{track.source}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Reject */}
                <button
                  onClick={() => handleReject(track.id)}
                  className="px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 
                             rounded-lg transition-all"
                  title="Not this one"
                >
                  ✕
                </button>

                {/* GRAB */}
                <button
                  onClick={() => handleGrab(track)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white 
                             font-medium rounded-lg transition-all flex items-center gap-2"
                >
                  <span>GRAB</span>
                  <span>🎯</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {visibleTracks.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🤷</div>
          <p className="text-gray-400">
            {rejectedIds.size > 0 
              ? "You've rejected all tracks. Try a new search?"
              : "No tracks found. Try different search terms."
            }
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all"
          >
            New Search
          </button>
        </div>
      )}
    </div>
  );
}
