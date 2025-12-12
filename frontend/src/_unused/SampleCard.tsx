/**
 * Sample Card Component
 * Displays an extracted sample with playback controls
 */
import React from 'react';
import { MiniWaveform, EnergyMeter } from './Waveform';
import type { Sample } from '../types';

interface SampleCardProps {
  sample: Sample;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onGrab: () => void;
  onDiscard: () => void;
  onSeparateStems?: () => void;
  showStems?: boolean;
}

const sectionBadgeColors: Record<string, string> = {
  intro: 'bg-blue-500/20 text-blue-400',
  verse: 'bg-purple-500/20 text-purple-400',
  chorus: 'bg-dj-accent/20 text-dj-accent',
  breakdown: 'bg-orange-500/20 text-orange-400',
  drop: 'bg-red-500/20 text-red-400',
  bridge: 'bg-yellow-500/20 text-yellow-400',
  outro: 'bg-gray-500/20 text-gray-400',
  custom: 'bg-pink-500/20 text-pink-400',
  main: 'bg-purple-500/20 text-purple-400',
};

export const SampleCard: React.FC<SampleCardProps> = ({
  sample,
  isPlaying,
  onPlay,
  onStop,
  onGrab,
  onDiscard,
  onSeparateStems,
  showStems = false,
}) => {
  const badgeColor = sectionBadgeColors[sample.section_type] || sectionBadgeColors.main;
  
  return (
    <div className={`card card-hover ${isPlaying ? 'border-dj-accent glow-accent' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white truncate max-w-[200px]">
            {sample.source_track}
          </h3>
          <p className="text-sm text-gray-400 truncate max-w-[200px]">
            {sample.source_artist}
          </p>
        </div>
        <span className={`badge ${badgeColor}`}>
          {sample.section_type}
        </span>
      </div>
      
      {/* Waveform */}
      <div className="bg-gray-900 rounded-lg p-2 mb-3">
        <MiniWaveform
          peaks={sample.waveform_peaks.slice(0, 100)}
          isPlaying={isPlaying}
          height={50}
        />
      </div>
      
      {/* Info Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-gray-800/50 rounded-lg p-2">
          <div className="text-lg font-mono font-bold text-dj-accent">
            {sample.bpm.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500">BPM</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2">
          <div className="text-sm font-mono font-bold text-white truncate">
            {sample.key.split(' ')[0]}
          </div>
          <div className="text-xs text-gray-500">KEY</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2">
          <div className="text-lg font-mono font-bold text-white">
            {sample.bar_count}
          </div>
          <div className="text-xs text-gray-500">BARS</div>
        </div>
      </div>
      
      {/* Energy Level */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Energy</span>
          <span>{Math.round(sample.energy_level * 100)}%</span>
        </div>
        <EnergyMeter level={sample.energy_level} />
      </div>
      
      {/* Duration */}
      <div className="text-sm text-gray-400 mb-3">
        Duration: {formatDuration(sample.duration)}
      </div>
      
      {/* Stems indicator */}
      {showStems && sample.stems_available && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Stems Available:</div>
          <div className="flex flex-wrap gap-1">
            {Object.keys(sample.stems).map((stem) => (
              <span
                key={stem}
                className="text-xs px-2 py-0.5 bg-dj-purple/20 text-dj-purple rounded"
              >
                {stem}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="flex gap-2">
        {/* Play/Stop Button */}
        <button
          onClick={isPlaying ? onStop : onPlay}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition-all ${
            isPlaying
              ? 'bg-dj-accent text-black'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          {isPlaying ? (
            <>
              <StopIcon />
              Stop
            </>
          ) : (
            <>
              <PlayIcon />
              Play
            </>
          )}
        </button>
        
        {/* Grab Button */}
        <button
          onClick={onGrab}
          className="flex items-center justify-center gap-1 px-4 py-2 bg-dj-accent text-black rounded-lg font-semibold hover:bg-dj-accent-dim transition-all"
          title="Download sample"
        >
          <DownloadIcon />
          Grab
        </button>
        
        {/* Discard Button */}
        <button
          onClick={onDiscard}
          className="flex items-center justify-center p-2 bg-gray-800 text-red-400 rounded-lg hover:bg-red-500/20 transition-all"
          title="Discard sample"
        >
          <TrashIcon />
        </button>
      </div>
      
      {/* Separate Stems Button */}
      {onSeparateStems && !sample.stems_available && (
        <button
          onClick={onSeparateStems}
          className="w-full mt-2 flex items-center justify-center gap-2 py-2 bg-dj-purple/20 text-dj-purple rounded-lg font-medium hover:bg-dj-purple/30 transition-all"
        >
          <StemIcon />
          Separate Stems
        </button>
      )}
    </div>
  );
};

// Icons
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const StemIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default SampleCard;
