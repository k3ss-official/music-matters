import { useState, useEffect } from 'react';
import './index.css';
import { UploadPanel } from './components/UploadPanel';
import { TrackHistory } from './components/TrackHistory';
import { TrackWorkspace } from './components/TrackWorkspace';
import type { TrackSummary, ProcessingOptions, JobProgress } from './types';
import * as api from './services/api';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [activeJobs, setActiveJobs] = useState<Record<string, JobProgress>>({});
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Health check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.checkHealth();
        if (data.status === 'ok') setIsConnected(true);
        else setIsConnected(false);
      } catch {
        setIsConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch track history
  const loadTracks = async () => {
    try {
      const data = await api.listTracks(50);
      setTracks(data.items || []);
    } catch (e) {
      console.error('Failed to load tracks', e);
    }
  };

  useEffect(() => {
    loadTracks();
    const interval = setInterval(loadTracks, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Poll active jobs
  useEffect(() => {
    const pollJobs = async () => {
      try {
        const jobs = await api.listActiveJobs();
        const jobMap: Record<string, JobProgress> = {};
        jobs.forEach((j) => { jobMap[j.jobId] = j; });
        setActiveJobs(jobMap);

        // Re-load tracks if any job just completed (basic heuristic)
        if (jobs.some(j => j.status === 'completed')) {
          loadTracks();
        }
      } catch (e) {
        // ignore
      }
    };
    pollJobs();
    const interval = setInterval(pollJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (file: File, options: ProcessingOptions) => {
    try {
      const data = await api.uploadTrack(file, options);
      setActiveJobs(prev => ({
        ...prev,
        [data.job_id]: {
          jobId: data.job_id,
          trackId: data.track_id,
          status: 'queued',
          stages: []
        }
      }));
    } catch (e) {
      alert('Upload Failed!');
      console.error(e);
    }
  };

  const handleUrlSubmit = async (url: string, options: ProcessingOptions) => {
    try {
      const data = await api.ingestSource({
        source: url,
        options: options
      });
      setActiveJobs(prev => ({
        ...prev,
        [data.job_id]: {
          jobId: data.job_id,
          trackId: data.track_id,
          status: 'queued',
          stages: []
        }
      }));
    } catch (e) {
      alert('Ingest Failed!');
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur border-b border-gray-800 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎧</span>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-purple-500">
                Music Matters
              </h1>
              <p className="text-xs text-gray-400">Production & Slicing Suite</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {Object.keys(activeJobs).length > 0 && (
              <div className="text-sm bg-purple-900/30 text-purple-400 px-3 py-1 rounded-full animate-pulse border border-purple-500/30">
                {Object.keys(activeJobs).length} Active Job(s)
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${isConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500'}`} />
              {isConnected ? 'Backend Ready' : 'Backend Offline'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 pb-20">
        {selectedTrackId ? (
          <TrackWorkspace trackId={selectedTrackId} onClose={() => setSelectedTrackId(null)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2 space-y-6">
              {/* Upload & Ingest Panel */}
              <UploadPanel
                onFileUpload={handleFileUpload}
                onUrlSubmit={handleUrlSubmit}
              />

              {/* Active Jobs Queue */}
              {Object.values(activeJobs).length > 0 && (
                <section className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 shadow-xl">
                  <h2 className="text-xl font-bold text-white mb-4">Processing Queue</h2>
                  <div className="space-y-4">
                    {Object.values(activeJobs).map(job => (
                      <div key={job.jobId} className="bg-black/40 border border-gray-700/50 p-4 rounded-xl relative overflow-hidden">
                        <div className="flex justify-between text-sm mb-2">
                          <div className="font-medium text-gray-300">Job {job.jobId.slice(0, 8)}</div>
                          <div className="text-teal-400 font-bold uppercase tracking-wider text-xs">
                            {job.currentStage || job.status}
                          </div>
                        </div>

                        {/* Progress Bar overall */}
                        <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.8)]"
                            style={{ width: `${(job.progress || 0) * 100}%` }}
                          />
                        </div>

                        {/* Individual stages */}
                        <div className="flex gap-2 mt-4 overflow-x-auto text-xs pb-1">
                          {job.stages?.map(stage => (
                            <div key={stage.id} className={`flex-shrink-0 px-2 py-1 rounded transition-colors ${stage.status === 'done' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                              stage.status === 'running' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse' :
                                stage.status === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                  'bg-gray-800 border border-gray-700 text-gray-500'
                              }`}>
                              {stage.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar: Library History */}
            <div className="lg:col-span-1">
              <TrackHistory
                tracks={tracks}
                onTrackSelect={(id) => setSelectedTrackId(id)}
                selectedTrackId={selectedTrackId}
              />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;
