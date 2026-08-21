import { useMemo, useState } from 'react';

import type { LoopPreview } from '../types';
import { useLoopPlayer } from '../hooks/useLoopPlayer';
import { LoopMeter } from './LoopMeter';

interface LoopControlsProps {
  loops: LoopPreview[];
  barLength: number;
  onBarLengthChange: (bars: number) => void;
  onPreview: (loop: LoopPreview) => void;
  loading?: boolean;
}

const BAR_OPTIONS = [1, 2, 4, 8, 16];

export function LoopControls({
  loops,
  barLength,
  onBarLengthChange,
  onPreview,
  loading = false,
}: LoopControlsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    isPlaying,
    mode,
    activeLoopId,
    activeBars,
    analyser,
    error: playbackError,
    playLoop,
    playStock,
    stop,
  } = useLoopPlayer();

  const filteredLoops = useMemo(
    () => loops.filter((loop) => loop.barCount === barLength),
    [loops, barLength],
  );

  const syncWarning =
    loops.length > 0 && filteredLoops.length === 0
      ? `No perfect ${barLength}-bar loops detected. Consider ${suggestedLength(
          loops,
        )}-bar slices.`
      : null;

  return (
    <section className="card">
      <header className="card-header">
        <h2>Loop Intelligence</h2>
        <p className="muted">
          Dial in the slice size, audition candidates, and bounce the gold.
        </p>
      </header>

      <div className="loop-toolbar">
        <div className="loop-controls-header muted small">Hit a length to hear the stock groove.</div>
        <LoopMeter analyser={analyser} active={isPlaying} />
        <div className="button-row">
          {BAR_OPTIONS.map((option) => {
            const isActiveLength = option === barLength;
            const isAuditioning = activeBars === option && mode === 'stock';
            return (
              <button
                key={option}
                type="button"
                className={[
                  'loop-length',
                  isActiveLength ? 'primary' : 'ghost',
                  isAuditioning ? 'playing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(event) => {
                  event.stopPropagation();
                  onBarLengthChange(option);
                  void (async () => {
                    if (isAuditioning) {
                      await stop();
                      return;
                    }
                    await playStock(option);
                  })();
                }}
              >
                {isAuditioning ? '■ Stop' : `${option} bar${option > 1 ? 's' : ''}`}
              </button>
            );
          })}
        </div>
        {syncWarning && <span className="warning">{syncWarning}</span>}
      </div>

      <div className="loop-list">
        {loading && <div className="muted">Crunching slices…</div>}
        {!loading && filteredLoops.length === 0 && (
          <div className="muted">No loops detected yet. Slice again or wait for processing.</div>
        )}
        {filteredLoops.map((loop) => {
          const isActive = activeLoopId === loop.id && mode !== null;
          const isSelected = selectedId === loop.id || isActive;
          return (
            <article
              key={loop.id}
              className={`loop-row${isSelected ? ' active' : ''}`}
              onClick={() => setSelectedId(loop.id)}
              role="button"
              tabIndex={0}
            >
              <div>
                <strong>{loop.label}</strong>
                <div className="muted small">
                  {loop.stem} · {loop.barCount} bars · {loop.bpm} BPM
                  {loop.key && <> · {loop.key}</>}
                </div>
              </div>
              <div className="loop-actions">
                <button
                  type="button"
                  className={isActive ? 'loop-length playing' : 'ghost'}
                  onClick={(event) => {
                    event.stopPropagation();
                    void (async () => {
                      if (isActive) {
                        await stop();
                        setSelectedId(loop.id);
                        return;
                      }
                      await playLoop(loop, loop.barCount || barLength || 4);
                      setSelectedId(loop.id);
                      onPreview(loop);
                    })();
                  }}
                >
                  {isActive ? '■ Stop' : 'Play'}
                </button>
              </div>
            </article>
          );
        })}
        {playbackError && <div className="warning">{playbackError}</div>}
      </div>
    </section>
  );
}

function suggestedLength(loops: LoopPreview[]): number {
  const counts = new Map<number, number>();
  loops.forEach((loop) => counts.set(loop.barCount, (counts.get(loop.barCount) ?? 0) + 1));
  const [mostCommon] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [4, 0];
  return mostCommon;
}
