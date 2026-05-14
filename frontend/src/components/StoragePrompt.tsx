import React, { useState, useEffect } from 'react';
import { FolderOpen } from 'lucide-react';

const LS_KEY = 'mm-storage-prompt-dismissed';

interface StoragePromptProps {
    libraryPath: string | null;
}

export function StoragePrompt({ libraryPath }: StoragePromptProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!libraryPath) return;
        const dismissed = localStorage.getItem(LS_KEY);
        if (!dismissed) setVisible(true);
    }, [libraryPath]);

    if (!visible || !libraryPath) return null;

    const dismiss = () => {
        localStorage.setItem(LS_KEY, '1');
        setVisible(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-5">
                {/* Icon */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center">
                        <FolderOpen size={20} className="text-[#00d4ff]" />
                    </div>
                    <h2 className="text-lg font-bold text-white">Storage Location</h2>
                </div>

                {/* Message */}
                <p className="text-white/60 text-sm leading-relaxed">
                    Your loops, stems, and projects will be saved to:
                </p>

                {/* Path display */}
                <div className="bg-black/30 border border-white/5 rounded-lg px-4 py-3 font-mono text-[12px] text-[#00d4ff] break-all select-all">
                    {libraryPath}
                </div>

                {/* Structure preview */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3 space-y-1">
                    <div className="text-[9px] uppercase tracking-widest text-white/25 font-mono mb-2">Directory structure</div>
                    {['downloads/', 'stems/', 'loops/', 'projects/'].map(dir => (
                        <div key={dir} className="flex items-center gap-2 text-[11px] font-mono text-white/40">
                            <span className="text-white/15">└─</span>
                            <span>{dir}</span>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                        onClick={dismiss}
                        className="px-5 py-2.5 rounded-lg font-bold text-black text-[12px]
                                   bg-[#00d4ff] hover:bg-[#00b8e6]
                                   shadow-[0_0_12px_rgba(0,212,255,0.25)] transition-colors"
                    >
                        Sounds good
                    </button>
                </div>

                {/* Don't ask again */}
                <p className="text-[9px] text-white/20 font-mono text-center">
                    This prompt won't appear again after you confirm.
                </p>
            </div>
        </div>
    );
}
