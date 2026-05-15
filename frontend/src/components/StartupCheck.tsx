import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X, Zap } from 'lucide-react';

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

interface StartupCheckProps {
    onClear: () => void;
}

// Thresholds for M4 Mac 16 GB — demucs MLX needs ~4 GB headroom
const WARN_PERCENT = 72;
const HEAVY_THRESHOLD_MB = 250;

function getHeavyApps(data: ResourceData): Process[] {
    return data.processes.filter(p => p.is_heavy && p.rss_mb >= HEAVY_THRESHOLD_MB);
}

function isAllClear(data: ResourceData): boolean {
    return data.percent_used < WARN_PERCENT && getHeavyApps(data).length === 0;
}

export function StartupCheck({ onClear }: StartupCheckProps) {
    const [data, setData] = useState<ResourceData | null>(null);
    const [checking, setChecking] = useState(true);
    const [killing, setKilling] = useState(false);
    const [killedPids, setKilledPids] = useState<Set<number>>(new Set());
    const [phase, setPhase] = useState<'checking' | 'clear' | 'warn'>('checking');

    const check = useCallback(async () => {
        setChecking(true);
        setPhase('checking');
        try {
            const res = await fetch('/api/system/resources');
            if (!res.ok) {
                // Backend not ready yet — pass through silently
                onClear();
                return;
            }
            const d: ResourceData = await res.json();
            setData(d);
            if (isAllClear(d)) {
                setPhase('clear');
                // Auto-dismiss after a short "all clear" flash
                setTimeout(onClear, 1400);
            } else {
                setPhase('warn');
            }
        } catch {
            // Can't reach backend — let the app handle it
            onClear();
        } finally {
            setChecking(false);
        }
    }, [onClear]);

    useEffect(() => { check(); }, [check]);

    const killAll = useCallback(async () => {
        if (!data) return;
        setKilling(true);
        const heavy = getHeavyApps(data);
        const newKilled = new Set(killedPids);
        await Promise.allSettled(
            heavy.map(async p => {
                try {
                    await fetch(`/api/system/kill/${p.pid}`, { method: 'POST' });
                    newKilled.add(p.pid);
                } catch {}
            })
        );
        setKilledPids(newKilled);
        setKilling(false);
        // Re-check after a moment for memory to free
        setTimeout(check, 1200);
    }, [data, killedPids, check]);

    if (phase === 'checking') {
        return (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07070f]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center">
                        <Loader2 size={22} className="text-[#00d4ff] animate-spin" />
                    </div>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-white/30">
                        Checking system resources…
                    </p>
                </div>
            </div>
        );
    }

    if (phase === 'clear') {
        return (
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07070f]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
                        <CheckCircle2 size={22} className="text-[#00ff88]" />
                    </div>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-[#00ff88]/60">
                        System ready
                    </p>
                    {data && (
                        <p className="text-[10px] font-mono text-white/25">
                            {data.available_mb.toLocaleString()} MB available
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── warn ──────────────────────────────────────────────────────────────────
    const heavy = data ? getHeavyApps(data) : [];
    const usedPct = data?.percent_used ?? 0;
    const availMb = data?.available_mb ?? 0;

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07070f] p-6">
            <div className="w-full max-w-md bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 bg-[#f59e0b]/5">
                    <div className="w-8 h-8 rounded-xl bg-[#f59e0b]/15 border border-[#f59e0b]/25 flex items-center justify-center shrink-0">
                        <AlertTriangle size={15} className="text-[#f59e0b]" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">System check — action needed</p>
                        <p className="text-[10px] text-white/40 font-mono mt-0.5">
                            Stem separation needs ~4 GB free RAM
                        </p>
                    </div>
                </div>

                {/* RAM bar */}
                <div className="px-5 pt-4 pb-2 space-y-2">
                    <div className="flex justify-between text-[10px] font-mono text-white/40">
                        <span>RAM</span>
                        <span>
                            {availMb.toLocaleString()} MB free · <span className="text-[#f59e0b]">{usedPct.toFixed(0)}% used</span>
                        </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{
                                width: `${usedPct}%`,
                                background: usedPct > 85 ? '#ff3b5c' : '#f59e0b',
                            }}
                        />
                    </div>
                </div>

                {/* Heavy apps */}
                {heavy.length > 0 && (
                    <div className="px-5 pb-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/25 font-mono mt-2">
                            These apps are eating RAM
                        </p>
                        {heavy.map(p => (
                            <div key={p.pid} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                                killedPids.has(p.pid)
                                    ? 'bg-[#00ff88]/5 border-[#00ff88]/15 opacity-50'
                                    : 'bg-[#f59e0b]/5 border-[#f59e0b]/15'
                            }`}>
                                <span className="text-sm text-white/80 font-mono">{p.name}</span>
                                <span className="text-xs font-mono text-[#f59e0b]">{p.rss_mb.toFixed(0)} MB</span>
                            </div>
                        ))}
                        <p className="text-[10px] text-white/30 leading-relaxed pt-1">
                            Close these apps to give Music Matters the headroom it needs for
                            fast, stable stem separation. Leaving them open may cause slowdowns
                            or crashes during processing.
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="px-5 pb-5 flex flex-col gap-2">
                    {heavy.length > 0 && (
                        <button
                            onClick={killAll}
                            disabled={killing}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/20 transition-all font-semibold text-sm disabled:opacity-40"
                        >
                            {killing
                                ? <><Loader2 size={14} className="animate-spin" /> Quitting…</>
                                : <><Zap size={14} /> Quit all {heavy.length} app{heavy.length > 1 ? 's' : ''} for me</>
                            }
                        </button>
                    )}
                    <button
                        onClick={check}
                        disabled={checking}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-all font-semibold text-sm disabled:opacity-40"
                    >
                        {checking
                            ? <><Loader2 size={14} className="animate-spin" /> Checking…</>
                            : <><CheckCircle2 size={14} /> I've closed them — check again</>
                        }
                    </button>
                    <button
                        onClick={onClear}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white/25 hover:text-white/50 transition-all text-sm"
                    >
                        <X size={13} /> Continue anyway
                    </button>
                </div>
            </div>
        </div>
    );
}
