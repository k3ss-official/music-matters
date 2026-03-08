import { useState, useEffect, useRef } from 'react';
import './index.css';

import type { TrackSummary, JobProgress, ProcessingOptions, TrackDetailResponse, LoopPreview } from './types';
import * as api from './services/api';

import { SearchIngest } from './components/SearchIngest';
import { QueuePanel } from './components/QueuePanel';
import { LibraryBrowser } from './components/LibraryBrowser';
import { CentreWorkspace } from './components/CentreWorkspace';
import { AnalysisPanel } from './components/AnalysisPanel';
import { StemLanes } from './components/StemLanes';
import { ExportPanel } from './components/ExportPanel';
import type WaveSurfer from 'wavesurfer.js';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [activeJobs, setActiveJobs] = useState<Record<string, JobProgress>>({});

  // Selection State
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackDetail, setTrackDetail] = useState<TrackDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Waveform & Loop State
  const [waveformReady, setWaveformReady] = useState(false);
  const [regionStart, setRegionStart] = useState<number>(0);
  const [regionEnd, setRegionEnd] = useState<number>(0);
  const [selectedStems, setSelectedStems] = useState<string[]>([]);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);

  // Health check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.checkHealth();
        setIsConnected(data.status === 'ok');
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

        // Re-load tracks if any job just completed
        if (jobs.some(j => j.status === 'completed')) {
          loadTracks();
          // If the selected track just completed processing, refresh its details
          if (selectedTrackId && jobs.some(j => j.status === 'completed' && j.trackId === selectedTrackId)) {
            fetchTrackDetail(selectedTrackId);
          }
        }
      } catch (e) {
        // ignore
      }
    };
    pollJobs();
    const interval = setInterval(pollJobs, 3000);
    return () => clearInterval(interval);
  }, [selectedTrackId]);

  // Handle Track Selection
  const handleTrackSelect = (id: string) => {
    if (id === selectedTrackId) return;
    setSelectedTrackId(id);
    setWaveformReady(false);
    setSelectedStems([]);
    setRegionStart(0);
    setRegionEnd(0);
    fetchTrackDetail(id);
  };

  const fetchTrackDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getTrackDetail(id);
      setTrackDetail(detail);
    } catch (e) {
      console.error('Failed to load track detail', e);
      setTrackDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFileUpload = async (file: File, options: ProcessingOptions) => {
    try {
      const data = await api.uploadTrack(file, options);
      addJobToQueue(data.job_id, data.track_id);
    } catch (e) {
      alert('Upload Failed!');
      console.error(e);
    }
  };

  const handleUrlSubmit = async (url: string, options: ProcessingOptions) => {
    try {
      const data = await api.ingestSource({ source: url, options });
      addJobToQueue(data.job_id, data.track_id);
    } catch (e) {
      alert('Ingest Failed!');
      console.error(e);
    }
  };

  const addJobToQueue = (jobId: string, trackId: string) => {
    setActiveJobs(prev => ({
      ...prev,
      [jobId]: { jobId, trackId, status: 'queued', stages: [] }
    }));
    // Try to auto-select it if possible, allowing immediate feedback
    handleTrackSelect(trackId);
  };

  const handleDeleteTrack = async (id: string) => {
    try {
      await api.deleteTrack(id);
      if (selectedTrackId === id) {
        setSelectedTrackId(null);
        setWaveformReady(false);
        setTrackDetail(null);
      }
      loadTracks();
    } catch (e) {
      console.error('Failed to delete track', e);
    }
  };

  const toggleStemSelection = (stem: string) => {
    setSelectedStems(prev =>
      prev.includes(stem) ? prev.filter(s => s !== stem) : [...prev, stem]
    );
  };

  const navigateToLoop = (loop: LoopPreview) => {
    alert(`Export complete! Loop ID: ${loop.id}`);
  };

  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-gray-300 flex flex-col overflow-hidden font-sans">
      {/* HEADER */}
      <header className="h-[60px] bg-[#12121a] border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 relative z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#8b5cf6] p-0.5 shadow-[0_0_15px_rgba(0,212,255,0.4)]">
            <div className="w-full h-full bg-[#12121a] rounded-md flex items-center justify-center text-white text-lg">
              🎧
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">
              Music <span className="text-[#00d4ff]">Matters</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-widest border transition-colors ${isConnected
            ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
            : 'bg-[#ff3b5c]/10 text-[#ff3b5c] border-[#ff3b5c]/30'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#00ff88] animate-pulse' : 'bg-[#ff3b5c]'}`} />
            {isConnected ? 'Backend Online' : 'Backend Offline'}
          </div>
        </div>
      </header>

      {/* 3-ZONE LAYOUT */}
      <main className="flex-1 overflow-hidden flex text-sm">

        {/* LEFT SIDEBAR (280px) */}
        <aside className="w-[280px] bg-[#0a0a0f] border-r border-white/5 flex flex-col p-4 gap-4 overflow-y-auto hide-scrollbar z-10 shrink-0">
          <SearchIngest
            onFileUpload={handleFileUpload}
            onUrlSubmit={handleUrlSubmit}
          />
          <QueuePanel jobs={activeJobs} />
          <LibraryBrowser
            tracks={tracks}
            onTrackSelect={handleTrackSelect}
            onTrackDelete={handleDeleteTrack}
            selectedTrackId={selectedTrackId}
            loading={tracks.length === 0}
          />
        </aside>

        {/* CENTRE WORKSPACE (flex-grow) */}
        <section className="flex-1 p-6 overflow-y-auto hide-scrollbar relative z-0 min-w-[500px]">
          <CentreWorkspace
            trackId={selectedTrackId}
            trackDetail={trackDetail}
            regionStart={regionStart}
            regionEnd={regionEnd}
            onUpdateRegion={(s, e) => { setRegionStart(s); setRegionEnd(e); }}
            wavesurferRef={wavesurferRef}
            regionsRef={regionsRef}
            waveformReady={waveformReady}
            setWaveformReady={setWaveformReady}
          />
        </section>

        {/* RIGHT SIDEBAR (320px) */}
        <aside className="w-[320px] bg-[#0a0a0f] border-l border-white/5 flex flex-col p-4 gap-4 overflow-y-auto hide-scrollbar z-10 shrink-0">
          <AnalysisPanel loading={detailLoading} trackDetail={trackDetail} />

          <StemLanes
            trackId={selectedTrackId || ''}
            availableStems={trackDetail?.stems || []}
            selectedStems={selectedStems}
            onToggleStemSelection={toggleStemSelection}
            loading={detailLoading}
          />

          <ExportPanel
            trackId={selectedTrackId || ''}
            selectedStems={selectedStems}
            regionStart={regionStart}
            regionEnd={regionEnd}
            onExportComplete={navigateToLoop}
            disabled={!selectedTrackId || !waveformReady || detailLoading}
          />
        </aside>

      </main>
    </div>
  );
}

export default App;
