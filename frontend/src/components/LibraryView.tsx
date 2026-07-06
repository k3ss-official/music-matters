/**
 * LibraryView — main dashboard / Library page.
 *
 * Layout (top-to-bottom):
 *   1. Toolbar    — search input + Filter / Sort / Import buttons
 *   2. Stats bar  — Total Tracks / Stems Ready / Loops Exported / Processing
 *   3. Track list — # | waveform thumb | title+artist | BPM | key | duration | status | actions
 *
 * Wired to GET /api/library/tracks (real). Placeholders are marked inline.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, SlidersHorizontal, ArrowUpDown, Plus,
  Microscope, AudioWaveform, Download, Music,
} from 'lucide-react';
import type { TrackSummary } from '../types';
import * as api from '../services/api';

// ── Status mapping ──────────────────────────────────────────────────────────
// Backend pipeline statuses → the three dashboard states.
type UiStatus = 'raw' | 'stemming' | 'stemmed';

const STEMMED_STATUSES = ['stems_ready', 'loops_ready', 'project_ready', 'completed', 'done'];
const STEMMING_STATUSES = ['queued', 'running', 'pending'];

export function uiStatus(status: string): UiStatus {
  if (STEMMED_STATUSES.includes(status)) return 'stemmed';
  if (STEMMING_STATUSES.includes(status)) return 'stemming';
  return 'raw'; // ingested / analysed / anything else
}

const STATUS_META: Record<UiStatus, { label: string; dot: string; text: string; pulse?: boolean }> = {
  raw:      { label: 'Raw',       dot: 'bg-mm-muted',  text: 'text-mm-muted' },
  stemming: { label: 'Stemming…', dot: 'bg-mm-amber-deep', text: 'text-mm-amber', pulse: true },
  stemmed:  { label: 'Stemmed',   dot: 'bg-mm-teal',   text: 'text-mm-teal' },
};

// ── Key badge ───────────────────────────────────────────────────────────────
// Minor: "Am", "F#m", "8A" (camelot A-side), "d minor". Major: everything else.
function isMinorKey(key: string): boolean {
  const k = key.trim();
  if (/^\d{1,2}A$/i.test(k)) return true;   // camelot minor
  if (/^\d{1,2}B$/i.test(k)) return false;  // camelot major
  return /m(in(or)?)?$/i.test(k) && !/maj(or)?$/i.test(k);
}

function KeyBadge({ musicalKey }: { musicalKey?: string | null }) {
  if (!musicalKey) return <span className="text-mm-muted text-[11px]">—</span>;
  const minor = isMinorKey(musicalKey);
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold
        ${minor ? 'bg-mm-active text-mm-key-minor' : 'bg-mm-key-major-bg text-mm-key-major'}`}
    >
      {musicalKey}
    </span>
  );
}

// ── Waveform thumbnail ──────────────────────────────────────────────────────
// Deterministic pseudo-waveform seeded from the track id; purple/teal alternating.
function WaveThumb({ seed, color }: { seed: string; color: string }) {
  const points = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const pts: string[] = [];
    for (let x = 0; x <= 60; x += 2) {
      h = (h * 1103515245 + 12345) >>> 0;
      const amp = ((h >>> 8) % 100) / 100;
      const env = Math.sin((Math.PI * x) / 60);
      const y = 10 - amp * env * 8;
      pts.push(`${x},${y.toFixed(1)}`);
      pts.push(`${x + 1},${(20 - y).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [seed]);

  return (
    <svg width="64" height="20" viewBox="0 0 62 20" className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1" opacity="0.75" />
    </svg>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex-1 bg-mm-panel border border-mm-border rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-mm-muted font-semibold">{label}</div>
      <div className={`text-xl font-bold mt-1 ${accent ?? 'text-mm-text'}`}>{value}</div>
    </div>
  );
}

// ── Row action button ───────────────────────────────────────────────────────
function RowAction({
  title, disabled, onClick, hover, children,
}: {
  title: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
  hover: 'teal' | 'purple';
  children: React.ReactNode;
}) {
  const hoverCls = hover === 'teal'
    ? 'hover:border-mm-teal hover:text-mm-teal'
    : 'hover:border-mm-purple hover:text-mm-purple';
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`w-7 h-6 flex items-center justify-center rounded border border-mm-border
        text-mm-muted transition-colors
        ${disabled ? 'opacity-30 cursor-not-allowed' : hoverCls}`}
    >
      {children}
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
type SortMode = 'recent' | 'title' | 'bpm';
type FilterMode = 'all' | 'stemmed' | 'raw' | 'stemming';

interface Props {
  selectedTrackId: string | null;
  autoFocusSearch?: boolean;
  onOpenTrack: (trackId: string) => void;
  onOpenIsolation: (trackId: string) => void;
  onExportTrack: (trackId: string) => void;
  onImport: () => void;
}

export function LibraryView({
  selectedTrackId, autoFocusSearch, onOpenTrack, onOpenIsolation, onExportTrack, onImport,
}: Props) {
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState<FilterMode>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchTracks = useCallback(async () => {
    try {
      const data = await api.listTracks(200, 0);
      setTracks(data.items);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to load library', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks();
    const interval = setInterval(fetchTracks, 5000);
    return () => clearInterval(interval);
  }, [fetchTracks]);

  useEffect(() => {
    if (autoFocusSearch) searchRef.current?.focus();
  }, [autoFocusSearch]);

  const handleRestem = useCallback(async (trackId: string) => {
    try {
      await api.refreshTrack(trackId);
      // optimistic: show as processing immediately
      setTracks(prev => prev.map(t => t.track_id === trackId ? { ...t, status: 'queued' } : t));
    } catch (e) {
      console.error('Re-stem failed', e);
    }
  }, []);

  const visible = useMemo(() => {
    let list = tracks;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) || (t.artist ?? '').toLowerCase().includes(q));
    }
    if (filter !== 'all') list = list.filter(t => uiStatus(t.status) === filter);
    if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'bpm') list = [...list].sort((a, b) => (b.bpm ?? 0) - (a.bpm ?? 0));
    // 'recent' — API order (created_at desc)
    return list;
  }, [tracks, query, filter, sort]);

  const stemsReady = tracks.filter(t => uiStatus(t.status) === 'stemmed').length;
  const processing = tracks.filter(t => uiStatus(t.status) === 'stemming').length;

  const FILTER_LABELS: Record<FilterMode, string> = {
    all: 'Filter', stemmed: 'Stemmed', raw: 'Raw', stemming: 'Processing',
  };
  const SORT_LABELS: Record<SortMode, string> = {
    recent: 'Sort', title: 'Title A–Z', bpm: 'BPM',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mm-muted" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tracks or artists…"
            className="w-full bg-mm-panel border border-mm-border rounded-lg pl-8 pr-3 py-1.5
                       text-[12px] text-mm-text placeholder-mm-muted
                       focus:outline-none focus:border-mm-purple transition-colors"
          />
        </div>
        <button
          onClick={() => setFilter(f =>
            f === 'all' ? 'stemmed' : f === 'stemmed' ? 'raw' : f === 'raw' ? 'stemming' : 'all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors
            ${filter !== 'all'
              ? 'border-mm-purple text-mm-purple bg-mm-active'
              : 'border-mm-border text-mm-body hover:border-mm-purple hover:text-mm-purple'}`}
        >
          <SlidersHorizontal size={12} />
          {FILTER_LABELS[filter]}
        </button>
        <button
          onClick={() => setSort(s => s === 'recent' ? 'title' : s === 'title' ? 'bpm' : 'recent')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors
            ${sort !== 'recent'
              ? 'border-mm-purple text-mm-purple bg-mm-active'
              : 'border-mm-border text-mm-body hover:border-mm-purple hover:text-mm-purple'}`}
        >
          <ArrowUpDown size={12} />
          {SORT_LABELS[sort]}
        </button>
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-mm-teal text-white text-[11px] font-bold
                     hover:brightness-110 transition-all"
        >
          <Plus size={13} />
          Import
        </button>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <div className="flex gap-3 px-5 pb-3 flex-shrink-0">
        <StatCard label="Total Tracks" value={total} />
        <StatCard label="Stems Ready" value={stemsReady} accent="text-mm-teal" />
        {/* PLACEHOLDER: no backend route for loop-export counts yet */}
        <StatCard label="Loops Exported" value="—" />
        <StatCard label="Processing" value={processing} accent={processing > 0 ? 'text-mm-amber' : undefined} />
      </div>

      {/* ── Track list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <div className="bg-mm-surface/40 border border-mm-border rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[32px_76px_1fr_56px_64px_60px_100px_110px] items-center gap-2
                          px-3 py-2 border-b border-mm-border
                          text-[10px] uppercase tracking-widest text-mm-muted font-semibold">
            <span>#</span><span /><span>Title</span><span>BPM</span><span>Key</span>
            <span>Time</span><span>Status</span><span className="text-right">Actions</span>
          </div>

          {loading && tracks.length === 0 && (
            <div className="py-12 text-center text-mm-muted text-sm">Loading library…</div>
          )}

          {!loading && visible.length === 0 && (
            <div className="py-12 flex flex-col items-center gap-2 text-mm-muted">
              <Music size={24} className="opacity-40" />
              <span className="text-sm">
                {tracks.length === 0 ? 'No tracks yet — import one to get started' : 'No tracks match'}
              </span>
            </div>
          )}

          {visible.map((t, i) => {
            const st = uiStatus(t.status);
            const meta = STATUS_META[st];
            const selected = t.track_id === selectedTrackId;
            const accent = i % 2 === 0 ? '#7F77DD' : '#1D9E75';
            return (
              <div
                key={t.track_id}
                onClick={() => onOpenTrack(t.track_id)}
                className={`grid grid-cols-[32px_76px_1fr_56px_64px_60px_100px_110px] items-center gap-2
                            px-3 py-2 cursor-pointer transition-colors border-l-2
                            ${selected
                              ? 'bg-mm-panel border-l-mm-purple'
                              : 'border-l-transparent hover:bg-mm-panel/60'}`}
              >
                <span className="text-[11px] font-mono text-mm-muted">{i + 1}</span>
                <WaveThumb seed={t.track_id} color={accent} />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-mm-text truncate capitalize">{t.title}</div>
                  <div className="text-[10px] text-mm-muted truncate">{t.artist || 'Unknown artist'}</div>
                </div>
                <span className="text-[11px] font-mono text-mm-body">
                  {t.bpm ? Math.round(t.bpm) : '—'}
                </span>
                <KeyBadge musicalKey={t.musical_key} />
                {/* PLACEHOLDER: duration not in /library/tracks list response */}
                <span className="text-[11px] font-mono text-mm-muted">–:––</span>
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${meta.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${meta.pulse ? 'animate-status-pulse' : ''}`} />
                  {meta.label}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <RowAction
                    title={st === 'stemmed' ? 'Open in Isolation Workspace' : 'Stems required for isolation'}
                    disabled={st !== 'stemmed'}
                    hover="teal"
                    onClick={() => onOpenIsolation(t.track_id)}
                  >
                    <Microscope size={13} />
                  </RowAction>
                  <RowAction
                    title={st === 'stemming' ? 'Already processing' : 'Re-run stem separation'}
                    disabled={st === 'stemming'}
                    hover="purple"
                    onClick={() => handleRestem(t.track_id)}
                  >
                    <AudioWaveform size={13} />
                  </RowAction>
                  <RowAction
                    title={st === 'stemmed' ? 'Export' : 'Stems required for export'}
                    disabled={st !== 'stemmed'}
                    hover="purple"
                    onClick={() => onExportTrack(t.track_id)}
                  >
                    <Download size={13} />
                  </RowAction>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
