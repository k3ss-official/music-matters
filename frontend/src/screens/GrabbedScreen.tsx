/**
 * Grabbed Screen - Processing and Results
 */
import React, { useState, useEffect } from 'react';
import { GrabJob, GrabResult, getGrabStatus, openFolder } from '../api';

interface Props {
  jobId: string;
  onNewSearch: () => void;
  onGrabAnother: () => void;
}

const POLL_INTERVAL = 1500;

export function GrabbedScreen({ jobId, onNewSearch, onGrabAnother }: Props) {
  const [job, setJob] = useState<GrabJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const status = await getGrabStatus(jobId);
        if (cancelled) return;
        
        setJob(status);

        if (status.status === 'running' || status.status === 'queued') {
          timer = setTimeout(poll, POLL_INTERVAL);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const handleOpenFolder = () => {
    if (job?.result?.output_dir) {
      openFolder(job.result.output_dir);
    }
  };

  // Loading state
  if (!job) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error || job.status === 'failed') {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-white mb-2">GRAB Failed</h2>
        <p className="text-red-400 mb-6">{error || job.error || 'Unknown error'}</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={onGrabAnother}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all"
          >
            Try Another Track
          </button>
          <button
            onClick={onNewSearch}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all"
          >
            New Search
          </button>
        </div>
      </div>
    );
  }

  // Processing state
  if (job.status === 'queued' || job.status === 'running') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            GRABBING: {job.track.artist} - {job.track.title}
          </h2>
          <p className="text-gray-400">{job.stage}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-gray-500">{job.progress}%</span>
            <span className="text-gray-500">{job.stage}</span>
          </div>
        </div>

        {/* Stage Indicators */}
        <div className="space-y-3">
          {[
            { id: 'download', label: 'Downloading best quality', threshold: 10 },
            { id: 'analyze', label: 'Analyzing BPM & Key', threshold: 30 },
            { id: 'stems', label: 'Separating stems (Demucs)', threshold: 50 },
            { id: 'sections', label: 'Extracting sections', threshold: 70 },
            { id: 'loops', label: 'Generating loops', threshold: 85 },
            { id: 'complete', label: 'Finalizing', threshold: 95 }
          ].map(stage => {
            const isActive = job.progress >= stage.threshold && job.progress < (stage.threshold + 15);
            const isComplete = job.progress > stage.threshold + 10;
            
            return (
              <div 
                key={stage.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isActive 
                    ? 'bg-emerald-500/10 border border-emerald-500/30' 
                    : isComplete 
                      ? 'bg-gray-800/30 opacity-60'
                      : 'bg-gray-800/30 opacity-40'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  isComplete 
                    ? 'bg-emerald-500 text-white' 
                    : isActive 
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-700 text-gray-500'
                }`}>
                  {isComplete ? '✓' : isActive ? (
                    <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-xs">○</span>
                  )}
                </div>
                <span className={isActive ? 'text-white' : 'text-gray-400'}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-center text-gray-500 text-sm mt-8">
          This might take a minute... stem separation is intensive 🎛️
        </p>
      </div>
    );
  }

  // Completed state
  const result = job.result as GrabResult;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-white mb-2">
          GRABBED: {job.track.artist} - {job.track.title}
        </h2>
        <p className="text-emerald-400">Ready for your DAW</p>
      </div>

      {/* Analysis Results */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{result.bpm}</div>
          <div className="text-gray-500 text-sm">BPM</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{result.key}</div>
          <div className="text-gray-500 text-sm">Key</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{result.camelot}</div>
          <div className="text-gray-500 text-sm">Camelot</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">
            {Math.floor(result.duration / 60)}:{String(Math.floor(result.duration % 60)).padStart(2, '0')}
          </div>
          <div className="text-gray-500 text-sm">Duration</div>
        </div>
      </div>

      {/* Compatible Keys */}
      <div className="mb-8 p-4 bg-gray-800/30 rounded-xl">
        <h3 className="text-sm font-medium text-gray-400 mb-2">🎹 Compatible Keys for Mixing</h3>
        <div className="flex flex-wrap gap-2">
          {result.compatible_keys.map(key => (
            <span 
              key={key}
              className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm"
            >
              {key}
            </span>
          ))}
        </div>
      </div>

      {/* Output Contents */}
      <div className="space-y-4 mb-8">
        {/* Stems */}
        <div className="bg-gray-800/50 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <span>🎛️</span> Stems ({result.stems.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.stems.map(stem => (
              <span key={stem} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-lg text-sm">
                {stem}
              </span>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="bg-gray-800/50 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <span>✂️</span> Sections ({result.sections.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.sections.map(section => (
              <span 
                key={section} 
                className={`px-3 py-1 rounded-lg text-sm ${
                  section.includes('drop') || section.includes('chorus')
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {section}
              </span>
            ))}
          </div>
        </div>

        {/* Loops */}
        <div className="bg-gray-800/50 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
            <span>🔁</span> Loops
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(result.loops).map(([barCount, sections]) => (
              <div key={barCount} className="bg-gray-700/50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-white">{barCount}</div>
                <div className="text-gray-500 text-xs">{Object.keys(sections).length} sections</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Folder Path */}
      <div className="mb-8 p-4 bg-gray-800/30 rounded-xl">
        <h3 className="text-sm font-medium text-gray-400 mb-2">📁 Output Location</h3>
        <code className="text-emerald-400 text-sm break-all">{result.output_dir}</code>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={handleOpenFolder}
          className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 
                     text-white font-bold rounded-xl
                     hover:from-emerald-600 hover:to-teal-600 
                     transition-all flex items-center justify-center gap-2"
        >
          <span>📂</span> Open Folder
        </button>
        <button
          onClick={onGrabAnother}
          className="px-6 py-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-all"
        >
          Grab Another
        </button>
        <button
          onClick={onNewSearch}
          className="px-6 py-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-all"
        >
          New Search
        </button>
      </div>

      {/* Folder Structure */}
      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl">
        <h3 className="text-sm font-medium text-gray-400 mb-3">📁 Folder Structure</h3>
        <pre className="text-gray-500 text-xs font-mono">
{`${result.folder_name}/
├── Full Track.wav
├── Stems/
│   ├── drums.wav
│   ├── bass.wav
│   ├── vocals.wav
│   └── ...
├── Sections/
│   ├── intro.wav
│   ├── drop.wav
│   └── outro.wav
├── Loops/
│   ├── 4bar/
│   ├── 8bar/
│   └── 16bar/
├── info.txt
└── metadata.json`}
        </pre>
      </div>
    </div>
  );
}
