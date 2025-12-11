/**
 * Custom hook for audio playback with Web Audio API
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
}

interface UseAudioPlayerReturn extends AudioPlayerState {
  play: (url: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleLoop: () => void;
  isLooped: boolean;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    error: null,
  });
  
  const [isLooped, setIsLooped] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Update current time during playback
  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setState(prev => ({
        ...prev,
        currentTime: audioRef.current!.currentTime,
      }));
      animationRef.current = requestAnimationFrame(updateTime);
    }
  }, []);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = isLooped;
    
    const audio = audioRef.current;
    
    audio.addEventListener('loadedmetadata', () => {
      setState(prev => ({
        ...prev,
        duration: audio.duration,
        isLoading: false,
      }));
    });
    
    audio.addEventListener('ended', () => {
      if (!isLooped) {
        setState(prev => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
        }));
      }
    });
    
    audio.addEventListener('error', (e) => {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isPlaying: false,
        error: 'Failed to load audio',
      }));
    });
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audio.pause();
      audio.src = '';
    };
  }, [isLooped]);

  // Update loop setting
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooped;
    }
  }, [isLooped]);

  const play = useCallback(async (url: string) => {
    if (!audioRef.current) return;
    
    try {
      // If different URL, load new audio
      if (url !== currentUrlRef.current) {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        audioRef.current.src = url;
        currentUrlRef.current = url;
        await audioRef.current.load();
      }
      
      await audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
      animationRef.current = requestAnimationFrame(updateTime);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isPlaying: false,
        error: 'Playback failed',
      }));
    }
  }, [updateTime]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooped(prev => !prev);
  }, []);

  return {
    ...state,
    play,
    pause,
    stop,
    seek,
    setVolume,
    toggleLoop,
    isLooped,
  };
}

// Multi-track player for comparing samples
interface MultiPlayerReturn {
  currentTrackId: string | null;
  isPlaying: boolean;
  playTrack: (id: string, url: string) => Promise<void>;
  stopAll: () => void;
}

export function useMultiAudioPlayer(): MultiPlayerReturn {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const playTrack = useCallback(async (id: string, url: string) => {
    if (!audioRef.current) return;
    
    // If same track, toggle play/pause
    if (id === currentTrackId && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    
    // Stop current and play new
    audioRef.current.pause();
    audioRef.current.src = url;
    
    try {
      await audioRef.current.play();
      setCurrentTrackId(id);
      setIsPlaying(true);
    } catch (error) {
      console.error('Playback failed:', error);
      setIsPlaying(false);
    }
  }, [currentTrackId, isPlaying]);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentTrackId(null);
    setIsPlaying(false);
  }, []);

  return {
    currentTrackId,
    isPlaying,
    playTrack,
    stopAll,
  };
}
