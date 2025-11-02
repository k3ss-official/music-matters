import { useCallback, useEffect, useRef, useState } from 'react';

import type { LoopPreview } from '../types';
import { useStockLoop } from './useStockLoop';

type PlaybackMode = 'audio' | 'stock' | null;

interface PlaybackState {
  mode: PlaybackMode;
  loopId: string | null;
  bars: number | null;
}

interface LoopPlayer {
  isPlaying: boolean;
  mode: PlaybackMode;
  activeLoopId: string | null;
  activeBars: number | null;
  analyser: AnalyserNode | null;
  error?: string | null;
  playLoop: (loop: LoopPreview, fallbackBars: number) => Promise<void>;
  playStock: (bars: number) => Promise<void>;
  stop: () => Promise<void>;
}

const DEFAULT_BARS = 4;

export function useLoopPlayer(): LoopPlayer {
  const stock = useStockLoop();
  const [state, setState] = useState<PlaybackState>({ mode: null, loopId: null, bars: null });
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const cleanupMedia = useCallback(async () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.onended = null;
      audioRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaContextRef.current) {
      try {
        await mediaContextRef.current.suspend();
      } catch {
        // ignore suspension errors
      }
    }
    setAnalyser(null);
  }, []);

  const stop = useCallback(async () => {
    await cleanupMedia();
    await stock.stop();
    setState({ mode: null, loopId: null, bars: null });
    setError(null);
  }, [cleanupMedia, stock]);

  const playStock = useCallback(
    async (bars: number) => {
      await stop();
      await stock.play(bars);
      setState({ mode: 'stock', loopId: null, bars });
      setAnalyser(stock.analyser ?? null);
    },
    [stop, stock],
  );

  const playLoop = useCallback(
    async (loop: LoopPreview, fallbackBars: number = DEFAULT_BARS) => {
      await stop();
      setError(null);

      if (loop.fileUrl) {
        try {
          const audio = new Audio(loop.fileUrl);
          audio.crossOrigin = 'anonymous';
          audioRef.current = audio;

          let context = mediaContextRef.current;
          if (!context) {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            context = new AudioCtx();
            mediaContextRef.current = context;
          }

          await context.resume();

          const source = context.createMediaElementSource(audio);
          sourceRef.current = source;
          const analyserNode = context.createAnalyser();
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.75;
          source.connect(analyserNode);
          analyserNode.connect(context.destination);
          setAnalyser(analyserNode);

          audio.onended = () => {
            setState({ mode: null, loopId: null, bars: null });
            setAnalyser(null);
          };

          await audio.play();
          setState({ mode: 'audio', loopId: loop.id, bars: fallbackBars });
          return;
        } catch (err) {
          console.warn('Loop preview failed, falling back to stock', err);
          setError('Preview not available, rolling with the stock groove.');
        }
      }

      await stock.play(fallbackBars);
      setState({ mode: 'stock', loopId: loop.id, bars: fallbackBars });
      setAnalyser(stock.analyser ?? null);
    },
    [stop, stock],
  );

  useEffect(() => {
    return () => {
      void stop();
      if (mediaContextRef.current) {
        mediaContextRef.current.close().catch(() => undefined);
      }
    };
  }, [stop]);

  return {
    isPlaying: state.mode !== null,
    mode: state.mode,
    activeLoopId: state.loopId,
    activeBars: state.bars,
    analyser,
    error,
    playLoop,
    playStock,
    stop,
  };
}

