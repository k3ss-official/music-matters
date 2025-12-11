/**
 * SOTA Analysis Panel
 * Displays state-of-the-art analysis features:
 * - Camelot wheel harmonic mixing
 * - Structure segments visualization
 * - Mashup potential scoring
 * - Similar sample finder
 */
import React, { useState, useCallback } from 'react';

interface CamelotKey {
  key: string;
  camelot: string;
  type: string;
  score: number;
  description: string;
}

interface Segment {
  label: string;
  start_time: number;
  end_time: number;
  energy_mean: number;
  is_silent: boolean;
  is_transition: boolean;
}

interface SamplePoint {
  start_time: number;
  end_time: number;
  bar_count: number;
  section_type: string;
  score: number;
  energy_score: number;
  silence_score: number;
  loop_score: number;
}

interface SOTAAnalysis {
  bpm: number;
  key: string;
  camelot: string;
  duration: number;
  compatible_keys: CamelotKey[];
  segments: Segment[];
  sample_points: SamplePoint[];
}

interface Props {
  analysis: SOTAAnalysis | null;
  onSelectSamplePoint?: (point: SamplePoint) => void;
}

// Camelot wheel colors
const CAMELOT_COLORS: Record<string, string> = {
  '1A': '#FF6B6B', '1B': '#FF6B6B',
  '2A': '#FFA06B', '2B': '#FFA06B',
  '3A': '#FFD56B', '3B': '#FFD56B',
  '4A': '#D5FF6B', '4B': '#D5FF6B',
  '5A': '#6BFF6B', '5B': '#6BFF6B',
  '6A': '#6BFFA0', '6B': '#6BFFA0',
  '7A': '#6BFFD5', '7B': '#6BFFD5',
  '8A': '#6BD5FF', '8B': '#6BD5FF',
  '9A': '#6B6BFF', '9B': '#6B6BFF',
  '10A': '#A06BFF', '10B': '#A06BFF',
  '11A': '#D56BFF', '11B': '#D56BFF',
  '12A': '#FF6BD5', '12B': '#FF6BD5',
};

const SECTION_COLORS: Record<string, string> = {
  intro: '#6B7280',
  verse: '#3B82F6',
  chorus: '#EF4444',
  breakdown: '#8B5CF6',
  drop: '#F59E0B',
  bridge: '#10B981',
  outro: '#6B7280',
  main: '#3B82F6',
};

export function SOTAPanel({ analysis, onSelectSamplePoint }: Props) {
  const [activeTab, setActiveTab] = useState<'harmonic' | 'structure' | 'samples'>('harmonic');
  
  if (!analysis) {
    return (
      <div className="card p-6 text-center text-gray-500">
        <div className="text-4xl mb-2">🎯</div>
        <p>SOTA analysis will appear here after processing</p>
      </div>
    );
  }
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="card">
      {/* Header with key info */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          {/* Camelot badge */}
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-black"
            style={{ backgroundColor: CAMELOT_COLORS[analysis.camelot] || '#6BD5FF' }}
          >
            {analysis.camelot}
          </div>
          <div>
            <div className="text-white font-semibold">{analysis.key}</div>
            <div className="text-gray-400 text-sm">{analysis.bpm.toFixed(1)} BPM</div>
            <div className="text-gray-500 text-xs">{formatTime(analysis.duration)}</div>
          </div>
        </div>
        
        {/* Tab buttons */}
        <div className="flex bg-gray-800 rounded-lg p-1">
          {(['harmonic', 'structure', 'samples'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-dj-accent text-black font-medium'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'harmonic' ? '🎹 Harmonic' : tab === 'structure' ? '📊 Structure' : '🎯 Samples'}
            </button>
          ))}
        </div>
      </div>
      
      {/* Harmonic Tab */}
      {activeTab === 'harmonic' && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Compatible Keys for Mixing</h4>
          <div className="grid grid-cols-2 gap-2">
            {analysis.compatible_keys?.map((compat, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800"
              >
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-black"
                  style={{ backgroundColor: CAMELOT_COLORS[compat.camelot] || '#888' }}
                >
                  {compat.camelot}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{compat.key}</div>
                  <div className="text-xs text-gray-500">{compat.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium" style={{
                    color: compat.score >= 90 ? '#4ADE80' : compat.score >= 70 ? '#FBBF24' : '#F87171'
                  }}>
                    {compat.score}%
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Camelot Wheel Visualization */}
          <div className="mt-4 p-4 bg-gray-800/30 rounded-lg">
            <h5 className="text-xs font-medium text-gray-400 mb-2">Camelot Wheel Position</h5>
            <CamelotWheelMini currentKey={analysis.camelot} />
          </div>
        </div>
      )}
      
      {/* Structure Tab */}
      {activeTab === 'structure' && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Track Structure</h4>
          
          {/* Timeline visualization */}
          <div className="relative h-12 bg-gray-800 rounded-lg overflow-hidden">
            {analysis.segments?.map((seg, i) => {
              const startPercent = (seg.start_time / analysis.duration) * 100;
              const widthPercent = ((seg.end_time - seg.start_time) / analysis.duration) * 100;
              
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center justify-center text-xs font-medium text-white/80 border-r border-gray-900"
                  style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundColor: SECTION_COLORS[seg.label] || '#444',
                    opacity: seg.is_silent ? 0.3 : 0.8
                  }}
                  title={`${seg.label}: ${formatTime(seg.start_time)} - ${formatTime(seg.end_time)}`}
                >
                  {widthPercent > 10 && seg.label.substring(0, 3).toUpperCase()}
                </div>
              );
            })}
          </div>
          
          {/* Segment list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {analysis.segments?.map((seg, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-2 rounded text-sm ${
                  seg.is_silent ? 'opacity-50' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: SECTION_COLORS[seg.label] || '#444' }}
                />
                <span className="font-medium text-white capitalize w-20">{seg.label}</span>
                <span className="text-gray-400">
                  {formatTime(seg.start_time)} - {formatTime(seg.end_time)}
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-dj-accent"
                      style={{ width: `${seg.energy_mean * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8">{(seg.energy_mean * 100).toFixed(0)}%</span>
                </div>
                {seg.is_transition && (
                  <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                    transition
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Samples Tab */}
      {activeTab === 'samples' && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Optimal Sample Points</h4>
          <p className="text-xs text-gray-500">AI-detected best locations for sampling (avoiding silence, aligned to beats)</p>
          
          <div className="space-y-2">
            {analysis.sample_points?.map((point, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => onSelectSamplePoint?.(point)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📍'}</span>
                    <span className="font-medium text-white capitalize">{point.section_type}</span>
                    <span className="text-xs text-gray-500">
                      {point.bar_count} bars
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{
                      color: point.score >= 80 ? '#4ADE80' : point.score >= 60 ? '#FBBF24' : '#F87171'
                    }}>
                      {point.score.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500">score</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                  <span>{formatTime(point.start_time)}</span>
                  <span>→</span>
                  <span>{formatTime(point.end_time)}</span>
                </div>
                
                {/* Score breakdown */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Energy</div>
                    <div className="flex items-center gap-1">
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500" style={{ width: `${point.energy_score}%` }} />
                      </div>
                      <span className="text-gray-400 w-6">{point.energy_score.toFixed(0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Silence</div>
                    <div className="flex items-center gap-1">
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${point.silence_score}%` }} />
                      </div>
                      <span className="text-gray-400 w-6">{point.silence_score.toFixed(0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Loop</div>
                    <div className="flex items-center gap-1">
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${point.loop_score}%` }} />
                      </div>
                      <span className="text-gray-400 w-6">{point.loop_score.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mini Camelot wheel visualization
function CamelotWheelMini({ currentKey }: { currentKey: string }) {
  const wheelPositions = [
    { key: '1', angle: 0 },
    { key: '2', angle: 30 },
    { key: '3', angle: 60 },
    { key: '4', angle: 90 },
    { key: '5', angle: 120 },
    { key: '6', angle: 150 },
    { key: '7', angle: 180 },
    { key: '8', angle: 210 },
    { key: '9', angle: 240 },
    { key: '10', angle: 270 },
    { key: '11', angle: 300 },
    { key: '12', angle: 330 },
  ];
  
  const currentNum = currentKey.replace(/[AB]/, '');
  const currentLetter = currentKey.includes('A') ? 'A' : 'B';
  
  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Outer ring (B - Major) */}
      <svg className="absolute inset-0" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="90" fill="none" stroke="#374151" strokeWidth="20" />
        {wheelPositions.map(({ key, angle }) => {
          const radians = (angle - 90) * (Math.PI / 180);
          const x = 100 + 80 * Math.cos(radians);
          const y = 100 + 80 * Math.sin(radians);
          const isActive = key === currentNum && currentLetter === 'B';
          
          return (
            <g key={`${key}B`}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 14 : 10}
                fill={CAMELOT_COLORS[`${key}B`]}
                stroke={isActive ? '#fff' : 'none'}
                strokeWidth={2}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#000"
                fontSize={isActive ? 10 : 8}
                fontWeight="bold"
              >
                {key}B
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Inner ring (A - Minor) */}
      <svg className="absolute inset-0" viewBox="0 0 200 200">
        {wheelPositions.map(({ key, angle }) => {
          const radians = (angle - 90) * (Math.PI / 180);
          const x = 100 + 50 * Math.cos(radians);
          const y = 100 + 50 * Math.sin(radians);
          const isActive = key === currentNum && currentLetter === 'A';
          
          return (
            <g key={`${key}A`}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 12 : 8}
                fill={CAMELOT_COLORS[`${key}A`]}
                stroke={isActive ? '#fff' : 'none'}
                strokeWidth={2}
                opacity={0.8}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#000"
                fontSize={isActive ? 8 : 6}
                fontWeight="bold"
              >
                {key}A
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center">
          <span className="text-xs text-gray-400">Key</span>
        </div>
      </div>
    </div>
  );
}

export default SOTAPanel;
