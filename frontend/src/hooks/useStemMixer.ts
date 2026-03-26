/**
 * useStemMixer — synchronized Web Audio API stem playback
 *
 * All stems share one AudioContext so they start at exactly the same moment.
 * play/pause/seek mirrors the WaveSurfer transport exactly.
 * GainNodes handle per-stem mute and solo — no AudioBufferSourceNode reuse
 * (they're recreated each play() call, which is the Web Audio API pattern).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { getStemAudioUrl } from '../services/api';

export interface StemMixerState {
    name: string;
    muted: boolean;
    soloed: boolean;
    loaded: boolean;
    error: boolean;
}

interface StemMixerReturn {
    stemStates: StemMixerState[];
    isLoaded: boolean;
    play: (offset: number) => void;
    pause: () => void;
    seek: (offset: number) => void;
    toggleMute: (name: string) => void;
    toggleSolo: (name: string) => void;
    setMasterVolume: (v: number) => void;
}

export function useStemMixer(
    trackId: string | null,
    stemNames: string[],   // base names without extension e.g. ['drums', 'bass']
): StemMixerReturn {
    const ctxRef         = useRef<AudioContext | null>(null);
    const masterGainRef  = useRef<GainNode | null>(null);
    const gainNodesRef   = useRef<Map<string, GainNode>>(new Map());
    const buffersRef     = useRef<Map<string, AudioBuffer>>(new Map());
    const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());

    // Playback tracking
    const playingRef       = useRef(false);
    const startCtxTimeRef  = useRef(0);   // ctx.currentTime when play() was called
    const startOffsetRef   = useRef(0);   // audio offset passed to play()

    const [stemStates, setStemStates] = useState<StemMixerState[]>([]);
    const [isLoaded, setIsLoaded]     = useState(false);

    // ── Load stems whenever track / stem list changes ─────────────────────────
    useEffect(() => {
        // Teardown previous session
        const prev = ctxRef.current;
        if (prev) {
            sourceNodesRef.current.forEach(n => { try { n.stop(); } catch {} });
            sourceNodesRef.current.clear();
            gainNodesRef.current.clear();
            buffersRef.current.clear();
            masterGainRef.current = null;
            prev.close();
            ctxRef.current = null;
        }
        playingRef.current = false;
        setIsLoaded(false);

        if (!trackId || stemNames.length === 0) {
            setStemStates([]);
            return;
        }

        // Fresh context
        const ctx = new AudioContext();
        ctxRef.current = ctx;

        const master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
        masterGainRef.current = master;

        // Initialise state as loading
        setStemStates(stemNames.map(name => ({
            name, muted: false, soloed: false, loaded: false, error: false,
        })));

        let cancelled = false;

        Promise.all(
            stemNames.map(async name => {
                try {
                    const url  = getStemAudioUrl(trackId, name);
                    const res  = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const buf  = await res.arrayBuffer();
                    const audio = await ctx.decodeAudioData(buf);
                    return { name, audio, ok: true as const };
                } catch {
                    return { name, audio: null, ok: false as const };
                }
            })
        ).then(results => {
            if (cancelled) return;
            results.forEach(({ name, audio, ok }) => {
                if (ok && audio) {
                    buffersRef.current.set(name, audio);
                    const gain = ctx.createGain();
                    gain.gain.value = 1;
                    gain.connect(master);
                    gainNodesRef.current.set(name, gain);
                }
                setStemStates(prev =>
                    prev.map(s => s.name === name ? { ...s, loaded: ok, error: !ok } : s)
                );
            });
            setIsLoaded(true);
        });

        return () => {
            cancelled = true;
            sourceNodesRef.current.forEach(n => { try { n.stop(); } catch {} });
            sourceNodesRef.current.clear();
            gainNodesRef.current.clear();
            buffersRef.current.clear();
            masterGainRef.current = null;
            ctx.close();
            ctxRef.current = null;
            playingRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trackId, stemNames.join(',')]);

    // ── Stop all running source nodes ─────────────────────────────────────────
    const stopSources = useCallback(() => {
        sourceNodesRef.current.forEach(n => {
            try { n.stop(); } catch {}
            try { n.disconnect(); } catch {}
        });
        sourceNodesRef.current.clear();
    }, []);

    // ── Play from given audio offset ──────────────────────────────────────────
    const play = useCallback((offset: number) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        stopSources();
        if (ctx.state === 'suspended') ctx.resume();

        startOffsetRef.current  = offset;
        startCtxTimeRef.current = ctx.currentTime;
        playingRef.current      = true;

        buffersRef.current.forEach((buffer, name) => {
            const gain = gainNodesRef.current.get(name);
            if (!gain) return;
            const source    = ctx.createBufferSource();
            source.buffer   = buffer;
            source.connect(gain);
            const safeOffset = Math.max(0, Math.min(offset, buffer.duration - 0.001));
            source.start(0, safeOffset);
            sourceNodesRef.current.set(name, source);
        });
    }, [stopSources]);

    // ── Pause — record current position ──────────────────────────────────────
    const pause = useCallback(() => {
        const ctx = ctxRef.current;
        if (ctx && playingRef.current) {
            startOffsetRef.current += ctx.currentTime - startCtxTimeRef.current;
        }
        playingRef.current = false;
        stopSources();
    }, [stopSources]);

    // ── Seek — update offset, restart if playing ──────────────────────────────
    const seek = useCallback((offset: number) => {
        startOffsetRef.current = offset;
        if (playingRef.current) play(offset);
    }, [play]);

    // ── Apply gain values from current state ──────────────────────────────────
    const applyGains = useCallback((states: StemMixerState[]) => {
        const hasSolo = states.some(s => s.soloed);
        states.forEach(s => {
            const gain = gainNodesRef.current.get(s.name);
            if (!gain) return;
            gain.gain.value = hasSolo
                ? (s.soloed ? 1 : 0)
                : (s.muted  ? 0 : 1);
        });
    }, []);

    // ── Toggle mute ───────────────────────────────────────────────────────────
    const toggleMute = useCallback((name: string) => {
        setStemStates(prev => {
            const next = prev.map(s => s.name === name ? { ...s, muted: !s.muted } : s);
            applyGains(next);
            return next;
        });
    }, [applyGains]);

    // ── Toggle solo (one at a time) ───────────────────────────────────────────
    const toggleSolo = useCallback((name: string) => {
        setStemStates(prev => {
            const wasSoloed = prev.find(s => s.name === name)?.soloed ?? false;
            const next = prev.map(s => ({
                ...s,
                soloed: s.name === name ? !wasSoloed : false,
            }));
            applyGains(next);
            return next;
        });
    }, [applyGains]);

    // ── Master volume ─────────────────────────────────────────────────────────
    const setMasterVolume = useCallback((v: number) => {
        if (masterGainRef.current) masterGainRef.current.gain.value = v;
    }, []);

    return { stemStates, isLoaded, play, pause, seek, toggleMute, toggleSolo, setMasterVolume };
}
