/**
 * Waveform visualization component
 */
import React, { useRef, useEffect, useMemo } from 'react';

interface WaveformProps {
  peaks: number[];
  currentTime?: number;
  duration?: number;
  sections?: Array<{
    type: string;
    start_time: number;
    end_time: number;
    energy_level: number;
  }>;
  height?: number;
  barWidth?: number;
  barGap?: number;
  accentColor?: string;
  dimColor?: string;
  showSections?: boolean;
  onSeek?: (time: number) => void;
  className?: string;
}

const sectionColors: Record<string, string> = {
  intro: 'rgba(59, 130, 246, 0.4)',
  verse: 'rgba(139, 92, 246, 0.4)',
  chorus: 'rgba(0, 255, 136, 0.4)',
  breakdown: 'rgba(249, 115, 22, 0.4)',
  drop: 'rgba(239, 68, 68, 0.4)',
  bridge: 'rgba(234, 179, 8, 0.4)',
  outro: 'rgba(107, 114, 128, 0.4)',
  main: 'rgba(139, 92, 246, 0.3)',
};

export const Waveform: React.FC<WaveformProps> = ({
  peaks,
  currentTime = 0,
  duration = 0,
  sections = [],
  height = 80,
  barWidth = 2,
  barGap = 1,
  accentColor = '#00ff88',
  dimColor = '#333',
  showSections = false,
  onSeek,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const progress = duration > 0 ? currentTime / duration : 0;
  const progressIndex = Math.floor(progress * peaks.length);
  
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current || duration === 0) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const seekTime = percentage * duration;
    onSeek(seekTime);
  };
  
  // Memoize section overlays
  const sectionOverlays = useMemo(() => {
    if (!showSections || !duration) return null;
    
    return sections.map((section, i) => {
      const left = (section.start_time / duration) * 100;
      const width = ((section.end_time - section.start_time) / duration) * 100;
      const color = sectionColors[section.type] || sectionColors.main;
      
      return (
        <div
          key={i}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            backgroundColor: color,
          }}
        >
          <span className="absolute top-1 left-1 text-[10px] text-white/60 uppercase font-mono">
            {section.type}
          </span>
        </div>
      );
    });
  }, [sections, duration, showSections]);
  
  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900/50 rounded-lg overflow-hidden cursor-pointer ${className}`}
      style={{ height }}
      onClick={handleClick}
    >
      {/* Section overlays */}
      {sectionOverlays}
      
      {/* Waveform bars */}
      <div className="absolute inset-0 flex items-center justify-center px-1">
        {peaks.map((peak, i) => {
          const isPast = i < progressIndex;
          const barHeight = Math.max(4, peak * (height - 8));
          
          return (
            <div
              key={i}
              className="transition-colors duration-75"
              style={{
                width: barWidth,
                height: barHeight,
                backgroundColor: isPast ? accentColor : dimColor,
                marginRight: i < peaks.length - 1 ? barGap : 0,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
      
      {/* Playhead */}
      {duration > 0 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
          style={{
            left: `${progress * 100}%`,
            boxShadow: '0 0 10px rgba(255,255,255,0.5)',
          }}
        />
      )}
      
      {/* Time display */}
      {duration > 0 && (
        <div className="absolute bottom-1 right-2 text-xs font-mono text-white/60">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      )}
    </div>
  );
};

// Mini waveform for sample cards
interface MiniWaveformProps {
  peaks: number[];
  isPlaying?: boolean;
  color?: string;
  height?: number;
  className?: string;
}

export const MiniWaveform: React.FC<MiniWaveformProps> = ({
  peaks,
  isPlaying = false,
  color = '#00ff88',
  height = 40,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-center gap-px ${className}`}
      style={{ height }}
    >
      {peaks.map((peak, i) => {
        const barHeight = Math.max(2, peak * (height - 4));
        
        return (
          <div
            key={i}
            className={`rounded-sm transition-all ${isPlaying ? 'animate-pulse' : ''}`}
            style={{
              width: 2,
              height: barHeight,
              backgroundColor: color,
              opacity: isPlaying ? 1 : 0.7,
            }}
          />
        );
      })}
    </div>
  );
};

// Energy meter visualization
interface EnergyMeterProps {
  level: number; // 0-1
  className?: string;
}

export const EnergyMeter: React.FC<EnergyMeterProps> = ({
  level,
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, level * 100));
  
  // Color based on energy level
  const getColor = () => {
    if (level < 0.3) return '#22c55e';
    if (level < 0.6) return '#eab308';
    if (level < 0.8) return '#f97316';
    return '#ef4444';
  };
  
  return (
    <div className={`h-2 bg-gray-800 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${percentage}%`,
          backgroundColor: getColor(),
        }}
      />
    </div>
  );
};

// Helper function
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default Waveform;
