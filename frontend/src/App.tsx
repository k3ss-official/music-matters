import { useCallback, useEffect, useState } from 'react';

import './App.css';
import { LoopControls } from './components/LoopControls';
import { ProgressTimeline } from './components/ProgressTimeline';
import { SearchPanel } from './components/SearchPanel';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import {
  fetchJob,
  ingestSource,
  listLoops,
  searchTracks,
  triggerLoopReslice,
  uploadFile,
} from './services/api';
import { useTheme } from './hooks/useTheme';
import type { JobProgress, LoopPreview, SearchResult, StageProgress, TrackQuery } from './types';

const JOB_POLL_INTERVAL = 2500;

function App() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [job, setJob] = useState<JobProgress | undefined>();
  const [jobId, setJobId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [loops, setLoops] = useState<LoopPreview[]>([]);
  const [loopLength, setLoopLength] = useState(4);
  const [loading, setLoading] = useState(false);
  const [loopLoading, setLoopLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const loadLoops = useCallback(async (trackId: string, length: number) => {
    setLoopLoading(true);
    try {
      let next = await listLoops(trackId, length);
      if (next.length === 0) {
        next = await triggerLoopReslice(trackId, length);
      }
      setLoops(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoopLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const progress = await fetchJob(jobId);
        if (cancelled) {
          return;
        }
        setJob(progress);
        if (progress.status === 'completed') {
          setJobId(null);
          setActiveTrackId(progress.trackId);
          await loadLoops(progress.trackId, loopLength);
          return;
        }
        timer = setTimeout(poll, JOB_POLL_INTERVAL);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId, loadLoops, loopLength]);

  const handleQuerySubmit = async (query: TrackQuery) => {
    const trimmed = query.query.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const results = await searchTracks({ ...query, query: trimmed });
      setSearchResults(results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const { jobId: queuedJobId, trackId } = await ingestSource({ source: trimmed });
      setJob(undefined);
      setLoops([]);
      setActiveTrackId(trackId);
      setJobId(queuedJobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTracklistImport = async (raw: string) => {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    const firstUrl = lines.find((line) => line.startsWith('http'));
    if (firstUrl) {
      await handleUrlSubmit(firstUrl);
      return;
    }

    await handleQuerySubmit({ query: lines.join(' ') });
  };

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(undefined);
    try {
      const { jobId: queuedJobId, trackId } = await uploadFile(file);
      setJob(undefined);
      setLoops([]);
      setActiveTrackId(trackId);
      setJobId(queuedJobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResultSelect = async (result: SearchResult) => {
    setActiveTrackId(result.trackId);
    setJob(undefined);
    setJobId(null);
    await loadLoops(result.trackId, loopLength);
  };

  const handleLoopLengthChange = async (length: number) => {
    setLoopLength(length);
    if (!activeTrackId) {
      return;
    }
    await loadLoops(activeTrackId, length);
  };

  const handleLoopPreview = (loop: LoopPreview) => {
    // TODO: wire up audio preview via Tauri fs/asset bridge
    console.info('Preview loop', loop);
  };

  const activeStage: StageProgress | undefined =
    job?.stages.find((stage) => stage.status === 'running') ??
    job?.stages.find((stage) => stage.status === 'pending');

  const heroStats = [
    {
      label: 'Search Hits',
      value: searchResults.length > 0 ? searchResults.length.toString().padStart(2, '0') : '—',
      detail: searchResults.length > 0 ? 'ready to audition' : 'pet the oracle',
    },
    {
      label: 'Pipeline',
      value: job ? (activeStage ? activeStage.label : job.status === 'completed' ? 'Wrapped' : 'Queued') : 'Idle',
      detail: job ? `${Math.round((job.progress ?? 0) * 100)}% · ${job.status}` : 'waiting for a drop',
    },
    {
      label: 'Loop Bank',
      value: loops.length > 0 ? loops.length.toString().padStart(2, '0') : '—',
      detail: loops.length > 0 ? 'curated slices' : 'ready for first cut',
    },
  ];

  return (
    <div className="shell">
      <div className="ambient-orb ambient-orb--one" />
      <div className="ambient-orb ambient-orb--two" />
      <header className="topbar glass">
        <div className="brand">
          <span className="brand-kicker">Music Matters</span>
          <h1>Command Center</h1>
          <p>
            Drop gems, let the agents spin stems, then curate loops with surgical precision. Less prep,
            more wows.
          </p>
        </div>
        <div className="topbar-actions">
          <ThemeSwitcher theme={theme} resolvedTheme={resolvedTheme} onChange={setTheme} />
        </div>
        <div className="status-strip">
          {heroStats.map((stat) => (
            <div key={stat.label} className="status-chip glass">
              <span className="status-label">{stat.label}</span>
              <span className="status-value">{stat.value}</span>
              <span className="status-detail">{stat.detail}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="panel-grid">
        <section className="column column--primary">
          <SearchPanel
            onQuerySubmit={handleQuerySubmit}
            onUrlSubmit={handleUrlSubmit}
            onTracklistImport={handleTracklistImport}
            onFileUpload={handleFileUpload}
            results={searchResults}
            loading={loading}
            error={error}
            onResultSelect={handleResultSelect}
            activeTrackId={activeTrackId}
          />
          <LoopControls
            loops={loops}
            barLength={loopLength}
            loading={loopLoading}
            onBarLengthChange={handleLoopLengthChange}
            onPreview={handleLoopPreview}
          />
        </section>
        <aside className="column column--secondary">
          <ProgressTimeline job={job} />
        </aside>
      </main>
    </div>
  );
}

export default App;
