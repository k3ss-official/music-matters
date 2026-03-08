import React from 'react';
import type { JobProgress, StageKey } from '../types';

interface QueuePanelProps {
    jobs: Record<string, JobProgress>;
}

export function QueuePanel({ jobs }: QueuePanelProps) {
    const activeJobs = Object.values(jobs).filter(j => j.status !== 'completed' && j.status !== 'failed');

    if (activeJobs.length === 0) return null;

    return (
        <div className="bg-[#12121a] border border-white/5 rounded-lg p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
                <span>Processing Queue</span>
                <span className="bg-[#8b5cf6]/20 text-[#8b5cf6] px-2 py-0.5 rounded-full text-[10px] animate-pulse">
                    {activeJobs.length} Active
                </span>
            </h3>

            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {activeJobs.map(job => (
                    <div key={job.jobId} className="bg-black/40 border border-[#00d4ff]/10 rounded p-3">
                        <div className="flex justify-between text-xs mb-2">
                            <span className="text-gray-300 font-medium truncate pr-2 max-w-[150px]">
                                {job.trackId === 'unknown' ? 'Processing Track...' : `Job ${job.jobId.slice(0, 8)}`}
                            </span>
                            <span className="text-[#00d4ff] uppercase tracking-wider font-bold">
                                {job.currentStage || 'Initializing'}
                            </span>
                        </div>

                        <div className="h-1 w-full bg-gray-900 rounded-full overflow-hidden mb-3">
                            <div
                                className="h-full bg-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.6)] transition-all duration-300"
                                style={{ width: `${(job.progress || 0) * 100}%` }}
                            />
                        </div>

                        <div className="flex flex-wrap gap-1">
                            {job.stages?.map(stage => (
                                <span
                                    key={stage.id}
                                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${stage.status === 'done' ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' :
                                            stage.status === 'running' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30 animate-pulse' :
                                                stage.status === 'error' ? 'bg-[#ff3b5c]/10 text-[#ff3b5c] border border-[#ff3b5c]/20' :
                                                    'bg-white/5 text-gray-500'
                                        }`}
                                >
                                    {stage.label}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
