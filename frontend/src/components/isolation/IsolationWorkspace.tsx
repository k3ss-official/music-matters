/**
 * IsolationWorkspace — top-level layout for the Isolation feature.
 *
 * Layout (left-to-right):
 *   [Left nav sidebar] | [Main content] | [Right export sidebar]
 *
 * Main content (top-to-bottom):
 *   1. ParentStemPanel    — waveform, region, transport, info strip
 *   2. SubstemEQShaper   — target selector + 5 EQ faders + meter + bypass/reset
 *   3. SubstemMixer       — 5 substem rows (NO EQ in rows)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { IsolationSession } from '../../types/isolation';
import { createIsolationSession } from '../../services/isolationApi';
import { ParentStemPanel } from './ParentStemPanel';
import { SubstemEQShaper } from './SubstemEQShaper';
import { SubstemMixer } from './SubstemMixer';
import { IsolationRightSidebar } from './IsolationRightSidebar';

interface Props {
  /** Optional: pre-seed from an existing track in the library */
  sourceTrackId?: string | null;
  sourceBpm?: number;
  sourceKey?: string | null;
  sourceTitle?: string | null;
}

export function IsolationWorkspace({
  sourceTrackId,
  sourceBpm = 120,
  sourceKey,
  sourceTitle,
}: Props) {
  const [session, setSession] = useState<IsolationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    createIsolationSession({
      source_track_path: sourceTrackId ?? undefined,
      parent_stem_name: sourceTitle ?? 'untitled',
      bpm: sourceBpm,
      key: sourceKey ?? undefined,
    })
      .then(s => { if (!cancelled) { setSession(s); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });

    return () => { cancelled = true; };
  }, [sourceTrackId, sourceBpm, sourceKey, sourceTitle]);

  const handleSessionUpdate = useCallback((updated: IsolationSession) => {
    setSession(updated);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-[#7F77DD]" />
          <span className="text-[11px] font-mono text-white/40">Creating isolation session…</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#ff3b5c] font-mono text-sm mb-2">Failed to create session</div>
          <div className="text-white/30 font-mono text-xs">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto p-4 min-w-0">
        {/* 1. Parent Stem Panel */}
        <ParentStemPanel session={session} onSessionUpdate={handleSessionUpdate} />

        {/* 2. Active Substem EQ / Shaper */}
        <SubstemEQShaper session={session} onSessionUpdate={handleSessionUpdate} />

        {/* 3. Substem Mixer — NO EQ HERE */}
        <SubstemMixer session={session} onSessionUpdate={handleSessionUpdate} />
      </div>

      {/* Right sidebar — export + audition */}
      <IsolationRightSidebar session={session} onSessionUpdate={handleSessionUpdate} />
    </div>
  );
}
