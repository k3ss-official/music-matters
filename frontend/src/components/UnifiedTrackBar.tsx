/**
 * UnifiedTrackBar — One unified input hub with a radio-button mode chooser
 * for all track discovery & ingest options:
 *   1. Title / Artist (online search across YouTube, SoundCloud, MusicBrainz + local library filter)
 *   2. Song URL (YouTube, SoundCloud, Bandcamp, or streaming URL -> preview or direct import)
 *   3. Lyrics / Explain (describe track, lyrics snippet, vibe/era hints — never auto-populated, with Reset)
 *   4. Upload Track (simple 1-click file upload + drag & drop)
 *   5. Shazam (identify via Mic / Mac System Audio or import Shazam CSV)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Link2, MessageSquareText, Upload, Radio, RotateCcw,
  Sparkles, Play, Download, ExternalLink, CheckCircle2, Loader2,
  FolderOpen, Music, AlertCircle, X, FileAudio,
} from 'lucide-react';
import * as api from '../services/api';
import type { OnlineSearchTrack, ResolvedUrlInfo } from '../services/api';
import { RecognizeButton } from './RecognizeButton';

export type TrackInputMode = 'title' | 'url' | 'lyrics' | 'upload' | 'shazam';
export type OnlineSourceFilter = 'all' | 'youtube' | 'soundcloud' | 'musicbrainz' | 'library';

interface UnifiedTrackBarProps {
  isConnected: boolean;
  query: string;
  onQueryChange: (val: string) => void;
  onUploadFile: (file: File) => void;
  onIngestSource: (source: string, label?: string, tags?: string[]) => Promise<void> | void;
  onOpenTrack: (trackId: string) => void;
  onOpenShazamCsv: () => void;
  onOpenFolderSettings?: () => void;
  libraryPath?: string;
  autoFocusSearch?: boolean;
  uploading?: boolean;
  defaultMode?: TrackInputMode;
}

const MODE_OPTIONS: Array<{
  id: TrackInputMode;
  label: string;
  shortLabel: string;
  placeholder: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'title',
    label: 'Title / Artist',
    shortLabel: 'Title / Artist',
    placeholder: 'Search track title or artist (filters library & searches YouTube / SoundCloud / MusicBrainz)…',
    icon: <Search size={12} />,
  },
  {
    id: 'url',
    label: 'Song URL',
    shortLabel: 'Song URL',
    placeholder: 'Paste YouTube, SoundCloud, Bandcamp, or audio stream URL…',
    icon: <Link2 size={12} />,
  },
  {
    id: 'lyrics',
    label: 'Lyrics / Explain',
    shortLabel: 'Lyrics / Explain',
    placeholder: 'Type lyrics you remember, or describe the track, hook, artist, or vibe…',
    icon: <MessageSquareText size={12} />,
  },
  {
    id: 'upload',
    label: 'Upload Track',
    shortLabel: 'Upload',
    placeholder: 'Choose or drag & drop an audio file (.mp3, .wav, .flac, .m4a, .aiff, .ogg)…',
    icon: <Upload size={12} />,
  },
  {
    id: 'shazam',
    label: 'Shazam',
    shortLabel: 'Shazam',
    placeholder: 'Identify playing audio via microphone / system audio or import Shazam CSV…',
    icon: <Radio size={12} />,
  },
];

const SEARCH_STAGE_NARRATIVES = [
  { pct: 20, stage: 'Local Index', detail: 'Checking local SQLite library for existing stems & tracks…' },
  { pct: 50, stage: 'Stream Discovery', detail: 'Querying YouTube & SoundCloud audio streams via yt-dlp…' },
  { pct: 80, stage: 'Metadata & Hints', detail: 'Cross-referencing MusicBrainz recordings & lyric/vibe hints…' },
  { pct: 95, stage: 'Ranking Matches', detail: 'Scoring audio quality & deduplicating candidate tracks…' },
];

export function UnifiedTrackBar({
  isConnected,
  query,
  onQueryChange,
  onUploadFile,
  onIngestSource,
  onOpenTrack,
  onOpenShazamCsv,
  onOpenFolderSettings,
  libraryPath,
  autoFocusSearch,
  uploading = false,
  defaultMode = 'title',
}: UnifiedTrackBarProps) {
  const [mode, setMode] = useState<TrackInputMode>(defaultMode);
  const [sourceFilter, setSourceFilter] = useState<OnlineSourceFilter>('all');

  // Lyrics / Explain dedicated fields — NEVER auto-populated
  const [explainText, setExplainText] = useState('');
  const [artistHint, setArtistHint] = useState('');
  const [yearHint, setYearHint] = useState('');

  // Search state & narrative
  const [searching, setSearching] = useState(false);
  const [searchStepIdx, setSearchStepIdx] = useState(0);
  const [searchNarrative, setSearchNarrative] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<OnlineSearchTrack[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ingestingIds, setIngestingIds] = useState<Set<string>>(new Set());

  // URL preview state
  const [urlPreview, setUrlPreview] = useState<ResolvedUrlInfo | null>(null);
  const [resolvingUrl, setResolvingUrl] = useState(false);

  // Drag & drop state
  const [dragActive, setDragActive] = useState(false);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSearch) {
      mainInputRef.current?.focus();
    }
  }, [autoFocusSearch]);

  // Animate search stage narrative while searching
  useEffect(() => {
    if (!searching) {
      setSearchStepIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setSearchStepIdx(prev => Math.min(prev + 1, SEARCH_STAGE_NARRATIVES.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, [searching]);

  // Auto-detect if user pastes an http(s) URL while in Title mode
  const looksLikeUrl = useCallback((val: string) => {
    const trimmed = val.trim().toLowerCase();
    return (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('youtu.be/') ||
      trimmed.startsWith('youtube.com/') ||
      trimmed.startsWith('www.youtube.com/') ||
      trimmed.startsWith('soundcloud.com/') ||
      trimmed.startsWith('bandcamp.com/')
    );
  }, []);

  // Reset / Clear all inputs, hints, and results (Issue #6)
  const handleResetAll = useCallback(() => {
    onQueryChange('');
    setExplainText('');
    setArtistHint('');
    setYearHint('');
    setSearchResults(null);
    setSearchError(null);
    setSearchNarrative([]);
    setUrlPreview(null);
    mainInputRef.current?.focus();
  }, [onQueryChange]);

  const hasAnyInput = Boolean(
    query.trim() ||
    explainText.trim() ||
    artistHint.trim() ||
    yearHint.trim() ||
    (searchResults && searchResults.length > 0) ||
    searchError ||
    urlPreview
  );

  // Execute online + library search
  const runSearch = useCallback(async () => {
    const mainQ = query.trim();
    const hintsQ = mode === 'lyrics' ? explainText.trim() : '';
    const artistQ = mode === 'lyrics' ? artistHint.trim() : '';
    const combinedQuery = [artistQ, mainQ].filter(Boolean).join(' ').trim();

    if (!combinedQuery && !hintsQ) return;

    // If user entered a direct URL in title mode, offer URL resolution / ingest
    if (mode === 'url' || looksLikeUrl(mainQ)) {
      setResolvingUrl(true);
      setSearchError(null);
      try {
        const info = await api.resolveTrackUrl(mainQ);
        setUrlPreview(info);
      } catch (err: any) {
        setSearchError(err?.detail || err?.message || 'Could not inspect URL');
      } finally {
        setResolvingUrl(false);
      }
      return;
    }

    setSearching(true);
    setSearchError(null);
    setUrlPreview(null);
    setSearchNarrative([
      `Starting multi-source search for "${combinedQuery || hintsQ}"…`,
    ]);

    const parsedYear = yearHint.trim() ? parseInt(yearHint.trim(), 10) : undefined;
    const validYear = parsedYear && !isNaN(parsedYear) ? parsedYear : undefined;

    try {
      const resp = await api.searchOnline({
        query: combinedQuery,
        hints: hintsQ || undefined,
        source: sourceFilter,
        limit: 12,
        year_from: validYear,
        year_to: validYear,
      });
      setSearchResults(resp.tracks || []);
      if (resp.narrative && resp.narrative.length > 0) {
        setSearchNarrative(resp.narrative);
      } else {
        setSearchNarrative([
          `Completed search across ${sourceFilter === 'all' ? 'YouTube, SoundCloud, MusicBrainz & Library' : sourceFilter}. Found ${resp.tracks?.length ?? 0} match(es).`,
        ]);
      }
    } catch (err: any) {
      setSearchError(
        err?.detail || err?.message || 'Online search encountered an error — try importing directly by query or URL.'
      );
    } finally {
      setSearching(false);
    }
  }, [query, mode, explainText, artistHint, yearHint, sourceFilter, looksLikeUrl]);

  // Direct URL or query ingest
  const handleDirectIngest = useCallback(async (sourceStr?: string, label?: string) => {
    const target = (sourceStr ?? query).trim() || (mode === 'lyrics' ? [artistHint.trim(), explainText.trim()].filter(Boolean).join(' - ') : '');
    if (!target) return;
    setIngestingIds(prev => new Set([...prev, target]));
    try {
      await onIngestSource(
        target,
        label,
        mode === 'lyrics' ? ['lyrics-search'] : mode === 'url' ? ['url-import'] : ['search-import'],
      );
    } finally {
      setIngestingIds(prev => {
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
    }
  }, [query, mode, artistHint, explainText, onIngestSource]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'url') {
      if (query.trim()) {
        handleDirectIngest(query.trim(), urlPreview?.title);
      }
      return;
    }
    if (mode === 'title' || mode === 'lyrics') {
      runSearch();
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
    e.target.value = '';
  };

  const formatDuration = (sec?: number | null) => {
    if (!sec || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const activeModeMeta = MODE_OPTIONS.find(m => m.id === mode) ?? MODE_OPTIONS[0];
  const currentSearchStage = SEARCH_STAGE_NARRATIVES[searchStepIdx] ?? SEARCH_STAGE_NARRATIVES[0];

  return (
    <div
      className={`mx-5 mt-3 mb-2 rounded-xl border transition-all ${
        dragActive
          ? 'bg-mm-purple/10 border-mm-purple shadow-[0_0_25px_rgba(127,119,221,0.2)]'
          : 'bg-mm-panel/90 border-mm-border'
      }`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file && isConnected && !uploading) {
          onUploadFile(file);
        }
      }}
    >
      {/* Hidden file input for 1-click upload from any mode */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff,.aif"
        onChange={handleFilePicked}
        className="hidden"
      />

      {/* ── Top Row: Radio Button Mode Chooser + Quick Actions ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-2.5 pb-2 border-b border-mm-border/70">
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Track search and import mode">
          <span className="text-[10px] font-mono uppercase tracking-wider text-mm-muted mr-1">
            Mode:
          </span>
          {MODE_OPTIONS.map((opt) => {
            const selected = mode === opt.id;
            return (
              <label
                key={opt.id}
                onClick={() => {
                  setMode(opt.id);
                  setSearchError(null);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer select-none border transition-all ${
                  selected
                    ? 'bg-mm-purple/20 border-mm-purple text-white shadow-[0_0_12px_rgba(127,119,221,0.18)]'
                    : 'bg-mm-surface/60 border-mm-border text-mm-muted hover:text-mm-body hover:border-mm-purple/40'
                }`}
              >
                <input
                  type="radio"
                  name="mm-track-input-mode"
                  value={opt.id}
                  checked={selected}
                  onChange={() => setMode(opt.id)}
                  className="sr-only"
                />
                {/* Custom radio dot */}
                <span
                  className={`w-3 h-3 rounded-full flex items-center justify-center border transition-colors ${
                    selected ? 'border-mm-purple bg-mm-purple/30' : 'border-mm-muted/50 bg-transparent'
                  }`}
                >
                  {selected && <span className="w-1.5 h-1.5 rounded-full bg-mm-purple" />}
                </span>
                {opt.icon}
                <span>{opt.shortLabel}</span>
              </label>
            );
          })}
        </div>

        {/* Right side: Default Music Folder pill + Always-available Upload Track + Reset */}
        <div className="flex items-center gap-1.5">
          {onOpenFolderSettings && (
            <button
              type="button"
              onClick={onOpenFolderSettings}
              title={`Default Music Folder: ${libraryPath || '~/music-matters'} (click to change)`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-mm-border
                         bg-mm-surface/60 text-mm-muted hover:text-mm-text hover:border-mm-purple/40
                         text-[10px] font-mono transition-colors max-w-[210px]"
            >
              <FolderOpen size={11} className="text-mm-purple shrink-0" />
              <span className="truncate">
                {libraryPath ? libraryPath.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~') : '~/music-matters'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || uploading}
            title="Upload an audio file from your computer (.mp3, .wav, .flac, .m4a)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                       bg-mm-teal/15 border border-mm-teal/40 text-mm-teal
                       hover:bg-mm-teal/25 disabled:opacity-40 disabled:cursor-not-allowed
                       text-[11px] font-bold transition-all"
          >
            <Upload size={11} />
            <span>{uploading ? 'Uploading…' : 'Upload Track'}</span>
          </button>

          {hasAnyInput && (
            <button
              type="button"
              onClick={handleResetAll}
              title="Reset and clear all input boxes & search results"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg
                         bg-white/[0.04] border border-mm-border text-mm-muted
                         hover:text-white hover:border-white/20 text-[11px] font-semibold transition-colors"
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Body: Adapts cleanly to the selected Radio Mode ──────────────── */}
      <div className="p-3">
        {/* MODE 1 & 2 & 3: Unified Input Box for Title / URL / Lyrics */}
        {(mode === 'title' || mode === 'url' || mode === 'lyrics') && (
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mm-muted">
                  {activeModeMeta.icon}
                </span>
                <input
                  ref={mainInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    onQueryChange(e.target.value);
                    if (urlPreview) setUrlPreview(null);
                  }}
                  placeholder={
                    mode === 'lyrics'
                      ? 'Optional track title or artist keywords (or leave blank and describe below)…'
                      : activeModeMeta.placeholder
                  }
                  className="w-full bg-mm-surface border border-mm-border rounded-lg pl-8 pr-8 py-2
                             text-[12px] text-mm-text placeholder-mm-muted
                             focus:outline-none focus:border-mm-purple transition-colors"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('');
                      setUrlPreview(null);
                      mainInputRef.current?.focus();
                    }}
                    title="Clear input"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mm-muted hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Source filter pills when in Title or Lyrics mode */}
              {(mode === 'title' || mode === 'lyrics') && (
                <div className="flex items-center bg-mm-surface border border-mm-border rounded-lg p-0.5 text-[10px] font-semibold">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'youtube', label: 'YouTube' },
                      { id: 'soundcloud', label: 'SoundCloud' },
                      { id: 'musicbrainz', label: 'MusicBrainz' },
                      { id: 'library', label: 'Library' },
                    ] as const
                  ).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setSourceFilter(src.id)}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        sourceFilter === src.id
                          ? 'bg-mm-purple text-white'
                          : 'text-mm-muted hover:text-mm-body'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Primary action buttons */}
              {mode === 'url' ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={runSearch}
                    disabled={!query.trim() || resolvingUrl || !isConnected}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                               bg-mm-surface border border-mm-border text-mm-body
                               hover:border-mm-purple hover:text-white
                               disabled:opacity-40 disabled:cursor-not-allowed
                               text-[11px] font-semibold transition-all"
                  >
                    {resolvingUrl ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    <span>Inspect URL</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!query.trim() || !isConnected}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg
                               bg-mm-teal text-white hover:brightness-110
                               disabled:opacity-40 disabled:cursor-not-allowed
                               text-[11px] font-bold transition-all"
                  >
                    <Download size={12} />
                    <span>Import & Stem URL</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={(!query.trim() && !explainText.trim() && !artistHint.trim()) || searching || !isConnected}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg
                               bg-mm-purple text-white hover:brightness-110
                               disabled:opacity-40 disabled:cursor-not-allowed
                               text-[11px] font-bold transition-all"
                  >
                    {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    <span>{searching ? 'Searching…' : 'Search Tracks'}</span>
                  </button>
                  {(query.trim() || explainText.trim()) && (
                    <button
                      type="button"
                      onClick={() => handleDirectIngest()}
                      disabled={!isConnected || searching}
                      title="Immediately download & separate the top match for this query"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                                 bg-mm-teal/15 border border-mm-teal/40 text-mm-teal
                                 hover:bg-mm-teal/25 disabled:opacity-40
                                 text-[11px] font-bold transition-all"
                    >
                      <Sparkles size={12} />
                      <span>Grab Top Match</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Extra Lyrics / Explain inputs (starts completely blank, with dedicated Clear/Reset button) */}
            {mode === 'lyrics' && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_110px_auto] gap-2 pt-1">
                <div className="relative">
                  <input
                    type="text"
                    value={explainText}
                    onChange={(e) => setExplainText(e.target.value)}
                    placeholder="Enter lyrics snippet or explain the track (e.g. 'female vocal hook repeating feel the love, garage beat')…"
                    className="w-full bg-mm-surface border border-mm-border rounded-lg pl-3 pr-7 py-1.5
                               text-[12px] text-mm-text placeholder-mm-muted
                               focus:outline-none focus:border-mm-purple transition-colors"
                  />
                  {explainText && (
                    <button
                      type="button"
                      onClick={() => setExplainText('')}
                      title="Clear lyrics / explain box"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-mm-muted hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={artistHint}
                    onChange={(e) => setArtistHint(e.target.value)}
                    placeholder="Artist hint (optional)"
                    className="w-full bg-mm-surface border border-mm-border rounded-lg pl-3 pr-7 py-1.5
                               text-[12px] text-mm-text placeholder-mm-muted
                               focus:outline-none focus:border-mm-purple transition-colors"
                  />
                  {artistHint && (
                    <button
                      type="button"
                      onClick={() => setArtistHint('')}
                      title="Clear artist hint"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-mm-muted hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={yearHint}
                    onChange={(e) => setYearHint(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                    placeholder="Year (e.g. 1998)"
                    className="w-full bg-mm-surface border border-mm-border rounded-lg pl-3 pr-7 py-1.5
                               text-[12px] text-mm-text placeholder-mm-muted font-mono
                               focus:outline-none focus:border-mm-purple transition-colors"
                  />
                  {yearHint && (
                    <button
                      type="button"
                      onClick={() => setYearHint('')}
                      title="Clear year"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-mm-muted hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg
                             bg-white/[0.04] border border-mm-border text-mm-muted
                             hover:text-white hover:border-white/20 text-[11px] font-semibold transition-colors"
                >
                  <RotateCcw size={11} />
                  <span>Reset All</span>
                </button>
              </div>
            )}

            {/* Quick URL helper chips when in URL mode */}
            {mode === 'url' && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-mm-muted">
                <span>Supports: YouTube · YouTube Music · SoundCloud · Bandcamp · Direct Audio Links</span>
                {query && (
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-mm-purple hover:underline flex items-center gap-1"
                  >
                    <RotateCcw size={10} /> Clear URL
                  </button>
                )}
              </div>
            )}
          </form>
        )}

        {/* MODE 4: Upload Track (dedicated simple upload dropzone) */}
        {mode === 'upload' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-3 rounded-lg bg-mm-surface/70 border border-dashed border-mm-purple/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mm-purple/15 border border-mm-purple/30 flex items-center justify-center text-mm-purple">
                <FileAudio size={20} />
              </div>
              <div>
                <div className="text-[12px] font-bold text-mm-text">
                  Upload Local Audio Track
                </div>
                <div className="text-[11px] text-mm-muted">
                  Drag & drop any MP3, WAV, FLAC, M4A, AIFF, or OGG file here — copies safely into your library and starts 6-stem separation.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected || uploading}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg
                         bg-mm-purple text-white text-[12px] font-bold
                         hover:brightness-110 disabled:opacity-40 transition-all"
            >
              <Upload size={14} />
              <span>{uploading ? 'Uploading…' : 'Choose Audio File…'}</span>
            </button>
          </div>
        )}

        {/* MODE 5: Shazam (Live Mic / Mac Audio recognition + Shazam CSV Import) */}
        {mode === 'shazam' && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-2 px-3 rounded-lg bg-mm-surface/70 border border-mm-border">
            <div className="flex-1 w-full">
              <RecognizeButton
                onLibraryMatch={(trackId) => onOpenTrack(trackId)}
                onIngestMatch={(matchQuery, matchTitle) => handleDirectIngest(matchQuery, matchTitle)}
              />
            </div>
            <div className="h-8 w-[1px] bg-mm-border hidden md:block" />
            <div className="flex flex-col items-center md:items-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenShazamCsv}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg
                           bg-mm-purple/15 border border-mm-purple/30 text-mm-purple
                           hover:bg-mm-purple/25 text-[11px] font-bold transition-all"
              >
                <Music size={13} />
                <span>Import Shazam CSV Library…</span>
              </button>
              <span className="text-[10px] font-mono text-mm-muted">
                Batch-import tracks from shazam.com CSV export
              </span>
            </div>
          </div>
        )}

        {/* ── Slick Search Progress Bar & Live Narrative (Issue #9) ─────── */}
        {(searching || resolvingUrl) && (
          <div className="mt-3 p-3 rounded-lg bg-mm-surface border border-mm-purple/30 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Loader2 size={13} className="text-mm-purple animate-spin" />
                <span>
                  {resolvingUrl ? 'Inspecting Stream URL…' : currentSearchStage.stage}
                </span>
              </div>
              <span className="font-mono text-[10px] text-mm-purple">
                {resolvingUrl ? '45%' : `${currentSearchStage.pct}%`}
              </span>
            </div>
            {/* Segmented status bar */}
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: resolvingUrl ? '45%' : `${currentSearchStage.pct}%`,
                  background: 'linear-gradient(90deg, #7F77DD, #1D9E75)',
                }}
              />
            </div>
            <div className="text-[11px] font-mono text-mm-muted">
              {resolvingUrl
                ? 'Extracting track title, artist, and audio stream manifest…'
                : currentSearchStage.detail}
            </div>
          </div>
        )}

        {/* ── URL Preview Card ─────────────────────────────────────────── */}
        {urlPreview && !resolvingUrl && (
          <div className="mt-3 p-3 rounded-lg bg-mm-surface border border-mm-teal/30 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-mm-teal/15 text-mm-teal">
                  {urlPreview.platform}
                </span>
                <span className="text-[12px] font-bold text-white truncate">
                  {urlPreview.title}
                </span>
              </div>
              <div className="text-[11px] text-mm-muted truncate mt-0.5">
                {urlPreview.artist}
                {urlPreview.duration ? ` · ${formatDuration(urlPreview.duration)}` : ''}
                {urlPreview.note ? ` · ${urlPreview.note}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDirectIngest(urlPreview.url, urlPreview.title)}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg
                         bg-mm-teal text-white text-[11px] font-bold hover:brightness-110 transition-all"
            >
              <Download size={12} />
              <span>Import & Stem</span>
            </button>
          </div>
        )}

        {/* ── Search Error Banner with Direct Fallback ─────────────────── */}
        {searchError && (
          <div className="mt-3 p-3 rounded-lg bg-[#ff3b5c]/10 border border-[#ff3b5c]/25 flex items-center justify-between gap-3 text-xs text-[#ff3b5c]">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{searchError}</span>
            </div>
            {query.trim() && (
              <button
                type="button"
                onClick={() => handleDirectIngest(query.trim())}
                className="shrink-0 px-3 py-1 rounded bg-[#ff3b5c]/20 hover:bg-[#ff3b5c]/30 text-white font-semibold text-[11px]"
              >
                Queue Direct Ingest Anyway
              </button>
            )}
          </div>
        )}

        {/* ── Search Results Tray + Narrative Summary ──────────────────── */}
        {searchResults && !searching && (
          <div className="mt-3 rounded-lg bg-mm-surface border border-mm-border overflow-hidden">
            {/* Narrative bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-mm-border text-[10px] font-mono text-mm-muted">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle2 size={12} className="text-mm-teal shrink-0" />
                <span className="truncate">
                  {searchNarrative[searchNarrative.length - 1] || `Found ${searchResults.length} result(s)`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSearchResults(null)}
                className="text-mm-muted hover:text-white ml-2 shrink-0"
              >
                Close ✕
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-mm-muted">
                  No direct matches returned for that query.
                </p>
                {(query.trim() || explainText.trim()) && (
                  <button
                    type="button"
                    onClick={() => handleDirectIngest()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                               bg-mm-purple/20 border border-mm-purple/40 text-mm-purple
                               hover:bg-mm-purple/30 text-xs font-bold transition-all"
                  >
                    <Download size={12} />
                    <span>Run Direct yt-dlp Stream Grab for "{query.trim() || explainText.trim()}"</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto divide-y divide-mm-border/50">
                {searchResults.map((item, idx) => {
                  const targetSource = item.url || item.youtube_url || item.soundcloud_url || `${item.artist} - ${item.title}`;
                  const isBusy = ingestingIds.has(targetSource);
                  const dur = formatDuration(item.duration);
                  return (
                    <div
                      key={`${item.id || idx}-${idx}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-mm-panel/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                              item.in_library || item.source === 'library'
                                ? 'bg-mm-teal/20 text-mm-teal'
                                : item.source === 'youtube'
                                  ? 'bg-[#ff3b5c]/15 text-[#ff3b5c]'
                                  : item.source === 'soundcloud'
                                    ? 'bg-[#EF9F27]/15 text-[#EF9F27]'
                                    : 'bg-mm-purple/20 text-mm-purple'
                            }`}
                          >
                            {item.in_library || item.source === 'library' ? 'In Library' : item.source}
                          </span>
                          <span className="text-[12px] font-semibold text-mm-text truncate">
                            {item.title}
                          </span>
                          {item.section_hint && (
                            <span className="px-1.5 py-0.5 rounded bg-mm-purple/10 text-mm-purple text-[9px] font-mono shrink-0">
                              {item.section_hint}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-mm-muted truncate mt-0.5 font-mono">
                          {item.artist || 'Unknown artist'}
                          {item.year ? ` · ${item.year}` : ''}
                          {dur ? ` · ${dur}` : ''}
                          {item.bpm ? ` · ${Math.round(item.bpm)} BPM` : ''}
                          {item.key ? ` · Key ${item.key}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {(item.youtube_url || item.soundcloud_url) && (
                          <a
                            href={item.youtube_url || item.soundcloud_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Open source link in browser"
                            className="p-1.5 rounded border border-mm-border text-mm-muted hover:text-white transition-colors"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                        {item.in_library && item.track_id ? (
                          <button
                            type="button"
                            onClick={() => onOpenTrack(item.track_id!)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg
                                       bg-mm-purple/20 border border-mm-purple/40 text-mm-purple
                                       hover:bg-mm-purple/30 text-[11px] font-bold transition-all"
                          >
                            <Play size={11} />
                            <span>Open</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy || !isConnected}
                            onClick={() => handleDirectIngest(targetSource, item.title)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg
                                       bg-mm-teal text-white hover:brightness-110
                                       disabled:opacity-40 text-[11px] font-bold transition-all"
                          >
                            {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                            <span>{isBusy ? 'Queuing…' : 'Import & Stem'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
