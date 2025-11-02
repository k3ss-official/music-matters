import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_BPM = 122;
const BEATS_PER_BAR = 4;

type LoopState = {
  context: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  intervalId?: number;
  nextStart: number;
  bars: number;
  bpm: number;
};

export function useStockLoop() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [currentBars, setCurrentBars] = useState<number | null>(null);
  const stateRef = useRef<LoopState | null>(null);

  const stop = useCallback(async () => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    if (state.intervalId) {
      window.clearInterval(state.intervalId);
    }
    await state.context.close();
    stateRef.current = null;
    setAnalyser(null);
    setCurrentBars(null);
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (bars: number, bpm: number = DEFAULT_BPM) => {
      if (bars <= 0) {
        return;
      }
      await stop();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      await context.resume();

      const master = context.createGain();
      master.gain.value = 0.9;
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.7;
      master.connect(analyserNode);
      analyserNode.connect(context.destination);

      const startTime = context.currentTime + 0.05;
      const nextStart = scheduleLoop(context, master, startTime, bars, bpm);

      const intervalId = window.setInterval(() => {
        const active = stateRef.current;
        if (!active) {
          return;
        }
        const now = context.currentTime;
        if (now + 0.1 >= active.nextStart) {
          active.nextStart = scheduleLoop(context, active.master, active.nextStart, active.bars, active.bpm);
        }
      }, 250);

      stateRef.current = {
        context,
        master,
        analyser: analyserNode,
        intervalId,
        nextStart,
        bars,
        bpm,
      };
      setAnalyser(analyserNode);
      setCurrentBars(bars);
      setIsPlaying(true);
    },
    [stop],
  );

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    isPlaying,
    play,
    stop,
    analyser,
    currentBars,
  };
}

function scheduleLoop(
  context: AudioContext,
  destination: AudioNode,
  startTime: number,
  bars: number,
  bpm: number,
): number {
  const beatDuration = 60 / bpm;
  const totalBeats = Math.max(1, Math.round(bars * BEATS_PER_BAR));
  for (let beat = 0; beat < totalBeats; beat += 1) {
    const time = startTime + beat * beatDuration;
    const beatInBar = beat % BEATS_PER_BAR;
    // Kick on beat 1
    if (beatInBar === 0) {
      scheduleKick(context, destination, time, beatDuration);
    }
    // Snare on beat 3
    if (beatInBar === 2) {
      scheduleSnare(context, destination, time, beatDuration);
    }
    // Hat every beat
    scheduleHat(context, destination, time, beatDuration * 0.5);
  }
  return startTime + totalBeats * beatDuration;
}

function scheduleKick(context: AudioContext, destination: AudioNode, time: number, beatDuration: number) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, time);
  osc.frequency.exponentialRampToValueAtTime(50, time + beatDuration * 0.4);

  gain.gain.setValueAtTime(0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + beatDuration * 0.9);

  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + beatDuration);
}

function scheduleSnare(context: AudioContext, destination: AudioNode, time: number, beatDuration: number) {
  const bufferSize = Math.floor(context.sampleRate * beatDuration * 0.5);
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const channelData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    channelData[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1800;
  bandpass.Q.value = 0.5;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + beatDuration * 0.8);

  noise.connect(bandpass).connect(gain).connect(destination);
  noise.start(time);
  noise.stop(time + beatDuration);
}

function scheduleHat(context: AudioContext, destination: AudioNode, time: number, duration: number) {
  const bufferSize = Math.floor(context.sampleRate * duration);
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const channelData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    channelData[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 7000;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  noise.connect(highpass).connect(gain).connect(destination);
  noise.start(time);
  noise.stop(time + duration);
}
