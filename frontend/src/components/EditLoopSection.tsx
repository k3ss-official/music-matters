/**
 * EditLoopSection — focused loop editor panel
 *
 * Shows a beat-grid ruler for the selected loop region with quantize toggle.
 * Phase 1B: visual layout + beat grid canvas only. Full WaveSurfer zoom in Phase 1C.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { X, Grid3x3 } from 'lucide-react';

interface EditLoopSectionProps {
    regionStart: number;
    regionEnd: number;
    bpm: number | null;
    barCount?: number;
    quantizeEnabled: boolean;
    onQuantizeToggle: () => void;
    onClose: () => void;
}

function drawBeatGrid(
    canvas: HTMLCanvasElement,
    regionStart: number,
    regionEnd: number,
    bpm: number,
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const duration = regionEnd - regionStart;
    if (duration <= 0 || !W) return;

    const beatDur = 60 / bpm;
    let t = 0;
    let beatIdx = 0;

    while (t <= duration + 0.001) {
        const x = (t / duration) * W;
        const isBar = beatIdx % 4 === 0;
        const isBeat = !isBar;

        // Line
        ctx.beginPath();
        ctx.moveTo(x, isBar ? 0 : H * 0.4);
        ctx.lineTo(x, H);
        ctx.strokeStyle = isBar ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isBar ? 1.5 : 0.75;
        ctx.stroke();

        // Beat label
        if (isBar) {
            const barNum = Math.round(beatIdx / 4) + 1;
            ctx.fillStyle = 'rgba(0,212,255,0.7)';
            ctx.font = '10px monospace';
            ctx.fillText(String(barNum), x + 3, 12);
        } else if (isBeat) {
            const beatInBar = (beatIdx % 4) + 1;
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '9px monospace';
            ctx.fillText(String(beatInBar), x + 2, 12);
        }

        t += beatDur;
        beatIdx++;
    }

    // Loop boundary markers
    ctx.strokeStyle = 'rgba(0,212,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 1, 0); ctx.lineTo(W - 1, H); ctx.stroke();
}

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export const EditLoopSection: React.FC<EditLoopSectionProps> = ({
    regionStart,
    regionEnd,
    bpm,
    barCount,
    quantizeEnabled,
    onQuantizeToggle,
    onClose,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showGrid, setShowGrid] = useState(true);
    const duration = regionEnd - regionStart;

    const redraw = useCallback(() => {
        if (!canvasRef.current || !bpm || !showGrid) {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    canvasRef.current.width = canvasRef.current.offsetWidth;
                    canvasRef.current.height = canvasRef.current.offsetHeight;
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
            return;
        }
        drawBeatGrid(canvasRef.current, regionStart, regionEnd, bpm);
    }, [regionStart, regionEnd, bpm, showGrid]);

    useEffect(() => {
        redraw();
    }, [redraw]);

    useEffect(() => {
        const ro = new ResizeObserver(redraw);
        if (canvasRef.current) ro.observe(canvasRef.current);
        return () => ro.disconnect();
    }, [redraw]);

    return (
        <div className="border-t border-white/10 bg-[#0d0d18] flex flex-col shrink-0" style={{ height: 200 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-[#8b5cf6] uppercase tracking-widest font-bold">
                        Edit Loop
                    </span>
                    {barCount > 0 && (
                        <span className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                            {barCount} bar{barCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <span className="text-[10px] font-mono text-white/25">
                        {fmtTime(regionStart)} → {fmtTime(regionEnd)}
                        {duration > 0 && ` · ${duration.toFixed(2)}s`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Show grid toggle */}
                    <button
                        onClick={() => setShowGrid(v => !v)}
                        title="Toggle beat grid"
                        className={`flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-all
                            ${showGrid
                                ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
                                : 'bg-white/5 text-white/30 border border-white/10'}`}
                    >
                        <Grid3x3 size={10} />
                        GRID
                    </button>
                    {/* Quantize toggle */}
                    <button
                        onClick={onQuantizeToggle}
                        title={quantizeEnabled ? 'Snap to beat grid ON — click to disable' : 'Snap to beat grid OFF — click to enable'}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] tracking-wider transition-all
                            ${quantizeEnabled
                                ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/40'
                                : 'bg-white/5 text-white/30 border border-white/10'}`}
                    >
                        SNAP {quantizeEnabled ? 'ON' : 'OFF'}
                    </button>
                    {/* Close */}
                    <button
                        onClick={onClose}
                        title="Close Edit Loop"
                        className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* Beat grid canvas */}
            <div className="flex-1 relative px-4 py-2 overflow-hidden">
                {bpm ? (
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full"
                        style={{ display: 'block' }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-white/20 font-mono text-xs">
                        No BPM — run analysis first
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditLoopSection;
