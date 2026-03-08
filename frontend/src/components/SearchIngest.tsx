import React, { useState, useRef } from 'react';
import { UploadCloud, Search, Link as LinkIcon } from 'lucide-react';
import type { ProcessingMode, ProcessingOptions } from '../types';

interface SearchIngestProps {
    onFileUpload: (file: File, options: ProcessingOptions) => Promise<void>;
    onUrlSubmit: (url: string, options: ProcessingOptions) => Promise<void>;
    loading?: boolean;
}

export function SearchIngest({ onFileUpload, onUrlSubmit, loading }: SearchIngestProps) {
    const [inputVal, setInputVal] = useState('');
    const [mode, setMode] = useState<ProcessingMode>('full');
    const [customOptions, setCustomOptions] = useState<ProcessingOptions>({
        analysis: true,
        separation: true,
        loopSlicing: true,
        mastering: false,
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getOptions = (): ProcessingOptions => {
        switch (mode) {
            case 'stems-only': return { analysis: true, separation: true, loopSlicing: false, mastering: false };
            case 'master-stems': return { analysis: true, separation: true, loopSlicing: false, mastering: true };
            case 'custom': return customOptions;
            default: return { analysis: true, separation: true, loopSlicing: true, mastering: false };
        }
    };

    const isUrl = inputVal.trim().startsWith('http');

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputVal.trim()) return;
        if (isUrl) {
            onUrlSubmit(inputVal.trim(), getOptions());
            setInputVal('');
        } else {
            // Stub search mode for now
            alert('Search mode is coming soon! For now, paste a URL or upload a file.');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onFileUpload(file, getOptions());
        }
        // reset
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="bg-[#12121a] border border-white/5 rounded-lg overflow-hidden flex flex-col">
            <form onSubmit={handleSubmit} className="flex flex-col p-4 border-b border-white/5 bg-[#1a1a26]/50">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Ingest / Search</label>
                <div className="flex bg-black/40 rounded border border-white/10 overflow-hidden focus-within:border-[#00d4ff]/50 transition-colors">
                    <div className="p-3 text-gray-500 bg-black/20">
                        {isUrl ? <LinkIcon size={16} /> : <Search size={16} />}
                    </div>
                    <input
                        type="text"
                        placeholder="Search track name, artist, or paste URL..."
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        disabled={loading}
                        className="w-full bg-transparent text-sm text-white px-2 py-3 outline-none placeholder-gray-600"
                    />
                    <button
                        type="submit"
                        disabled={!inputVal.trim() || loading}
                        className="px-4 text-xs font-bold uppercase bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20 disabled:opacity-50 transition-colors h-full flex items-center"
                    >
                        {isUrl ? 'Queue' : 'Search'}
                    </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
                        onChange={handleFileChange}
                        disabled={loading}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/30 rounded text-xs font-bold transition-colors"
                    >
                        <UploadCloud size={14} /> Upload File
                    </button>
                </div>
            </form>

            <div className="p-4 bg-[#12121a]">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 block">Processing Mode</label>
                <div className="flex bg-black/50 border border-white/5 rounded-lg overflow-hidden text-xs">
                    {[
                        { id: 'full', label: 'Full' },
                        { id: 'stems-only', label: 'Stems' },
                        { id: 'master-stems', label: 'Master' },
                        { id: 'custom', label: 'Custom' },
                    ].map(m => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id as ProcessingMode)}
                            className={`flex-1 py-1.5 font-bold transition-all border-r border-white/5 last:border-0 ${mode === m.id ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                {mode === 'custom' && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="accent-[#00d4ff]" checked={customOptions.analysis} onChange={e => setCustomOptions(o => ({ ...o, analysis: e.target.checked }))} />
                            Analysis (BPM/Key)
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="accent-[#00d4ff]" checked={customOptions.separation} onChange={e => setCustomOptions(o => ({ ...o, separation: e.target.checked }))} />
                            Stem Sep
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="accent-[#00d4ff]" checked={customOptions.loopSlicing} onChange={e => setCustomOptions(o => ({ ...o, loopSlicing: e.target.checked }))} />
                            Loops
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="accent-[#00d4ff]" checked={customOptions.mastering} onChange={e => setCustomOptions(o => ({ ...o, mastering: e.target.checked }))} />
                            Mastering
                        </label>
                    </div>
                )}
            </div>
        </div>
    );
}
