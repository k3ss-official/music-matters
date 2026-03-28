import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import './index.css';

// ── Error boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { error: err };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0f] p-8 gap-4">
          <div className="text-[#ff3b5c] font-mono text-sm font-bold uppercase tracking-widest">
            Render Error
          </div>
          <pre className="text-[#ff3b5c]/70 text-xs font-mono bg-[#ff3b5c]/5 border border-[#ff3b5c]/20 rounded p-4 max-w-full overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-[#ff3b5c]/20 text-[#ff3b5c] border border-[#ff3b5c]/30 rounded text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import type { TrackDetailResponse, JobProgress, ProcessingOptions, LoopPreview } from './types';
import * as api from './services/api';
import { subscribeToJob } from './services/sse';

import { CentreWorkspace } from './components/CentreWorkspace';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ExportPanel } from './components/ExportPanel';
import { ExportDialog } from './components/ExportDialog';
import { ProcessingView } from './components/ProcessingView';
import { ShortcutLegend } from './components/ShortcutLegend';
import type WaveSurfer from 'wavesurfer.js';

// Icons (inline SVGs for zero-dep)
const UploadIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SpinnerIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── App state machine ──────────────────────────────────────────────────────
type AppView = 'upload' | 'processing' | 'workspace';

function App() {
  // ── Core state ───────────────────────────────────────────────────────────
  const [view, setView] = useState<AppView>('upload');
  const [isConnected, setIsConnected] = useState(false);

  // Track state
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackDetail, setTrackDetail] = useState<TrackDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Job state
  const [activeJob, setActiveJob] = useState<JobProgress | null>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);

  // Waveform & Loop State
  const [waveformReady, setWaveformReady] = useState(false);
  const [regionStart, setRegionStart] = useState<number>(0);
  const [regionEnd, setRegionEnd] = useState<number>(0);
  const [selectedStems, setSelectedStems] = useState<string[]>([]);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Modal state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [shortcutLegendOpen, setShortcutLegendOpen] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Health check ─────────────────────────────────────────────────────────
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

  // ── Recent tracks for upload page ─────────────────────────────────────────
  const [recentTracks, setRecentTracks] = useState<any[]>([]);
  useEffect(() => {
    if (view === 'upload' && isConnected) {
      api.listTracks(6, 0).then(data => setRecentTracks(data.items)).catch(() => {});
    }
  }, [view, isConnected]);

  // ── Deep-link: ?track=<id> in URL loads directly into workspace ─────────
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !isConnected) return;
    const params = new URLSearchParams(window.location.search);
    const trackParam = params.get('track');
    if (trackParam) {
      deepLinkHandled.current = true;
      setSelectedTrackId(trackParam);
      setDetailLoading(true);
      api.getTrackDetail(trackParam).then(detail => {
        setTrackDetail(detail);
        setDetailLoading(false);
        setView('workspace');
      }).catch(() => { setDetailLoading(false); });
    }
  }, [isConnected]);

  // ── Track detail fetcher ─────────────────────────────────────────────────
  const fetchTrackDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getTrackDetail(id);
      setTrackDetail(detail);
      return detail;
    } catch (e) {
      console.error('Failed to load track detail', e);
      setTrackDetail(null);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── SSE subscription for active job ──────────────────────────────────────
  const subscribeToActiveJob = useCallback((jobId: string, trackId: string) => {
    // Clean up previous subscription
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }

    const cleanup = subscribeToJob(jobId, {
      onUpdate: (job) => {
        setActiveJob(job);
      },
      onDone: (job) => {
        setActiveJob(job);
        if (job.status === 'completed') {
          // Pipeline done — fetch final track detail and switch to workspace
          fetchTrackDetail(trackId).then(() => {
            setView('workspace');
          });
        }
        // If failed, stay on processing view to show error
      },
      onError: (_event) => {
        // SSE disconnected — fall back to polling
        console.warn('SSE disconnected, falling back to polling');
        startPolling(jobId, trackId);
      },
    });

    sseCleanupRef.current = cleanup;
  }, [fetchTrackDetail]);

  // ── Polling fallback ────────────────────────────────────────────────────
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback((jobId: string, trackId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const jobs = await api.listActiveJobs();
        const job = jobs.find(j => j.jobId === jobId);
        if (job) {
          setActiveJob(job);
          if (job.status === 'completed' || job.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (job.status === 'completed') {
              await fetchTrackDetail(trackId);
              setView('workspace');
            }
          }
        } else {
          // Job not in active list — it already completed or failed.
          // Check track status directly to recover.
          const detail = await api.getTrackDetail(trackId);
          if (detail && detail.status === 'project_ready') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setTrackDetail(detail);
            setView('workspace');
          } else if (detail && detail.status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setActiveJob(prev => prev ? { ...prev, status: 'failed', detail: 'Pipeline failed' } : prev);
          }
        }
      } catch (e) {
        console.error('Polling error', e);
      }
    }, 2000);
  }, [fetchTrackDetail]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sseCleanupRef.current) sseCleanupRef.current();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ── File upload handler ──────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    if (!isConnected) return;
    setUploading(true);

    const options: ProcessingOptions = {
      analysis: true,
      separation: true,
      loopSlicing: false,
      mastering: false,
    };

    try {
      const data = await api.uploadTrack(file, options);
      const jobId = data.job_id;
      const trackId = data.track_id;

      setSelectedTrackId(trackId);
      setActiveJob({
        jobId,
        trackId,
        status: 'queued',
        stages: [],
      });
      setView('processing');

      // Subscribe to real-time updates
      subscribeToActiveJob(jobId, trackId);
    } catch (e) {
      console.error('Upload failed', e);
      alert('Upload failed — check the console for details.');
    } finally {
      setUploading(false);
    }
  }, [isConnected, subscribeToActiveJob]);

  // ── Click handler for file picker ────────────────────────────────────────
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [handleFileUpload]);

  // ── Stem toggle ──────────────────────────────────────────────────────────
  const toggleStemSelection = (stem: string) => {
    setSelectedStems(prev =>
      prev.includes(stem) ? prev.filter(s => s !== stem) : [...prev, stem]
    );
  };

  // ── Separation request ──────────────────────────────────────────────────
  const handleRequestSeparation = async () => {
    if (!selectedTrackId) return;
    try {
      const data = await api.refreshTrack(selectedTrackId);
      setActiveJob({
        jobId: data.job_id,
        trackId: selectedTrackId,
        status: 'queued',
        stages: [],
      });
      setView('processing');
      subscribeToActiveJob(data.job_id, selectedTrackId);
    } catch (e) {
      console.error('Failed to start separation', e);
    }
  };

  // ── New track (back to upload) ──────────────────────────────────────────
  const handleNewTrack = useCallback(() => {
    if (sseCleanupRef.current) sseCleanupRef.current();
    if (pollingRef.current) clearInterval(pollingRef.current);
    setSelectedTrackId(null);
    setTrackDetail(null);
    setActiveJob(null);
    setWaveformReady(false);
    setSelectedStems([]);
    setRegionStart(0);
    setRegionEnd(0);
    setView('upload');
  }, []);

  // ── Global `?` key → shortcut legend ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShortcutLegendOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Stage progress helper ─────────────────────────────────────────────
  const STAGE_META: Record<string, { label: string; color: string; icon: string }> = {
    ingest:     { label: 'Ingesting',        color: '#00d4ff', icon: '📥' },
    analysis:   { label: 'Analysing',        color: '#8b5cf6', icon: '🔬' },
    separation: { label: 'Separating Stems', color: '#00ff88', icon: '🎛️' },
    loop:       { label: 'Slicing Loops',    color: '#f59e0b', icon: '🔁' },
    project:    { label: 'Finalising',       color: '#00d4ff', icon: '📦' },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-gray-300 flex flex-col overflow-hidden font-sans">
      {/* ─── Hidden file input ──────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac"
        onChange={handleFileChange}
        className="hidden"
        id="mvp-file-upload"
      />

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <header className="h-[60px] bg-[#12121a] border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 relative z-20 shadow-md">
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleNewTrack}>
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

        <div className="flex items-center gap-3">
          {/* New Track button (visible when not on upload view) */}
          {view !== 'upload' && (
            <button
              onClick={handleNewTrack}
              className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest font-mono
                         bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30
                         hover:bg-[#00d4ff]/25 transition-colors"
            >
              + New Track
            </button>
          )}

          {/* Connection status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-widest border transition-colors ${isConnected
            ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
            : 'bg-[#ff3b5c]/10 text-[#ff3b5c] border-[#ff3b5c]/30'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#00ff88] animate-pulse' : 'bg-[#ff3b5c]'}`} />
            {isConnected ? 'Online' : 'Offline'}
          </div>

          {/* Shortcut legend button */}
          <button
            onClick={() => setShortcutLegendOpen(v => !v)}
            title="Keyboard shortcuts (?)"
            className="w-7 h-7 flex items-center justify-center rounded-full
                       bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20
                       text-white/40 hover:text-white/80 font-bold text-[12px] font-mono
                       transition-colors"
          >
            ?
          </button>
        </div>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex text-sm">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: UPLOAD ─────────────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'upload' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-8 max-w-md">
              {/* Hero */}
              <div className="text-center space-y-3">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-[#00d4ff]/20 to-[#8b5cf6]/20 border border-white/10 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(0,212,255,0.15)]">
                  🎧
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Load a Track
                </h2>
                <p className="text-white/40 text-sm max-w-sm">
                  Upload an audio file to analyse, separate stems, and export.
                </p>
              </div>

              {/* Upload drop zone */}
              <div
                onClick={openFilePicker}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && !uploading && isConnected) {
                    handleFileUpload(file);
                  }
                }}
                className={`group relative flex flex-col items-center gap-4 w-full py-10 px-8
                           rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
                           ${dragActive
                             ? 'border-[#00d4ff] bg-[#00d4ff]/10 shadow-[0_0_30px_rgba(0,212,255,0.2)]'
                             : 'border-white/10 hover:border-[#00d4ff]/50 hover:bg-[#00d4ff]/5'}
                           ${(!isConnected || uploading) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className={`transition-colors ${dragActive ? 'text-[#00d4ff]' : 'text-white/30 group-hover:text-[#00d4ff]'}`}>
                  {uploading ? <SpinnerIcon size={48} /> : <UploadIcon />}
                </div>
                <div className="text-center">
                  <div className={`text-sm font-semibold transition-colors ${dragActive ? 'text-[#00d4ff]' : 'text-white/70 group-hover:text-white'}`}>
                    {uploading ? 'Uploading...' : dragActive ? 'Drop it!' : 'Click or drag audio here'}
                  </div>
                  <div className="text-xs text-white/25 mt-1">
                    MP3, WAV, FLAC, M4A, OGG, AAC
                  </div>
                </div>

                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00d4ff]/0 to-[#8b5cf6]/0 group-hover:from-[#00d4ff]/5 group-hover:to-[#8b5cf6]/5 transition-all duration-500 pointer-events-none" />
              </div>

              {/* Backend offline warning */}
              {!isConnected && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff3b5c]/10 border border-[#ff3b5c]/20 text-[#ff3b5c] text-xs font-mono">
                  <AlertIcon />
                  Backend offline — start the server first
                </div>
              )}

              {/* Recent tracks */}
              {recentTracks.length > 0 && (
                <div className="w-full max-w-lg mt-4">
                  <div className="text-[10px] font-mono tracking-[0.2em] text-white/25 text-center mb-3">RECENT TRACKS</div>
                  <div className="grid grid-cols-2 gap-2">
                    {recentTracks.map((t: any) => (
                      <button
                        key={t.track_id}
                        onClick={() => {
                          setSelectedTrackId(t.track_id);
                          setDetailLoading(true);
                          api.getTrackDetail(t.track_id).then(detail => {
                            setTrackDetail(detail);
                            setDetailLoading(false);
                            setView('workspace');
                          }).catch(() => setDetailLoading(false));
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-[#00d4ff]/30 transition-all text-left"
                      >
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-[#8b5cf6]/30 to-[#00d4ff]/30 flex items-center justify-center text-[#00d4ff]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate capitalize">{t.title}</div>
                          <div className="text-[10px] text-white/30 font-mono">{Math.round(t.bpm)} BPM  {t.musical_key}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: PROCESSING ─────────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'processing' && activeJob && (
          <ProcessingView
            activeJob={activeJob}
            stageMeta={STAGE_META}
            onNewTrack={handleNewTrack}
            onRetry={() => selectedTrackId && handleRequestSeparation()}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: WORKSPACE ──────────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'workspace' && selectedTrackId && (
          <>
            {/* CENTRE — Waveform + transport + loop editor */}
            <section className="flex-1 flex flex-col overflow-hidden relative z-0 min-w-[500px]">
              <ErrorBoundary>
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
                  detailLoading={detailLoading}
                  activeJob={activeJob}
                  onPlayStateChange={setIsPlaying}
                  onTimeUpdate={setCurrentTime}
                  onOpenExportDialog={() => setExportDialogOpen(true)}
                  onSelectedStemsChange={setSelectedStems}
                />
              </ErrorBoundary>
            </section>

            {/* RIGHT SIDEBAR — Analysis + Stems + Export */}
            <aside className="w-[320px] bg-[#0a0a0f] border-l border-white/5 flex flex-col p-4 gap-4 overflow-y-auto hide-scrollbar z-10 shrink-0">
              <AnalysisPanel
                loading={detailLoading}
                trackDetail={trackDetail}
                onRequestSeparation={selectedTrackId ? handleRequestSeparation : undefined}
              />

              <ExportPanel
                trackId={selectedTrackId || ''}
                availableStems={trackDetail?.stems || []}
                selectedStems={selectedStems}
                regionStart={regionStart}
                regionEnd={regionEnd}
                onExportComplete={() => {}}
                onOpenDialog={() => setExportDialogOpen(true)}
                disabled={!selectedTrackId || !waveformReady || detailLoading}
              />
            </aside>
          </>
        )}

      </main>

      {/* ── Export Dialog ─────────────────────────────────────────────── */}
      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        trackId={selectedTrackId || ''}
        trackTitle={trackDetail?.title}
        availableStems={trackDetail?.stems || []}
        initialSelectedStems={selectedStems}
        regionStart={regionStart}
        regionEnd={regionEnd}
      />

      {/* ── Shortcut Legend ───────────────────────────────────────────── */}
      <ShortcutLegend
        isOpen={shortcutLegendOpen}
        onClose={() => setShortcutLegendOpen(false)}
      />
    </div>
  );
}

export default App;
