/**
 * ShortcutLegend — keyboard shortcut reference overlay
 *
 * Triggered by pressing `?` or clicking the `?` button in the header.
 * Closes on Escape or backdrop click.
 */
import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUTS, CATEGORY_LABELS, type ShortcutCategory } from '../config/shortcuts';

interface ShortcutLegendProps {
    isOpen: boolean;
    onClose: () => void;
}

const CATEGORY_ORDER: ShortcutCategory[] = ['A', 'B', 'C', 'D'];

const CATEGORY_ACCENT: Record<ShortcutCategory, string> = {
    A: 'text-[#00d4ff]',
    B: 'text-[#8b5cf6]',
    C: 'text-[#f59e0b]',
    D: 'text-[#00ff88]',
};

function KeyBadge({ label }: { label: string }) {
    const SYMBOLS: Record<string, string> = {
        cmd: '⌘', alt: '⌥', shift: '⇧',
        ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
        ' ': 'Space', Escape: 'Esc',
    };
    return (
        <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 min-w-[22px]
                        bg-white/8 border border-white/15 rounded text-[10px] font-mono
                        text-white/60 tracking-normal shadow-sm">
            {SYMBOLS[label] ?? label.toUpperCase()}
        </kbd>
    );
}

export function ShortcutLegend({ isOpen, onClose }: ShortcutLegendProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-[520px] max-h-[85vh] overflow-y-auto bg-[#13131f] border border-white/10
                            rounded-xl shadow-2xl shadow-black/60 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 sticky top-0 bg-[#13131f] z-10">
                    <div className="flex items-center gap-2">
                        <Keyboard size={14} className="text-[#00d4ff]" />
                        <span className="text-[13px] font-bold uppercase tracking-widest text-white/80">
                            Keyboard Shortcuts
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Shortcut grid */}
                <div className="px-5 py-4 space-y-6">
                    {CATEGORY_ORDER.map(cat => {
                        const catShortcuts = SHORTCUTS.filter(s => s.category === cat);
                        return (
                            <div key={cat}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${CATEGORY_ACCENT[cat]}`}>
                                        {CATEGORY_LABELS[cat]}
                                    </span>
                                    <div className="flex-1 h-px bg-white/5" />
                                </div>
                                <div className="space-y-1">
                                    {catShortcuts.map((s, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
                                        >
                                            <span className="text-[12px] text-white/60">
                                                {s.description}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                                                {s.modifiers?.map(mod => (
                                                    <React.Fragment key={mod}>
                                                        <KeyBadge label={mod} />
                                                        <span className="text-white/20 text-[9px]">+</span>
                                                    </React.Fragment>
                                                ))}
                                                <KeyBadge label={s.key} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    <div className="pt-2 border-t border-white/5 text-center">
                        <span className="text-[10px] text-white/20 font-mono">
                            Shortcuts disabled when text inputs are focused · Press ? to toggle
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ShortcutLegend;
