import type { KeyboardEvent } from 'react';
import { useState } from 'react';

import type { SearchResult, TrackQuery } from '../types';

export interface SearchPanelProps {
  onQuerySubmit: (query: TrackQuery) => Promise<void> | void;
  onUrlSubmit: (url: string) => Promise<void> | void;
  onTracklistImport: (content: string) => Promise<void> | void;
  onFileUpload?: (file: File) => Promise<void> | void;
  results: SearchResult[];
  loading?: boolean;
  error?: string;
  onResultSelect?: (result: SearchResult) => void;
  activeTrackId?: string | null;
}

export function SearchPanel({
  onQuerySubmit,
  onUrlSubmit,
  onTracklistImport,
  onFileUpload,
  results,
  loading = false,
  error,
  onResultSelect,
  activeTrackId,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [tracklistPreview, setTracklistPreview] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleQuerySubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || loading) {
      return;
    }
    onQuerySubmit({ query: trimmed });
  };

  const handleTracklistChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTracklistPreview(event.target.value);
  };

  const handleTracklistSubmit = () => {
    if (tracklistPreview.trim()) {
      onTracklistImport(tracklistPreview);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2>Source Finder</h2>
        <p className="muted">
          Search by vibe, paste a URL, or drop a tracklist. We&apos;ll do the digging.
        </p>
      </header>

      <div className="input-grid">
        <div className="input-group">
          <label htmlFor="query">Fuzzy Track / Lyric Search</label>
          <div className="stacked">
            <input
              id="query"
              type="text"
              placeholder='e.g. "frankie knuckles deep deep down chorus"'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleQuerySubmit();
                }
              }}
            />
            <button
              type="button"
              className="primary"
              onClick={handleQuerySubmit}
              disabled={!query.trim() || loading}
            >
              Search Library
            </button>
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="url">Direct URL</label>
          <div className="stacked">
            <input
              id="url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button
              type="button"
              className="primary"
              onClick={() => onUrlSubmit(url)}
              disabled={!url.trim() || loading}
            >
              Queue Ingest
            </button>
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="tracklist">Tracklist Paste</label>
          <textarea
            id="tracklist"
            rows={4}
            placeholder="Paste playlist exports or setlist text here..."
            value={tracklistPreview}
            onChange={handleTracklistChange}
          />
          <div className="tracklist-actions">
            <button
              type="button"
              className="primary"
              onClick={handleTracklistSubmit}
              disabled={!tracklistPreview.trim() || loading}
            >
              Parse &amp; Match
            </button>
            <span className="hint">CSV / M3U / freeform text supported</span>
          </div>
        </div>

        {onFileUpload && (
          <div className="input-group">
            <label htmlFor="file-upload">Upload Audio File</label>
            <div 
              className={`file-drop-zone${dragActive ? ' drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                id="file-upload"
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="file-upload" style={{ cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                <div>📁 Drag & drop audio file or click to browse</div>
                <div className="muted small">Supports MP3, WAV, FLAC, M4A, OGG</div>
              </label>
            </div>
          </div>
        )}
      </div>

      <footer className="results">
        {loading && (
          <div style={{
            padding: '20px',
            background: '#FFA726',
            color: 'white',
            borderRadius: '8px',
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            ⏳ UPLOADING & QUEUING... Please wait
          </div>
        )}
        {error && (
          <div style={{
            padding: '12px',
            background: '#f44336',
            color: 'white',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}>
            ❌ ERROR: {error}
          </div>
        )}
        {!loading && !error && results.length === 0 && (
          <span className="muted">No matches yet. Try a deeper lyric or add an artist.</span>
        )}
        {results.map((result) => {
          const active = result.trackId === activeTrackId;
          const handleSelect = () => onResultSelect?.(result);
          const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleSelect();
            }
          };

          return (
            <article
              key={result.trackId}
              className={`result-row${active ? ' active' : ''}`}
              onClick={handleSelect}
              onKeyDown={handleKeyDown}
              role={onResultSelect ? 'button' : undefined}
              tabIndex={onResultSelect ? 0 : undefined}
            >
              <div>
                <strong>{result.title}</strong>
                {result.artist && <span className="muted"> · {result.artist}</span>}
                <div className="muted small">{result.source}</div>
              </div>
              <div className="result-meta">
                <span className="confidence">{Math.round(result.confidence * 100)}%</span>
                <span className="status">{result.status}</span>
              </div>
            </article>
          );
        })}
      </footer>
    </section>
  );
}
