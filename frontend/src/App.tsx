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
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0f1c] p-8 gap-4">
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
import { ExportDialog } from './components/ExportDialog';
import { ProcessingView } from './components/ProcessingView';
import { ShortcutLegend } from './components/ShortcutLegend';
import { RecognizeButton } from './components/RecognizeButton';
import { IsolationWorkspace } from './components/isolation/IsolationWorkspace';
import { ResourceChecker } from './components/ResourceChecker';
import { ShazamImport } from './components/ShazamImport';
import { StartupCheck } from './components/StartupCheck';
import { LibraryView } from './components/LibraryView';
import { DiscoveryHub } from './components/DiscoveryHub';
import {
  Library as LibraryIcon, Search as SearchIcon, ListMusic,
  AudioWaveform, Microscope, Download as DownloadIcon, Bell, Power, Radio,
} from 'lucide-react';
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
type AppView = 'library' | 'upload' | 'processing' | 'workspace' | 'isolation';

function App() {
  // ── Core state ───────────────────────────────────────────────────────────
  const [view, setView] = useState<AppView>('library');
  const [isConnected, setIsConnected] = useState(false);
  const [appMode, setAppMode] = useState(false);
  const [focusLibrarySearch, setFocusLibrarySearch] = useState(false);

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

  // Startup resource check — clears once user has passed it
  const [startupDone, setStartupDone] = useState(false);

  // Modal state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [shortcutLegendOpen, setShortcutLegendOpen] = useState(false);
  const [resourceCheckerOpen, setResourceCheckerOpen] = useState(false);
  const [shazamImportOpen, setShazamImportOpen] = useState(false);

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
        setAppMode(!!data.app_mode);
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
      loopSlicing: true,
      mastering: true,
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

  // ── Back to Library dashboard (resets track state) ─────────────────────
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
    setView('library');
  }, []);

  // ── Library row actions ─────────────────────────────────────────────────
  const openTrack = useCallback((trackId: string, target: 'workspace' | 'isolation' = 'workspace', openExport = false) => {
    setSelectedTrackId(trackId);
    setDetailLoading(true);
    api.getTrackDetail(trackId).then(detail => {
      setTrackDetail(detail);
      setDetailLoading(false);
      setView(target);
      if (openExport) setExportDialogOpen(true);
    }).catch(() => setDetailLoading(false));
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
    ingest:     { label: 'Ingesting',        color: '#7F77DD', icon: '📥' },
    analysis:   { label: 'Analysing',        color: '#7F77DD', icon: '🔬' },
    separation: { label: 'Separating Stems', color: '#1D9E75', icon: '🎛️' },
    loop:       { label: 'Slicing Loops',    color: '#EF9F27', icon: '🔁' },
    project:    { label: 'Finalising',       color: '#7F77DD', icon: '📦' },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-full bg-mm-bg text-mm-body flex flex-col overflow-hidden font-sans">

      {/* ── Startup resource check — blocks UI until system is ready ─── */}
      {!startupDone && <StartupCheck onClear={() => setStartupDone(true)} />}

      {/* ─── Hidden file input ──────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac"
        onChange={handleFileChange}
        className="hidden"
        id="mvp-file-upload"
      />

      {/* ─── HEADER — 44px ──────────────────────────────────────────────── */}
      <header className="h-[44px] bg-mm-surface border-b border-mm-border flex items-center justify-between px-4 flex-shrink-0 relative z-20">
        {/* Left: logo dot + app name */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleNewTrack}>
          <div className="w-6 h-6 rounded-md bg-mm-purple flex items-center justify-center text-[11px] font-black text-white">
            M
          </div>
          <h1 className="text-[13px] font-bold text-mm-text tracking-wide">
            Music Matters
          </h1>
        </div>

        {/* Center: breadcrumb */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] text-mm-muted">
          <span
            className="hover:text-mm-body cursor-pointer transition-colors"
            onClick={handleNewTrack}
          >
            Library
          </span>
          {view !== 'library' && (
            <>
              <span className="text-mm-border">/</span>
              <span className="text-mm-body capitalize">
                {view === 'workspace'
                  ? (trackDetail?.title ?? 'Track')
                  : view === 'isolation'
                    ? 'Isolation Workspace'
                    : view === 'upload' ? 'Street Capture & Multi-Angle Discovery' : 'Processing'}
              </span>
            </>
          )}
        </div>

        {/* Right: Street Capture / Multi-Angle Discovery button, connection dot, shortcuts, bell, avatar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('upload')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border ${
              view === 'upload'
                ? 'bg-[#7F77DD] border-[#7F77DD] text-white'
                : 'bg-[#7F77DD]/15 border-[#7F77DD]/35 text-[#7F77DD] hover:bg-[#7F77DD]/25'
            }`}
            title="Street Capture, Shazam, Natural Language + Producer/Remixer/Date Range Search"
          >
            <Radio size={12} />
            Street Capture & Search
          </button>
          <div
            title={isConnected ? 'Backend online' : 'Backend offline'}
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-mm-teal' : 'bg-[#ff3b5c] animate-status-pulse'}`}
          />
          <button
            onClick={() => setShortcutLegendOpen(v => !v)}
            title="Keyboard shortcuts (?)"
            className="w-7 h-7 flex items-center justify-center rounded-md
                       text-mm-muted hover:text-mm-text hover:bg-mm-active
                       font-bold text-[11px] font-mono transition-colors"
          >
            ?
          </button>
          <button
            title="Notifications"
            className="w-7 h-7 flex items-center justify-center rounded-md
                       text-mm-muted hover:text-mm-text hover:bg-mm-active transition-colors"
          >
            <Bell size={14} />
          </button>
          {appMode && (
            <button
              title="Quit Music Matters"
              onClick={async () => {
                try { await api.shutdownApp(); } catch { /* server is going away */ }
              }}
              className="w-7 h-7 flex items-center justify-center rounded-md
                         text-mm-muted hover:text-[#ff3b5c] hover:bg-[#ff3b5c]/10 transition-colors"
            >
              <Power size={14} />
            </button>
          )}
          <div
            title="k3ss"
            className="w-6 h-6 rounded-full bg-mm-active border border-mm-border
                       flex items-center justify-center text-[9px] font-bold text-mm-purple"
          >
            K
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex text-sm">

        {/* ─── ICON SIDEBAR — persistent, 52px ──────────────────────────── */}
        <nav className="w-[52px] bg-mm-surface border-r border-mm-border flex flex-col items-center py-2 gap-1 flex-shrink-0">
          {([
            { key: 'library', label: 'Library', icon: <LibraryIcon size={15} />, onClick: () => { setFocusLibrarySearch(false); setView('library'); }, active: view === 'library' || view === 'processing', disabled: false },
            { key: 'search', label: 'Discover', icon: <SearchIcon size={15} />, onClick: () => setView('upload'), active: view === 'upload', disabled: false },
            { key: 'tracks', label: 'Studio', icon: <ListMusic size={15} />, onClick: () => setView('workspace'), active: view === 'workspace', disabled: !selectedTrackId },
            { key: 'stems', label: 'Stems', icon: <AudioWaveform size={15} />, onClick: () => setView('workspace'), active: false, disabled: !selectedTrackId },
            { key: 'isolation', label: 'Isolation', icon: <Microscope size={15} />, onClick: () => setView('isolation'), active: view === 'isolation', disabled: false },
            { key: 'export', label: 'Export', icon: <DownloadIcon size={15} />, onClick: () => { setView('workspace'); setExportDialogOpen(true); }, active: false, disabled: !selectedTrackId },
          ] as const).map(item => (
            <button
              key={item.key}
              onClick={item.onClick}
              disabled={item.disabled}
              title={item.disabled ? `${item.label} — select a track first` : item.label}
              className={`w-11 h-11 flex flex-col items-center justify-center rounded-lg gap-0.5 transition-colors
                ${item.active
                  ? 'bg-mm-active text-mm-purple'
                  : item.disabled
                    ? 'text-mm-muted/40 cursor-not-allowed'
                    : 'text-mm-muted hover:text-mm-body hover:bg-mm-active/60'}`}
            >
              {item.icon}
              <span className="text-[7px] font-semibold tracking-wide">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: LIBRARY (default dashboard) ──────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'library' && (
          <ErrorBoundary key="library">
            <LibraryView
              selectedTrackId={selectedTrackId}
              autoFocusSearch={focusLibrarySearch}
              onOpenTrack={(id) => openTrack(id, 'workspace')}
              onOpenIsolation={(id) => openTrack(id, 'isolation')}
              onExportTrack={(id) => openTrack(id, 'workspace', true)}
              onImport={() => setView('upload')}
            />
          </ErrorBoundary>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: UPLOAD / MULTI-ANGLE STREET CAPTURE & DISCOVERY HUB ──── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'upload' && (
          <ErrorBoundary key="discovery-hub">
            <div className="flex-1 overflow-y-auto p-5 bg-[#0a0b14]">
              <DiscoveryHub
                tracks={recentTracks}
                onLoadTrackIntoEditor={(id) => openTrack(id, 'workspace')}
                onJobStarted={(jobId, trackId) => {
                  setSelectedTrackId(trackId);
                  setActiveJob({
                    jobId,
                    trackId,
                    status: 'queued',
                    stages: [],
                  });
                  setView('processing');
                  subscribeToActiveJob(jobId, trackId);
                }}
                onClose={() => setView('library')}
              />
            </div>
          </ErrorBoundary>
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
              <ErrorBoundary key={`ws-${selectedTrackId ?? 'none'}`}>
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
            <aside className="w-[320px] bg-[#0d0f1c] border-l border-white/5 flex flex-col p-4 gap-4 overflow-y-auto hide-scrollbar z-10 shrink-0">
              <AnalysisPanel
                loading={detailLoading}
                trackDetail={trackDetail}
                onRequestSeparation={selectedTrackId ? handleRequestSeparation : undefined}
              />

              {/* Export button — opens the full Export dialog */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setExportDialogOpen(true)}
                  disabled={!selectedTrackId || !waveformReady || detailLoading || regionEnd <= regionStart}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                             bg-[#7F77DD]/10 border border-[#7F77DD]/30 text-[#7F77DD]
                             hover:bg-[#7F77DD]/20 hover:border-[#7F77DD]/60
                             disabled:opacity-30 disabled:cursor-not-allowed
                             transition-all font-semibold text-sm"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Save / Export…
                </button>
                {regionEnd > regionStart && (
                  <div className="text-center text-[10px] font-mono text-white/25">
                    {(regionEnd - regionStart).toFixed(2)} s selected
                  </div>
                )}
                {(!waveformReady || regionEnd <= regionStart) && selectedTrackId && !detailLoading && (
                  <div className="text-center text-[10px] text-white/20">
                    Set a loop region first
                  </div>
                )}
              </div>

              {/* My Shazams import */}
              <button
                onClick={() => setShazamImportOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl
                           bg-white/[0.03] border border-white/10 text-white/50
                           hover:bg-white/[0.06] hover:text-white/80 hover:border-white/20
                           transition-all text-sm"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
                My Shazams
              </button>

              {/* Resource checker */}
              <button
                onClick={() => setResourceCheckerOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl
                           bg-white/[0.03] border border-white/10 text-white/50
                           hover:bg-white/[0.06] hover:text-white/80 hover:border-white/20
                           transition-all text-sm"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
                RAM Check
              </button>
            </aside>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: ISOLATION WORKSPACE ────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'isolation' && (
          <ErrorBoundary key={`iso-${selectedTrackId ?? 'none'}`}>
            <IsolationWorkspace
              sourceTrackId={selectedTrackId}
              sourceBpm={trackDetail?.bpm ?? undefined}
              sourceKey={trackDetail?.musical_key ?? undefined}
              sourceTitle={trackDetail?.title ?? undefined}
              regionStart={regionStart}
              regionEnd={regionEnd}
            />
          </ErrorBoundary>
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

      {/* ── Resource Checker ─────────────────────────────────────────── */}
      {resourceCheckerOpen && (
        <ResourceChecker onClose={() => setResourceCheckerOpen(false)} />
      )}

      {/* ── Shazam Import ────────────────────────────────────────────── */}
      {shazamImportOpen && (
        <ShazamImport
          onClose={() => setShazamImportOpen(false)}
          onIngest={(query) => {
            setShazamImportOpen(false);
            api.enqueueIngest({ source: query, tags: ['shazam'], collection: 'shazam' })
              .then(job => {
                setSelectedTrackId(job.track_id);
                setActiveJob({
                  jobId: job.job_id,
                  trackId: job.track_id,
                  status: 'queued',
                  stages: [],
                  currentStage: 'ingest',
                });
                setView('processing');
                subscribeToActiveJob(job.job_id, job.track_id);
              })
              .catch(err => console.error('Shazam ingest failed:', err));
          }}
        />
      )}
    </div>
  );
}

export default App;
