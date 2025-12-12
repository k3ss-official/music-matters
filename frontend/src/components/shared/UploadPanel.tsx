import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useState } from 'react';

import type { ProcessingMode, ProcessingOptions } from '../types';

export interface UploadPanelProps {
  onFileUpload: (file: File, options: ProcessingOptions) => Promise<void>;
  onUrlSubmit: (url: string, options: ProcessingOptions) => Promise<void>;
  loading?: boolean;
}

export function UploadPanel({ onFileUpload, onUrlSubmit, loading = false }: UploadPanelProps) {
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('full');
  const [customOptions, setCustomOptions] = useState<ProcessingOptions>({
    analysis: true,
    separation: true,
    loopSlicing: true,
    mastering: false,
  });

  const handleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProcessingMode(event.target.value as ProcessingMode);
  };

  const getProcessingOptions = (): ProcessingOptions => {
    switch (processingMode) {
      case 'stems-only':
        return { analysis: true, separation: true, loopSlicing: false, mastering: false };
      case 'master-stems':
        return { analysis: true, separation: true, loopSlicing: false, mastering: true };
      case 'custom':
        return customOptions;
      case 'full':
      default:
        return { analysis: true, separation: true, loopSlicing: true, mastering: false };
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file, getProcessingOptions());
    }
  };

  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileUpload(file, getProcessingOptions());
    }
  };

  const handleUrlSubmit = () => {
    if (url.trim()) {
      onUrlSubmit(url, getProcessingOptions());
      setUrl('');
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2>Upload Track</h2>
        <p className="muted">Choose processing options and upload your audio</p>
      </header>

      {/* Processing Mode Selection */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>
          Processing Mode:
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="processing-mode"
              value="full"
              checked={processingMode === 'full'}
              onChange={handleModeChange}
              style={{ marginRight: '8px' }}
            />
            <strong>Full Pipeline</strong>
            <span className="muted" style={{ marginLeft: '8px' }}>
              (Analysis + 6 Stems + Loops)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="processing-mode"
              value="stems-only"
              checked={processingMode === 'stems-only'}
              onChange={handleModeChange}
              style={{ marginRight: '8px' }}
            />
            <strong>Stems Only</strong>
            <span className="muted" style={{ marginLeft: '8px' }}>
              (Analysis + 6 Stems)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="processing-mode"
              value="master-stems"
              checked={processingMode === 'master-stems'}
              onChange={handleModeChange}
              style={{ marginRight: '8px' }}
            />
            <strong>Master + Stems</strong>
            <span className="muted" style={{ marginLeft: '8px' }}>
              (Mastering + Analysis + 6 Stems)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="processing-mode"
              value="custom"
              checked={processingMode === 'custom'}
              onChange={handleModeChange}
              style={{ marginRight: '8px' }}
            />
            <strong>Custom</strong>
            <span className="muted" style={{ marginLeft: '8px' }}>
              (Choose specific stages)
            </span>
          </label>
        </div>

        {/* Custom Options */}
        {processingMode === 'custom' && (
          <div style={{ marginTop: '12px', marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={customOptions.analysis}
                onChange={(e) => setCustomOptions({ ...customOptions, analysis: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              Analysis (BPM + Key)
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={customOptions.separation}
                onChange={(e) => setCustomOptions({ ...customOptions, separation: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              6-Stem Separation
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={customOptions.loopSlicing}
                onChange={(e) => setCustomOptions({ ...customOptions, loopSlicing: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              Loop Slicing
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={customOptions.mastering}
                onChange={(e) => setCustomOptions({ ...customOptions, mastering: e.target.checked })}
                style={{ marginRight: '8px' }}
              />
              Mastering (LUFS normalization)
            </label>
          </div>
        )}
      </div>

      {/* File Upload Area */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Upload File:
        </label>
        <div 
          className={`file-drop-zone${dragActive ? ' drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: '2px dashed #666',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            background: dragActive ? '#f0f0f0' : '#fafafa',
            cursor: 'pointer',
          }}
        >
          <input
            id="file-upload"
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
            onChange={handleFileChange}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-upload" style={{ cursor: loading ? 'not-allowed' : 'pointer', display: 'block' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>📁</div>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              {loading ? 'Processing...' : 'Drag & drop audio file or click to browse'}
            </div>
            <div className="muted small">Supports MP3, WAV, FLAC, M4A, OGG</div>
          </label>
        </div>
      </div>

      {/* URL Input */}
      <div>
        <label htmlFor="url-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Or paste URL:
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="url-input"
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlSubmit();
              }
            }}
          />
          <button
            type="button"
            className="primary"
            onClick={handleUrlSubmit}
            disabled={!url.trim() || loading}
            style={{ padding: '8px 16px' }}
          >
            {loading ? 'Processing...' : 'Queue'}
          </button>
        </div>
      </div>
    </section>
  );
}
