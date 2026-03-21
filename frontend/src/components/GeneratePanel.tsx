import React, { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { generateAceStep } from '../services/api';

interface GeneratePanelProps {
    bpm?: number | null;
    musicalKey?: string | null;
    onGenerated?: (blob: Blob, filename: string) => void;
}

export function GeneratePanel({ bpm, musicalKey, onGenerated }: GeneratePanelProps) {
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(30);
    const [lockBpm, setLockBpm] = useState(false);
    const [lockKey, setLockKey] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastFilename, setLastFilename] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim() || loading) return;
        setLoading(true);
        setError(null);
        setLastFilename(null);
        try {
            const { blob, filename } = await generateAceStep({
                prompt: prompt.trim(),
                duration,
                bpm: lockBpm && bpm ? bpm : null,
                key: lockKey && musicalKey ? musicalKey : null,
            });
            setLastFilename(filename);
            if (onGenerated) {
                onGenerated(blob, filename);
            } else {
                // default: download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err: any) {
            setError(err?.message ?? 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-[#12121a] rounded-lg p-5 border border-white/5 space-y-4">
            <div className="flex items-center gap-2">
                <Wand2 size={16} className="text-[#8b5cf6]" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Generate</h3>
                <span className="ml-auto text-[10px] text-gray-600 font-mono">ACE-Step 1.5</span>
            </div>

            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="dark UK drill beat, heavy 808 bass, trap hi-hats…"
                rows={2}
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#8b5cf6]/50"
            />

            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Duration</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min={5}
                            max={180}
                            step={5}
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="flex-1 accent-[#8b5cf6]"
                        />
                        <span className="text-xs text-gray-400 w-8 text-right">{duration}s</span>
                    </div>
                </div>
            </div>

            {(bpm || musicalKey) && (
                <div className="flex items-center gap-3">
                    {bpm && (
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400">
                            <input
                                type="checkbox"
                                checked={lockBpm}
                                onChange={(e) => setLockBpm(e.target.checked)}
                                className="accent-[#00d4ff]"
                            />
                            Lock {Math.round(bpm)} BPM
                        </label>
                    )}
                    {musicalKey && (
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400">
                            <input
                                type="checkbox"
                                checked={lockKey}
                                onChange={(e) => setLockKey(e.target.checked)}
                                className="accent-[#00d4ff]"
                            />
                            Lock {musicalKey}
                        </label>
                    )}
                </div>
            )}

            {error && (
                <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
                    {error}
                </div>
            )}

            {lastFilename && !error && (
                <div className="text-xs text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/20 rounded px-3 py-2">
                    Generated: {lastFilename}
                </div>
            )}

            <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 text-[#8b5cf6] border border-[#8b5cf6]/30 rounded text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <>
                        <Loader2 size={14} className="animate-spin" />
                        Generating…
                    </>
                ) : (
                    <>
                        <Wand2 size={14} />
                        Generate
                    </>
                )}
            </button>
        </div>
    );
}
