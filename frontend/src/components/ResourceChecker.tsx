import React, { useState, useCallback } from 'react';
import { Cpu, RefreshCw, X, Zap, AlertTriangle } from 'lucide-react';

interface Process {
    pid: number;
    name: string;
    rss_mb: number;
    is_heavy: boolean;
}

interface ResourceData {
    total_mb: number;
    used_mb: number;
    available_mb: number;
    percent_used: number;
    processes: Process[];
}

interface ResourceCheckerProps {
    onClose: () => void;
}

export function ResourceChecker({ onClose }: ResourceCheckerProps) {
    const [data, setData] = useState<ResourceData | null>(null);
    const [loading, setLoading] = useState(false);
    const [killing, setKilling] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchResources = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/system/resources');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setData(await res.json());
        } catch (e: any) {
            setError(e.message || 'Failed to fetch resources');
        } finally {
            setLoading(false);
        }
    }, []);

    const killProcess = useCallback(async (pid: number) => {
        setKilling(pid);
        try {
            await fetch(`/api/system/kill/${pid}`, { method: 'POST' });
            await fetchResources();
        } catch {
            // best-effort
        } finally {
            setKilling(null);
        }
    }, [fetchResources]);

    const usedPct = data ? data.percent_used : 0;
    const barColor = usedPct > 85 ? '#ff3b5c' : usedPct > 65 ? '#f59e0b' : '#00ff88';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Cpu size={16} className="text-[#00d4ff]" />
                        <span className="text-sm font-semibold text-white">System Resources</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchResources}
                            disabled={loading}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all disabled:opacity-30"
                            title="Refresh"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-all"
                        >
                            <X size={13} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {!data && !loading && !error && (
                        <div className="text-center py-8 space-y-3">
                            <Cpu size={32} className="mx-auto text-white/20" />
                            <p className="text-white/40 text-sm">
                                Check what's eating RAM and free it up before running stem separation.
                            </p>
                            <button
                                onClick={fetchResources}
                                className="px-4 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] rounded-lg text-sm font-semibold hover:bg-[#00d4ff]/20 transition-all"
                            >
                                Check Resources
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-[#ff3b5c]/10 border border-[#ff3b5c]/20 rounded-lg text-[#ff3b5c] text-sm">
                            <AlertTriangle size={14} />
                            {error}
                        </div>
                    )}

                    {data && (
                        <>
                            {/* RAM bar */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-mono">
                                    <span className="text-white/50">RAM</span>
                                    <span className="text-white/70">
                                        {data.used_mb.toLocaleString()} MB used of {data.total_mb.toLocaleString()} MB
                                        &nbsp;·&nbsp;
                                        <span style={{ color: barColor }}>{data.percent_used.toFixed(0)}%</span>
                                    </span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${data.percent_used}%`, background: barColor }}
                                    />
                                </div>
                                <p className="text-[10px] text-white/30 font-mono">
                                    {data.available_mb.toLocaleString()} MB available for stem separation
                                </p>
                            </div>

                            {/* Advice */}
                            {data.percent_used > 70 && (
                                <div className="flex items-start gap-2 p-3 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-lg text-[#f59e0b] text-xs">
                                    <Zap size={12} className="mt-0.5 shrink-0" />
                                    <span>
                                        RAM is {data.percent_used > 85 ? 'critically' : 'somewhat'} full.
                                        Closing heavy apps below will give stem separation more headroom.
                                    </span>
                                </div>
                            )}

                            {/* Process list */}
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest text-white/25 font-mono mb-2">
                                    Top processes by memory
                                </p>
                                {data.processes.map(proc => (
                                    <div
                                        key={proc.pid}
                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                            proc.is_heavy
                                                ? 'bg-[#f59e0b]/5 border-[#f59e0b]/15'
                                                : 'bg-white/[0.02] border-white/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {proc.is_heavy && (
                                                <span className="text-[#f59e0b] shrink-0" title="Known heavy app">
                                                    <AlertTriangle size={11} />
                                                </span>
                                            )}
                                            <span className="text-sm text-white/80 truncate font-mono">
                                                {proc.name}
                                            </span>
                                            <span className="text-[10px] text-white/30 shrink-0">
                                                PID {proc.pid}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className={`text-xs font-mono font-semibold ${
                                                proc.rss_mb > 500 ? 'text-[#ff3b5c]' :
                                                proc.rss_mb > 200 ? 'text-[#f59e0b]' : 'text-white/50'
                                            }`}>
                                                {proc.rss_mb.toFixed(0)} MB
                                            </span>
                                            {proc.is_heavy && (
                                                <button
                                                    onClick={() => killProcess(proc.pid)}
                                                    disabled={killing === proc.pid}
                                                    className="px-2 py-0.5 text-[10px] font-mono rounded border border-[#ff3b5c]/30 text-[#ff3b5c]/70 hover:bg-[#ff3b5c]/10 hover:text-[#ff3b5c] transition-all disabled:opacity-30"
                                                >
                                                    {killing === proc.pid ? '...' : 'Quit'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
