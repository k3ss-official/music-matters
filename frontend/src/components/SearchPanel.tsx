import { useState } from 'react';
import type { Track } from '../App';

interface SearchPanelProps {
  connected: boolean;
  loading: boolean;
  onTrackSelected: (track: Track) => void;
}

export default function SearchPanel({ connected, loading, onTrackSelected }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !connected) return;
    
    setSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleGrab = async (track: Track) => {
    onTrackSelected(track);
  };

  return (
    <div className="max-w-4xl mx-auto py-12">
      {/* Search Input */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
        <h2 className="text-2xl font-bold mb-6">Search for a track</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Artist - Track or paste YouTube URL..."
            className="flex-1 px-6 py-4 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-500 text-lg"
            disabled={!connected || searching}
          />
          <button
            onClick={handleSearch}
            disabled={!connected || searching || !query.trim()}
            className="px-12 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-semibold text-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {searching ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-4">
          Search by artist/track name or paste a YouTube/Spotify URL
        </p>
      </div>

      {/* Results */}
      {tracks.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-xl font-semibold text-gray-300">Results ({tracks.length})</h3>
          <div className="space-y-3">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 hover:bg-white/10 hover:border-cyan-400/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold">{track.artist} - {track.title}</h4>
                    <div className="flex gap-4 mt-2 text-sm text-gray-400">
                      {track.year && <span>📅 {track.year}</span>}
                      {track.bpm && <span>🥁 {track.bpm} BPM</span>}
                      {track.key && <span>🎹 {track.key}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleGrab(track)}
                    disabled={loading}
                    className="px-8 py-3 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl font-semibold hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    ⬇ GRAB
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!searching && tracks.length === 0 && query && (
        <div className="mt-12 text-center text-gray-500">
          <p className="text-lg">No tracks found. Try a different search!</p>
        </div>
      )}
    </div>
  );
}
