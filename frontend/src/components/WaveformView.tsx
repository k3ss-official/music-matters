import { useEffect, useRef } from 'react';
import type { Track, Loop } from '../App';

interface WaveformViewProps {
  track: Track;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  loopStart: number | null;
  loopEnd: number | null;
  setLoopStart: (time: number) => void;
  loopEnabled: boolean;
  hotCues: Loop[];
}

export default function WaveformView({
  track,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  loopStart,
  loopEnd,
  setLoopStart,
  loopEnabled,
  hotCues,
}: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Draw waveform
  useEffect(() => {
    if (!track.waveformData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = track.waveformData;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    const barWidth = width / data.length;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#8B5CF6'); // purple
    gradient.addColorStop(0.5, '#06B6D4'); // cyan
    gradient.addColorStop(1, '#10B981'); // green

    data.forEach((value, i) => {
      const barHeight = value * height;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Draw beat markers
    if (track.beats) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      track.beats.forEach((beat) => {
        const x = (beat / (track.duration || 1)) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      });
    }

    // Draw downbeat markers (thicker)
    if (track.downbeats) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)'; // cyan
      ctx.lineWidth = 2;
      track.downbeats.forEach((beat) => {
        const x = (beat / (track.duration || 1)) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      });
    }

    // Draw loop region
    if (loopStart !== null && loopEnd !== null) {
      const startX = (loopStart / (track.duration || 1)) * width;
      const endX = (loopEnd / (track.duration || 1)) * width;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)'; // green overlay
      ctx.fillRect(startX, 0, endX - startX, height);
      
      // Loop boundaries
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    // Draw hot cues
    hotCues.forEach((cue) => {
      const startX = (cue.startTime / (track.duration || 1)) * width;
      ctx.fillStyle = cue.color + '40'; // 25% opacity
      ctx.fillRect(startX, height - 10, 3, 10);
    });

    // Draw playhead
    const playheadX = (currentTime / (track.duration || 1)) * width;
    ctx.strokeStyle = '#EF4444'; // red
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [track, currentTime, loopStart, loopEnd, hotCues]);

  // Audio playback
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Loop handling
  useEffect(() => {
    if (!audioRef.current || !loopEnabled || loopStart === null || loopEnd === null) return;

    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      if (loopEnabled && audio.currentTime >= loopEnd) {
        audio.currentTime = loopStart;
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [loopEnabled, loopStart, loopEnd, setCurrentTime]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !track.duration) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * track.duration;
    
    setLoopStart(clickTime);
    setCurrentTime(clickTime);
    if (audioRef.current) {
      audioRef.current.currentTime = clickTime;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      {/* Playback Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-600 flex items-center justify-center text-2xl transition-all"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => {
              setCurrentTime(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            ⏮
          </button>
          <div className="text-sm font-mono">
            <span className="text-cyan-400">{formatTime(currentTime)}</span>
            <span className="text-gray-500"> / </span>
            <span className="text-gray-400">{formatTime(track.duration || 0)}</span>
          </div>
        </div>
        
        <div className="text-sm text-gray-400">
          <p className="font-semibold">{track.artist} - {track.title}</p>
        </div>
      </div>

      {/* Overview Waveform */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">OVERVIEW</p>
        <canvas
          ref={canvasRef}
          width={1200}
          height={80}
          className="w-full h-20 rounded-lg cursor-crosshair"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Detail Waveform (zoomed) */}
      <div>
        <p className="text-xs text-gray-500 mb-2">DETAIL VIEW</p>
        <canvas
          ref={detailCanvasRef}
          width={1200}
          height={120}
          className="w-full h-30 rounded-lg cursor-crosshair"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} src={track.audioUrl} preload="auto" />
    </div>
  );
}
