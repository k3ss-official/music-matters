import { useState, useEffect } from 'react';
import './index.css';

interface Track {
  id: string;
  artist: string;
  title: string;
  bpm?: number;
  key?: string;
  camelot?: string;
  year?: number;
}

function App() {
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  // Check backend connection
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
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
      setLoading(false);
    }
  };

  const handleGrab = async (track: Track) => {
    try {
      const res = await fetch('/api/grab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: track.id,
          artist: track.artist,
          title: track.title,
          year: track.year,
        }),
      });
      const data = await res.json();
      alert(`Processing started! Job ID: ${data.job_id}`);
    } catch (err) {
      console.error('GRAB failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-teal-800 to-blue-900 text-white p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
              🎧 Music Matters v2.0
            </h1>
            <p className="text-gray-300 mt-2">SOTA DJ & Producer Automation Platform</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
            <span className="text-sm">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for tracks..."
              className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 text-white placeholder-gray-400"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !connected}
              className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '🔍 Searching...' : '🔍 Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        {tracks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">🎵 Results ({tracks.length})</h2>
            <div className="grid gap-4">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="bg-white/10 backdrop-blur-lg rounded-xl p-6 hover:bg-white/15 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">{track.artist} - {track.title}</h3>
                      <div className="flex gap-4 mt-2 text-sm text-gray-300">
                        {track.year && <span>📅 {track.year}</span>}
                        {track.bpm && <span>🥁 {track.bpm} BPM</span>}
                        {track.key && <span>🎹 {track.key}</span>}
                        {track.camelot && (
                          <span className="px-2 py-1 bg-purple-500/30 rounded-lg font-mono">
                            {track.camelot}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleGrab(track)}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl font-semibold hover:from-green-600 hover:to-teal-600 transition-all"
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
        {!loading && tracks.length === 0 && query && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-xl">No tracks found. Try a different search!</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 text-center text-gray-400 text-sm">
          <p>Music Matters v2.0 - Built by DJs, for DJs</p>
          <p className="mt-2">Powered by Demucs, librosa & yt-dlp • Optimized for Apple Silicon</p>
        </div>
      </div>
    </div>
  );
}

export default App;
