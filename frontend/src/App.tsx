/**
 * Music Matters - Unified Application
 * Production-grade DJ & Producer automation platform
 * 
 * Features:
 * - Multi-source track search (MusicBrainz, Spotify, YouTube)
 * - SOTA audio structure analysis
 * - 6-stem separation (Demucs)
 * - Intelligent sampling & loop generation
 * - Harmonic mixing (Camelot wheel, mashup scoring)
 * - Audio fingerprinting & similarity detection
 * - DAW export (Rekordbox, Serato, M3U)
 * - Waveform visualization
 * - Desktop app (Tauri)
 */
import { useState, useEffect, useCallback } from 'react';
import SearchPanel from './components/SearchPanel';
import TrackList from './components/TrackList';
import SampleCard from './components/SampleCard';
import ExtractionSettings from './components/ExtractionSettings';
import SOTAPanel from './components/SOTAPanel';
import MashupScorer from './components/MashupScorer';
import Waveform from './components/Waveform';
import './index.css';

type View = 'search' | 'results' | 'processing' | 'library' | 'sota' | 'mashup';

interface Track {
  id: string;
  title: string;
  artist: string;
  year?: number;
  duration_ms?: number;
  bpm?: number;
  key?: string;
  camelot?: string;
  cover_art_url?: string;
  track_type?: string;
}

interface ProcessingJob {
  id: string;
  status: string;
  progress: number;
  stage: string;
  result?: any;
  error?: string;
}

function App() {
  const [view, setView] = useState<View>('search');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [processingJobs, setProcessingJobs] = useState<Map<string, ProcessingJob>>(new Map());
  const [samples, setSamples] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Check backend health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('http://localhost:8010/health');
        const data = await response.json();
        setIsConnected(data.status === 'ok');
      } catch {
        setIsConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = useCallback(async (searchParams: any) => {
    try {
      const response = await fetch('http://localhost:8010/api/search/artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams)
      });
      const data = await response.json();
      setTracks(data.tracks || []);
      setView('results');
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Is the backend running?');
    }
  }, []);

  const handleProcessTrack = useCallback(async (track: Track) => {
    try {
      const response = await fetch('http://localhost:8010/api/processing/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_path: `/path/to/download/${track.id}`,  // This would come from download service
          artist: track.artist,
          title: track.title,
          year: track.year,
          enable_stems: true,
          enable_sections: true,
          enable_loops: true,
          loop_bars: [4, 8, 16, 32]
        })
      });
      const data = await response.json();
      
      // Add job to tracking
      const newJobs = new Map(processingJobs);
      newJobs.set(data.job_id, {
        id: data.job_id,
        status: 'queued',
        progress: 0,
        stage: 'Starting',
      });
      setProcessingJobs(newJobs);
      setView('processing');

      // Poll for status
      pollJobStatus(data.job_id);
    } catch (error) {
      console.error('Processing error:', error);
      alert('Failed to start processing');
    }
  }, [processingJobs]);

  const pollJobStatus = useCallback(async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:8010/api/processing/job/${jobId}`);
        const job = await response.json();

        setProcessingJobs(prev => {
          const newJobs = new Map(prev);
          newJobs.set(jobId, job);
          return newJobs;
        });

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(interval);
          if (job.status === 'completed' && job.result) {
            // Add to samples
            setSamples(prev => [...prev, job.result]);
          }
        }
      } catch (error) {
        console.error('Job status error:', error);
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Connection Status Bar */}
      {!isConnected && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50 shadow-lg">
          ⚠️ Backend not connected - Start server: <code className="bg-red-700 px-2 py-1 rounded ml-2">uvicorn app.main:app --host 0.0.0.0 --port 8010</code>
        </div>
      )}

      {/* Header */}
      <header className={`border-b border-purple-800/30 bg-black/40 backdrop-blur-md sticky ${!isConnected ? 'top-10' : 'top-0'} z-40 shadow-2xl`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('search')}>
              <span className="text-4xl group-hover:scale-110 transition-transform">🎧</span>
              <div>
                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                  Music Matters
                </h1>
                <p className="text-xs text-gray-500 font-mono">SOTA DJ & Producer Platform v2.0</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-3">
              {['search', 'results', 'processing', 'library', 'sota', 'mashup'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v as View)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    view === v
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                      : 'text-gray-400 hover:text-white hover:bg-purple-900/30'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}

              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                isConnected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
                <span className="text-xs font-medium">{isConnected ? 'Connected' : 'Offline'}</span>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search View */}
        {view === 'search' && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-white mb-2">Find Any Track</h2>
              <p className="text-gray-400">Search across MusicBrainz, Spotify, and YouTube</p>
            </div>
            <SearchPanel onSearch={handleSearch} />
          </div>
        )}

        {/* Results View */}
        {view === 'results' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-white">
                Search Results <span className="text-purple-400">({tracks.length})</span>
              </h2>
              <button
                onClick={() => setView('search')}
                className="px-4 py-2 bg-purple-900/50 text-purple-300 rounded-lg hover:bg-purple-800/50 transition"
              >
                ← New Search
              </button>
            </div>
            <TrackList tracks={tracks} onSelectTrack={handleProcessTrack} />
          </div>
        )}

        {/* Processing View */}
        {view === 'processing' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl font-bold text-white">Processing Jobs</h2>
            <div className="grid gap-4">
              {Array.from(processingJobs.values()).map((job) => (
                <div key={job.id} className="bg-gray-800/50 rounded-xl p-6 border border-purple-800/30">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-white">{job.id}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      job.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                      job.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                      'bg-purple-900/30 text-purple-400'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{job.stage}</span>
                      <span className="text-purple-400 font-medium">{job.progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                  {job.error && (
                    <div className="mt-4 p-3 bg-red-900/20 border border-red-600/30 rounded-lg text-red-400 text-sm">
                      {job.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Library View */}
        {view === 'library' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl font-bold text-white">Your Library</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {samples.map((sample, idx) => (
                <SampleCard key={idx} sample={sample} />
              ))}
              {samples.length === 0 && (
                <div className="col-span-full text-center py-20 text-gray-500">
                  <p className="text-xl">No samples yet</p>
                  <p className="text-sm mt-2">Process some tracks to get started!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SOTA Analysis View */}
        {view === 'sota' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl font-bold text-white">SOTA Analysis</h2>
            <SOTAPanel />
          </div>
        )}

        {/* Mashup Scorer View */}
        {view === 'mashup' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl font-bold text-white">Mashup Scorer</h2>
            <MashupScorer />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-800/30 mt-auto py-6 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-500">
            Built for M4 Mini • Powered by Demucs, librosa, yt-dlp • SOTA Quality • Production Ready
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Music Matters v2.0 - The Ultimate DJ & Producer Automation Platform
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
