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

import type { TrackDetailResponse, JobProgress, ProcessingOptions } from './types';
import * as api from './services/api';
import type { SystemConfigResponse } from './services/api';
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
import { UnifiedTrackBar } from './components/UnifiedTrackBar';
import {
  Library as LibraryIcon, Search as SearchIcon, ListMusic,
  AudioWaveform, Microscope, Download as DownloadIcon, Bell, Power,
  FolderOpen, RefreshCw, CheckCircle2, AlertTriangle, X, RotateCcw,
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
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [appMode, setAppMode] = useState(false);
  const [focusLibrarySearch, setFocusLibrarySearch] = useState(false);

  // System & Music Folder Config State (Issues #1 & #5)
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [sysConfig, setSysConfig] = useState<SystemConfigResponse | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderMsg, setFolderMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
  const [, setIsPlaying] = useState(false);
  const [, setCurrentTime] = useState(0);

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
  const [uploadQuery, setUploadQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Health & System Config Check ─────────────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const data = await api.checkHealth();
      setIsConnected(data.status === 'ok');
      setAppMode(!!data.app_mode);
      if (data.status === 'ok') {
        api.getSystemConfig().then((cfg) => {
          setSysConfig(cfg);
          setFolderInput((prev) => prev || cfg.music_library);
        }).catch(() => {});
      }
    } catch {
      setIsConnected(false);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
    const interval = setInterval(runHealthCheck, 5000);
    return () => clearInterval(interval);
  }, [runHealthCheck]);

  // ── Save / Reset Default Music Folder (Issue #5) ─────────────────────────
  const handleSaveMusicFolder = useCallback(async (resetToDefault = false) => {
    setFolderSaving(true);
    setFolderMsg(null);
    try {
      const updated = await api.updateLibraryPath(
        resetToDefault ? undefined : folderInput.trim(),
        resetToDefault,
      );
      setSysConfig(updated);
      setFolderInput(updated.music_library);
      setFolderMsg({
        type: 'ok',
        text: resetToDefault
          ? `Reset to default folder: ${updated.music_library}`
          : `Default music folder updated to: ${updated.music_library}`,
      });
    } catch (err: any) {
      setFolderMsg({
        type: 'err',
        text: err?.detail || err?.message || 'Failed to update music folder path',
      });
    } finally {
      setFolderSaving(false);
    }
  }, [folderInput]);

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

  // ── SSE subscription for active job ──────────────────────────────────────
  const subscribeToActiveJob = useCallback((jobId: string, trackId: string) => {
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
          fetchTrackDetail(trackId).then(() => {
            setView('workspace');
          });
        }
      },
      onError: (_event) => {
        console.warn('SSE disconnected, falling back to polling');
        startPolling(jobId, trackId);
      },
    });

    sseCleanupRef.current = cleanup;
  }, [fetchTrackDetail, startPolling]);

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
        currentStage: 'ingest',
        detail: `Uploading ${file.name} into library…`,
        stages: [],
      });
      setView('processing');
      subscribeToActiveJob(jobId, trackId);
    } catch (e) {
      console.error('Upload failed', e);
      alert('Upload failed — check the console for details.');
    } finally {
      setUploading(false);
    }
  }, [isConnected, subscribeToActiveJob]);

  // ── Unified URL / Search / Lyrics Ingest handler ─────────────────────────
  const handleIngestSource = useCallback(async (
    source: string,
    label?: string,
    tags: string[] = ['unified-bar'],
  ) => {
    if (!isConnected || !source.trim()) return;
    try {
      const job = await api.enqueueIngest({
        source: source.trim(),
        tags,
        collection: 'search',
      });
      setSelectedTrackId(job.track_id);
      setActiveJob({
        jobId: job.job_id,
        trackId: job.track_id,
        status: 'queued',
        currentStage: 'ingest',
        detail: `Acquiring "${label || source.trim()}"…`,
        stages: [],
      });
      setView('processing');
      subscribeToActiveJob(job.job_id, job.track_id);
    } catch (err) {
      console.error('Ingest failed:', err);
      alert('Could not start track import — check the URL or search query.');
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
    e.target.value = '';
  }, [handleFileUpload]);

  // ── Separation request ──────────────────────────────────────────────────
  const handleRequestSeparation = async () => {
    if (!selectedTrackId) return;
    try {
      const data = await api.refreshTrack(selectedTrackId);
      setActiveJob({
        jobId: data.job_id,
        trackId: selectedTrackId,
        status: 'queued',
        currentStage: 'separation',
        detail: 'Starting 6-stem separation…',
        stages: [],
      });
      setView('processing');
      subscribeToActiveJob(data.job_id, selectedTrackId);
    } catch (e) {
      console.error('Failed to start separation', e);
    }
  };

  // ── Back to Library dashboard ───────────────────────────────────────────
  const handleNewTrack = useCallback(() => {
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
        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff,.aif"
        onChange={handleFileChange}
        className="hidden"
        id="mvp-file-upload"
      />

      {/* ─── HEADER — 44px ──────────────────────────────────────────────── */}
      <header className="h-[44px] bg-mm-surface border-b border-mm-border flex items-center justify-between px-4 flex-shrink-0 relative z-30">
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
                    : view === 'upload' ? 'Import & Discover' : 'Processing'}
              </span>
            </>
          )}
        </div>

        {/* Right: Interactive Engine Status Pill (fixes Issue #1), Music Folder button (fixes Issue #5), shortcuts, quit */}
        <div className="flex items-center gap-2 relative">
          {/* Music Folder Config Quick Button */}
          <button
            type="button"
            onClick={() => {
              setFolderMsg(null);
              if (sysConfig) setFolderInput(sysConfig.music_library);
              setFolderModalOpen(true);
            }}
            title={`Default Music Folder: ${sysConfig?.music_library ?? '~/music-matters'}`}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-mm-border
                       bg-mm-panel/60 hover:border-mm-purple/50 text-mm-muted hover:text-mm-text
                       text-[11px] font-mono transition-colors"
          >
            <FolderOpen size={12} className="text-mm-purple" />
            <span>Music Folder</span>
          </button>

          {/* Clickable Engine Status Pill — replaces unclickable blinking red dot (Issue #1) */}
          <button
            type="button"
            onClick={() => setStatusPopoverOpen(v => !v)}
            title="Click to view local API & engine status"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all cursor-pointer ${
              isConnected
                ? 'bg-mm-teal/10 border-mm-teal/30 text-mm-teal hover:bg-mm-teal/20'
                : checkingHealth
                  ? 'bg-mm-amber/10 border-mm-amber/30 text-mm-amber hover:bg-mm-amber/20'
                  : 'bg-mm-amber/15 border-mm-amber/40 text-mm-amber hover:bg-mm-amber/25'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-mm-teal' : 'bg-mm-amber'
              }`}
            />
            <span>
              {isConnected ? 'Engine Online' : checkingHealth ? 'Connecting…' : 'Local API Standby'}
            </span>
          </button>

          {/* Interactive Status & Diagnostics Popover */}
          {statusPopoverOpen && (
            <div className="absolute right-0 top-10 w-80 bg-mm-panel border border-mm-border rounded-xl shadow-2xl p-4 space-y-3 z-50 text-xs">
              <div className="flex items-center justify-between border-b border-mm-border pb-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  {isConnected ? (
                    <CheckCircle2 size={14} className="text-mm-teal" />
                  ) : (
                    <AlertTriangle size={14} className="text-mm-amber" />
                  )}
                  <span>{isConnected ? 'Local Audio Engine Connected' : 'Local Backend Unreachable'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusPopoverOpen(false)}
                  className="text-mm-muted hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="space-y-1.5 font-mono text-[11px] text-mm-body">
                <div className="flex justify-between">
                  <span className="text-mm-muted">API Endpoint:</span>
                  <span className="text-white">127.0.0.1:8010</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mm-muted">Status:</span>
                  <span className={isConnected ? 'text-mm-teal' : 'text-mm-amber'}>
                    {isConnected ? 'Ready (Loopback)' : 'Waiting for FastAPI server'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 pt-1">
                  <span className="text-mm-muted">Default Music Folder:</span>
                  <span className="text-mm-purple break-all">
                    {sysConfig?.music_library ?? '~/music-matters'}
                  </span>
                </div>
              </div>

              {!isConnected && (
                <div className="p-2.5 rounded-lg bg-mm-surface border border-mm-border text-[11px] text-mm-muted leading-relaxed">
                  The UI is waiting for the local Python backend on <code className="text-white">127.0.0.1:8010</code>.
                  Run <code className="text-mm-purple">./start.sh</code> or open <code className="text-mm-purple">Music Matters.app</code>.
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStatusPopoverOpen(false);
                    setFolderModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-mm-surface border border-mm-border text-mm-body hover:text-white text-[11px] font-semibold"
                >
                  <FolderOpen size={12} className="text-mm-purple" />
                  <span>Set Music Folder…</span>
                </button>
                <button
                  type="button"
                  onClick={runHealthCheck}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mm-purple text-white hover:brightness-110 text-[11px] font-bold"
                >
                  <RefreshCw size={11} className={checkingHealth ? 'animate-spin' : ''} />
                  <span>Re-check</span>
                </button>
              </div>
            </div>
          )}

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
            onClick={() => setResourceCheckerOpen(true)}
            title="System RAM & Resource Check"
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
            { key: 'search', label: 'Search', icon: <SearchIcon size={15} />, onClick: () => { setFocusLibrarySearch(true); setView('library'); }, active: false, disabled: false },
            { key: 'upload', label: 'Upload', icon: <DownloadIcon size={15} />, onClick: () => setView('upload'), active: view === 'upload', disabled: false },
            { key: 'tracks', label: 'Tracks', icon: <ListMusic size={15} />, onClick: () => setView('workspace'), active: view === 'workspace', disabled: !selectedTrackId },
            { key: 'stems', label: 'Stems', icon: <AudioWaveform size={15} />, onClick: () => setView('workspace'), active: false, disabled: !selectedTrackId },
            { key: 'isolation', label: 'Isolation', icon: <Microscope size={15} />, onClick: () => setView('isolation'), active: view === 'isolation', disabled: false },
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
        {/* VIEW: LIBRARY (default dashboard with UnifiedTrackBar) ────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'library' && (
          <ErrorBoundary key="library">
            <LibraryView
              selectedTrackId={selectedTrackId}
              autoFocusSearch={focusLibrarySearch}
              isConnected={isConnected}
              uploading={uploading}
              activeJob={activeJob}
              libraryPath={sysConfig?.music_library}
              onOpenTrack={(id) => openTrack(id, 'workspace')}
              onOpenIsolation={(id) => openTrack(id, 'isolation')}
              onExportTrack={(id) => openTrack(id, 'workspace', true)}
              onImport={() => setView('upload')}
              onUploadFile={handleFileUpload}
              onIngestSource={handleIngestSource}
              onOpenShazamCsv={() => setShazamImportOpen(true)}
              onOpenFolderSettings={() => setFolderModalOpen(true)}
              onOpenProcessing={() => activeJob && setView('processing')}
            />
          </ErrorBoundary>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW: UPLOAD / FULL IMPORT HUB ───────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {view === 'upload' && (
          <div className="flex-1 flex flex-col overflow-y-auto py-6 px-6">
            <div className="max-w-3xl w-full mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Import, Search & Identify Track
                  </h2>
                  <p className="text-mm-muted text-xs mt-0.5">
                    Search by title/artist, paste a YouTube/SoundCloud/Bandcamp URL, describe lyrics, upload an audio file, or identify with Shazam.
                  </p>
                </div>
                <button
                  onClick={() => setView('library')}
                  className="px-3 py-1.5 rounded-lg border border-mm-border text-xs font-semibold text-mm-body hover:text-white"
                >
                  ← Back to Library
                </button>
              </div>

              {/* Unified Track Input Bar with Radio Chooser */}
              <div className="-mx-5">
                <UnifiedTrackBar
                  isConnected={isConnected}
                  query={uploadQuery}
                  onQueryChange={setUploadQuery}
                  onUploadFile={handleFileUpload}
                  onIngestSource={handleIngestSource}
                  onOpenTrack={(id) => openTrack(id, 'workspace')}
                  onOpenShazamCsv={() => setShazamImportOpen(true)}
                  onOpenFolderSettings={() => setFolderModalOpen(true)}
                  libraryPath={sysConfig?.music_library}
                  uploading={uploading}
                  defaultMode="url"
                />
              </div>

              {/* Large Drag & Drop Audio File Upload Zone */}
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
                className={`group relative flex flex-col items-center gap-3 w-full py-8 px-8
                           rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
                           ${dragActive
                             ? 'border-[#7F77DD] bg-[#7F77DD]/10 shadow-[0_0_30px_rgba(127,119,221,0.2)]'
                             : 'border-white/10 hover:border-[#7F77DD]/50 hover:bg-[#7F77DD]/5'}
                           ${(!isConnected || uploading) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className={`transition-colors ${dragActive ? 'text-[#7F77DD]' : 'text-white/30 group-hover:text-[#7F77DD]'}`}>
                  {uploading ? <SpinnerIcon size={40} /> : <UploadIcon />}
                </div>
                <div className="text-center">
                  <div className={`text-sm font-semibold transition-colors ${dragActive ? 'text-[#7F77DD]' : 'text-white/80 group-hover:text-white'}`}>
                    {uploading ? 'Uploading audio file…' : dragActive ? 'Drop audio file to import!' : 'Click to choose an audio file or drag & drop here'}
                  </div>
                  <div className="text-xs text-white/35 mt-1">
                    Supports MP3, WAV, FLAC, M4A, AIFF, OGG, AAC (up to 200 MB)
                  </div>
                </div>
              </div>

              {/* Backend offline notice */}
              {!isConnected && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-mm-amber/10 border border-mm-amber/30 text-mm-amber text-xs font-mono">
                  <AlertIcon />
                  Local API server not detected on 127.0.0.1:8010 — start Music Matters backend to enable import.
                </div>
              )}

              {/* Shazam live audio recognition */}
              {isConnected && (
                <div className="flex flex-col items-center gap-2 w-full">
                  <RecognizeButton
                    onLibraryMatch={(trackId) => openTrack(trackId, 'workspace')}
                    onIngestMatch={(q, title) => handleIngestSource(q, title, ['shazam'])}
                  />
                </div>
              )}

              {/* Recent tracks */}
              {recentTracks.length > 0 && (
                <div className="w-full pt-2">
                  <div className="text-[10px] font-mono tracking-[0.2em] text-white/25 uppercase mb-2.5">
                    Recent Library Tracks
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {recentTracks.map((t: any) => (
                      <button
                        key={t.track_id}
                        onClick={() => openTrack(t.track_id, 'workspace')}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-[#7F77DD]/30 transition-all text-left"
                      >
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-[#7F77DD]/30 to-[#7F77DD]/30 flex items-center justify-center text-[#7F77DD]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate capitalize">{t.title}</div>
                          <div className="text-[10px] text-white/30 font-mono">
                            {t.bpm ? `${Math.round(t.bpm)} BPM` : '— BPM'}  {t.musical_key || ''}
                          </div>
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

      {/* ── Default Music Folder Modal (Issue #5) ─────────────────────── */}
      {folderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setFolderModalOpen(false); }}
        >
          <div className="bg-mm-panel border border-mm-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-mm-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-mm-purple/15 border border-mm-purple/30 flex items-center justify-center text-mm-purple">
                  <FolderOpen size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Default Music Folder</h2>
                  <p className="text-[11px] text-mm-muted">
                    Where Music Matters stores downloaded tracks, 6-stem WAVs, loops, and DAW projects
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="p-1.5 rounded-lg text-mm-muted hover:text-white hover:bg-white/5"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-mm-muted">
                Music Library Directory Path
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="~/music-matters"
                  className="flex-1 bg-mm-surface border border-mm-border rounded-lg px-3 py-2
                             text-xs font-mono text-white placeholder-mm-muted
                             focus:outline-none focus:border-mm-purple"
                />
                {folderInput && (
                  <button
                    type="button"
                    onClick={() => setFolderInput('')}
                    title="Clear path input"
                    className="px-2.5 py-2 rounded-lg bg-white/5 border border-mm-border text-mm-muted hover:text-white text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[10px] font-mono text-mm-muted">
                Default: <code className="text-mm-body">{sysConfig?.default_music_library ?? '~/music-matters'}</code>
              </p>
            </div>

            {sysConfig && (
              <div className="bg-mm-surface/70 border border-mm-border rounded-lg p-3 space-y-1 text-[11px] font-mono">
                <div className="text-[9px] uppercase tracking-widest text-mm-muted mb-1">
                  Active Subdirectories
                </div>
                <div className="text-mm-body truncate">├─ downloads: {sysConfig.downloads_dir}</div>
                <div className="text-mm-body truncate">├─ stems: {sysConfig.stems_dir}</div>
                <div className="text-mm-body truncate">├─ loops: {sysConfig.loops_dir}</div>
                <div className="text-mm-body truncate">└─ projects: {sysConfig.projects_dir}</div>
              </div>
            )}

            {folderMsg && (
              <div
                className={`p-3 rounded-lg border text-xs font-mono ${
                  folderMsg.type === 'ok'
                    ? 'bg-mm-teal/10 border-mm-teal/30 text-mm-teal'
                    : 'bg-[#ff3b5c]/10 border-[#ff3b5c]/30 text-[#ff3b5c]'
                }`}
              >
                {folderMsg.text}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={folderSaving}
                onClick={() => handleSaveMusicFolder(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                           bg-white/5 border border-mm-border text-mm-muted
                           hover:text-white text-xs font-semibold transition-colors"
              >
                <RotateCcw size={12} />
                <span>Reset to Default (~/music-matters)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-mm-muted hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={folderSaving || !folderInput.trim()}
                  onClick={() => handleSaveMusicFolder(false)}
                  className="px-4 py-2 rounded-lg bg-mm-purple text-white text-xs font-bold
                             hover:brightness-110 disabled:opacity-40 transition-all"
                >
                  {folderSaving ? 'Saving…' : 'Save Music Folder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          onIngest={(query, title) => {
            setShazamImportOpen(false);
            handleIngestSource(query, title, ['shazam']);
          }}
        />
      )}
    </div>
  );
}

export default App;
