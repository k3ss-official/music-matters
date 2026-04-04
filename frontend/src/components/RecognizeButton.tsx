/**
 * RecognizeButton — Shazam-style track identification via microphone.
 *
 * States:
 *   idle      → click to start recording
 *   recording → countdown (10 s), mic active
 *   processing→ clip sent to backend
 *   result    → show AcoustID / library match
 *   error     → show error with retry
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { recognizeTrack } from '../services/api';
import type { RecognizeResult } from '../services/api';

type Phase = 'idle' | 'recording' | 'processing' | 'result' | 'error';

const RECORD_SECONDS = 10;

interface Props {
    /** Called when a library match is clicked (to open that track). */
    onLibraryMatch?: (trackId: string) => void;
}

export function RecognizeButton({ onLibraryMatch }: Props) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [countdown, setCountdown] = useState(RECORD_SECONDS);
    const [result, setResult] = useState<RecognizeResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Clean up mic + timer on unmount
    useEffect(() => {
        return () => {
            timerRef.current && clearInterval(timerRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    const stopRecording = useCallback(() => {
        timerRef.current && clearInterval(timerRef.current);
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop(); // triggers ondataavailable + onstop
        }
    }, []);

    const startRecording = useCallback(async () => {
        setErrorMsg('');
        setResult(null);

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
            setErrorMsg('Microphone access denied. Allow mic permission and try again.');
            setPhase('error');
            return;
        }

        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const clip = new Blob(chunksRef.current, { type: mimeType });
            setPhase('processing');
            try {
                const res = await recognizeTrack(clip);
                setResult(res);
                setPhase('result');
            } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : 'Recognition failed');
                setPhase('error');
            }
        };

        recorder.start(250); // collect chunks every 250 ms
        setPhase('recording');
        setCountdown(RECORD_SECONDS);

        // Countdown ticker — stop recorder when it hits 0
        timerRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current!);
                    recorder.state === 'recording' && recorder.stop();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const reset = () => {
        setPhase('idle');
        setResult(null);
        setErrorMsg('');
        setCountdown(RECORD_SECONDS);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (phase === 'idle') {
        return (
            <button
                onClick={startRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                           bg-white/[0.04] border border-white/[0.08]
                           hover:bg-[#8b5cf6]/10 hover:border-[#8b5cf6]/40
                           transition-all text-white/60 hover:text-white text-sm font-medium"
            >
                <MicIcon />
                Identify Track
            </button>
        );
    }

    if (phase === 'recording') {
        return (
            <div className="flex flex-col items-center gap-3 w-full max-w-md">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl
                                bg-[#ff3b5c]/10 border border-[#ff3b5c]/30 text-[#ff3b5c] w-full">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3b5c] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#ff3b5c]" />
                    </span>
                    <span className="text-sm font-medium flex-1">Listening…</span>
                    <span className="font-mono text-lg font-bold tabular-nums">{countdown}s</span>
                </div>
                <button
                    onClick={stopRecording}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                    Stop early
                </button>
            </div>
        );
    }

    if (phase === 'processing') {
        return (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl
                            bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#8b5cf6] text-sm">
                <SpinnerIcon />
                Identifying…
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className="flex flex-col gap-2 w-full max-w-md">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                                bg-[#ff3b5c]/10 border border-[#ff3b5c]/20 text-[#ff3b5c] text-sm">
                    <AlertIcon />
                    {errorMsg}
                </div>
                <button onClick={reset} className="text-xs text-white/30 hover:text-white/60 transition-colors self-center">
                    Try again
                </button>
            </div>
        );
    }

    // phase === 'result'
    if (!result) return null;

    const { acoustid, library_match, fpcalc_available, acoustid_key_configured } = result;
    const noMatch = !acoustid && !library_match;

    return (
        <div className="flex flex-col gap-3 w-full max-w-md">
            {/* AcoustID result */}
            {acoustid && (
                <div className="px-4 py-3 rounded-xl bg-[#00d4ff]/5 border border-[#00d4ff]/20">
                    <div className="text-[10px] font-mono tracking-[0.15em] text-[#00d4ff]/60 mb-1">ACOUSTID MATCH · {Math.round(acoustid.score * 100)}%</div>
                    <div className="text-white font-semibold text-sm">{acoustid.title ?? '—'}</div>
                    <div className="text-white/50 text-xs mt-0.5">
                        {[acoustid.artist, acoustid.album, acoustid.year].filter(Boolean).join(' · ')}
                    </div>
                </div>
            )}

            {/* Library match */}
            {library_match && (
                <button
                    onClick={() => onLibraryMatch?.(library_match.track_id)}
                    className="text-left px-4 py-3 rounded-xl bg-[#8b5cf6]/5 border border-[#8b5cf6]/20
                               hover:border-[#8b5cf6]/50 transition-all"
                >
                    <div className="text-[10px] font-mono tracking-[0.15em] text-[#8b5cf6]/60 mb-1">
                        LIBRARY MATCH · {Math.round(library_match.similarity * 100)}% similar
                    </div>
                    <div className="text-white font-semibold text-sm">{library_match.title}</div>
                    {library_match.artist && (
                        <div className="text-white/50 text-xs mt-0.5">{library_match.artist}</div>
                    )}
                </button>
            )}

            {/* No match found */}
            {noMatch && (
                <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/40 text-sm text-center">
                    No match found
                    {(!fpcalc_available || !acoustid_key_configured) && (
                        <p className="text-[10px] text-white/25 mt-1 font-mono">
                            {!fpcalc_available
                                ? 'Install fpcalc (brew install chromaprint) for global search'
                                : 'Set ACOUSTID_API_KEY in .env for global search'}
                        </p>
                    )}
                </div>
            )}

            <button onClick={reset} className="text-xs text-white/30 hover:text-white/60 transition-colors self-center">
                Try again
            </button>
        </div>
    );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

function AlertIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    );
}
