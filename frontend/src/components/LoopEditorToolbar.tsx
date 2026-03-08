import React from 'react';
import { Play } from 'lucide-react';

interface LoopEditorToolbarProps {
    regionStart: number;
    regionEnd: number;
    bpm: number | null;
    onUpdateRegion: (start: number, end: number) => void;
    onPreviewToggle: () => void;
    previewing?: boolean;
}

export function LoopEditorToolbar({
    regionStart,
    regionEnd,
    bpm,
    onUpdateRegion,
    onPreviewToggle,
    previewing = false,
}: LoopEditorToolbarProps) {
    const formatTime = (seconds: number) => {
        return seconds.toFixed(3);
    };

    const nudgeStart = (ms: number) => {
        const newStart = Math.max(0, regionStart + ms / 1000);
        if (newStart < regionEnd) {
            onUpdateRegion(newStart, regionEnd);
        }
    };

    const nudgeEnd = (ms: number) => {
        const newEnd = regionEnd + ms / 1000;
        if (newEnd > regionStart) {
            onUpdateRegion(regionStart, newEnd);
        }
    };

    const setLength = (bars: number) => {
        if (!bpm) return;
        const beatDuration = 60 / bpm;
        const barDuration = beatDuration * 4;
        const newEnd = regionStart + barDuration * bars;
        onUpdateRegion(regionStart, newEnd);
    };

    const lengthS = regionEnd - regionStart;

    return (
        <div className="bg-[#12121a] p-4 border-t border-white/5 flex flex-col gap-4 text-sm text-gray-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="opacity-70 text-xs font-semibold uppercase tracking-wider">Start</span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => nudgeStart(-100)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{"<<"}</button>
                            <button onClick={() => nudgeStart(-10)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{"<"}</button>
                            <span className="font-mono bg-black/50 px-3 py-1.5 rounded min-w-[80px] text-center border border-white/10 text-white">
                                {formatTime(regionStart)}
                            </span>
                            <button onClick={() => nudgeStart(10)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{">"}</button>
                            <button onClick={() => nudgeStart(100)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{">>"}</button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="opacity-70 text-xs font-semibold uppercase tracking-wider">End</span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => nudgeEnd(-100)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{"<<"}</button>
                            <button onClick={() => nudgeEnd(-10)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{"<"}</button>
                            <span className="font-mono bg-black/50 px-3 py-1.5 rounded min-w-[80px] text-center border border-white/10 text-white">
                                {formatTime(regionEnd)}
                            </span>
                            <button onClick={() => nudgeEnd(10)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{">"}</button>
                            <button onClick={() => nudgeEnd(100)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 opacity-70">{">>"}</button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="opacity-70 text-xs font-semibold uppercase tracking-wider">Length</span>
                    <span className="font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-3 py-1.5 rounded border border-[#00d4ff]/30">
                        {formatTime(lengthS)}s
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <div className="flex items-center gap-2">
                    <span className="opacity-70 text-xs mr-2">Quick Lengths (Bars):</span>
                    {[1, 2, 4, 8].map(bars => (
                        <button
                            key={bars}
                            disabled={!bpm}
                            onClick={() => setLength(bars)}
                            className="px-3 py-1 rounded-full text-xs font-medium border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            {bars} Bar{bars > 1 ? 's' : ''}
                        </button>
                    ))}
                    {!bpm && <span className="text-xs text-[#ff3b5c]/70 ml-2">(Requires BPM Analysis)</span>}
                </div>

                <button
                    onClick={onPreviewToggle}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${previewing
                            ? 'bg-[#ff3b5c]/20 text-[#ff3b5c] border border-[#ff3b5c]/50 shadow-[0_0_10px_rgba(255,59,92,0.3)]'
                            : 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/50 shadow-[0_0_10px_rgba(139,92,246,0.2)] hover:bg-[#8b5cf6]/30'
                        }`}
                >
                    {previewing ? 'Stop Preview' : (
                        <>
                            <Play size={14} fill="currentColor" /> Preview Loop
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
