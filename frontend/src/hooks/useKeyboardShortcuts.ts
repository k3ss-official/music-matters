/**
 * useKeyboardShortcuts — waveform keyboard navigation
 *
 * Category A  Single keys         : I/O, Space, Esc, ←→, [/]
 * Category B  ⌘⌥ + arrows        : beat-relative loop jumps / expand/shrink
 * Category C  ⌘⌥⇧ + arrows       : absolute track/loop point jumps
 * Category D  ⌘ + key            : save loop, export
 *
 * Rules:
 *  - Disabled when any <input>, <textarea>, <select>, or contenteditable is focused
 *  - Uses refs internally so the listener never needs re-registering
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { WaveformHandle } from '../components/WaveformCanvas';
import type { SmartPhrase } from '../services/api';

interface UseKeyboardShortcutsOptions {
    waveformRef: RefObject<WaveformHandle>;
    regionStart: number;
    regionEnd: number;
    duration: number;
    bpm: number | null;
    smartPhrases: SmartPhrase[];
    onUpdateRegion: (start: number, end: number) => void;
    onSaveLoop: () => void;
    onExportAbleton: () => void;
    enabled?: boolean;
}

function isTypingTarget(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** Nearest phrase boundary (start or end of any phrase) to `time` */
function nearestPhraseEdge(time: number, phrases: SmartPhrase[]): number | null {
    if (!phrases.length) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const p of phrases) {
        for (const t of [p.start_time, p.end_time]) {
            const d = Math.abs(t - time);
            if (d < bestDist) { bestDist = d; best = t; }
        }
    }
    return best;
}

export function useKeyboardShortcuts({
    waveformRef,
    regionStart,
    regionEnd,
    duration,
    bpm,
    smartPhrases,
    onUpdateRegion,
    onSaveLoop,
    onExportAbleton,
    enabled = true,
}: UseKeyboardShortcutsOptions): void {
    // Stable refs so the keydown listener is registered once
    const regionStartRef  = useRef(regionStart);
    const regionEndRef    = useRef(regionEnd);
    const durationRef     = useRef(duration);
    const bpmRef          = useRef(bpm);
    const phrasesRef      = useRef(smartPhrases);
    const onUpdateRef     = useRef(onUpdateRegion);
    const onSaveRef       = useRef(onSaveLoop);
    const onExportRef     = useRef(onExportAbleton);

    regionStartRef.current  = regionStart;
    regionEndRef.current    = regionEnd;
    durationRef.current     = duration;
    bpmRef.current          = bpm;
    phrasesRef.current      = smartPhrases;
    onUpdateRef.current     = onUpdateRegion;
    onSaveRef.current       = onSaveLoop;
    onExportRef.current     = onExportAbleton;

    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            if (isTypingTarget()) return;

            const cmd   = e.metaKey || e.ctrlKey;
            const alt   = e.altKey;
            const shift = e.shiftKey;

            const ws      = waveformRef.current;
            const start   = regionStartRef.current;
            const end     = regionEndRef.current;
            const dur     = durationRef.current;
            const beatDur = bpmRef.current ? 60 / bpmRef.current : 0.5;
            const loopLen = Math.max(end - start, 0.1);

            const clamp = (v: number) => Math.max(0, Math.min(dur || Infinity, v));
            const now   = () => ws?.getCurrentTime() ?? 0;

            // ── Category C: ⌘⌥⇧ + arrow ──────────────────────────────────────
            if (cmd && alt && shift) {
                switch (e.key) {
                    case 'ArrowLeft':  e.preventDefault(); ws?.seek(0);     return;
                    case 'ArrowRight': e.preventDefault(); ws?.seek(dur);   return;
                    case 'ArrowUp':    e.preventDefault(); ws?.seek(start); return;
                    case 'ArrowDown':  e.preventDefault(); ws?.seek(end);   return;
                }
                return; // don't fall through to other categories
            }

            // ── Category B: ⌘⌥ + arrow ───────────────────────────────────────
            if (cmd && alt && !shift) {
                switch (e.key) {
                    case 'ArrowLeft': {
                        e.preventDefault();
                        const ns = clamp(start - loopLen);
                        const ne = clamp(end   - loopLen);
                        onUpdateRef.current(ns, ne);
                        ws?.seek(ns);
                        return;
                    }
                    case 'ArrowRight': {
                        e.preventDefault();
                        const ns = clamp(start + loopLen);
                        const ne = clamp(end   + loopLen);
                        onUpdateRef.current(ns, ne);
                        ws?.seek(ns);
                        return;
                    }
                    case 'ArrowUp': {
                        e.preventDefault();
                        onUpdateRef.current(start, clamp(end + beatDur));
                        return;
                    }
                    case 'ArrowDown': {
                        e.preventDefault();
                        const ne = clamp(end - beatDur);
                        if (ne > start + 0.1) onUpdateRef.current(start, ne);
                        return;
                    }
                }
                return;
            }

            // ── Category D: ⌘ + key (no alt, no shift) ───────────────────────
            if (cmd && !alt && !shift) {
                switch (e.key.toLowerCase()) {
                    case 'l': e.preventDefault(); onSaveRef.current();   return;
                    case 'e': e.preventDefault(); onExportRef.current(); return;
                    // Cmd+S, Cmd+Z — let browser/OS handle
                }
                switch (e.key) {
                    case '1': e.preventDefault(); waveformRef.current?.zoomFit(); return;
                    case '2': e.preventDefault(); waveformRef.current?.zoomOut(); return;
                    case '3': e.preventDefault(); waveformRef.current?.zoomIn(); return;
                }
                return;
            }

            // ── Category A: bare keys (no modifiers) ─────────────────────────
            if (cmd || alt) return; // pass through other modifier combos

            switch (e.key) {
                case 'i':
                case 'I': {
                    e.preventDefault();
                    const t = clamp(now());
                    // Keep existing OUT or default to t + 4 beats
                    const newEnd = end > t + 0.05 ? end : clamp(t + beatDur * 4);
                    onUpdateRef.current(t, newEnd);
                    return;
                }
                case 'o':
                case 'O': {
                    e.preventDefault();
                    const t = clamp(now());
                    // Keep existing IN or default to t - 4 beats
                    const newStart = start < t - 0.05 ? start : Math.max(0, t - beatDur * 4);
                    onUpdateRef.current(newStart, t);
                    return;
                }
                case ' ':
                    e.preventDefault();
                    ws?.isPlaying() ? ws.pause() : ws?.play();
                    return;
                case 'Escape':
                    e.preventDefault();
                    ws?.stop();
                    return;
                case 'ArrowLeft':
                    e.preventDefault();
                    ws?.seek(clamp(now() - 0.1));
                    return;
                case 'ArrowRight':
                    e.preventDefault();
                    ws?.seek(clamp(now() + 0.1));
                    return;
                case '[': {
                    e.preventDefault();
                    const phraseEdge = nearestPhraseEdge(start, phrasesRef.current);
                    if (phraseEdge !== null && phraseEdge < end) {
                        // Snap IN to nearest phrase boundary
                        onUpdateRef.current(phraseEdge, end);
                    } else if (beatDur > 0) {
                        // Fallback: nudge IN back by 1 bar
                        const barDur = beatDur * 4;
                        onUpdateRef.current(clamp(start - barDur), end);
                    }
                    return;
                }
                case ']': {
                    e.preventDefault();
                    const phraseEdge = nearestPhraseEdge(end, phrasesRef.current);
                    if (phraseEdge !== null && phraseEdge > start) {
                        // Snap OUT to nearest phrase boundary
                        onUpdateRef.current(start, phraseEdge);
                    } else if (beatDur > 0) {
                        // Fallback: nudge OUT forward by 1 bar
                        const barDur = beatDur * 4;
                        onUpdateRef.current(start, clamp(end + barDur));
                    }
                    return;
                }
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [enabled, waveformRef]); // stable — all values accessed via refs
}
