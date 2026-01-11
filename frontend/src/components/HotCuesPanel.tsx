import type { Loop } from '../App';

interface HotCuesPanelProps {
  hotCues: Loop[];
  selectedHotCue: string | null;
  onLoadHotCue: (loop: Loop) => void;
  onDeleteHotCue: (id: string) => void;
}

export default function HotCuesPanel({
  hotCues,
  selectedHotCue,
  onLoadHotCue,
  onDeleteHotCue,
}: HotCuesPanelProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold mb-6">Hot Cues</h3>

      {hotCues.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No saved loops yet</p>
          <p className="text-xs mt-2">Set a loop and click SAVE LOOP</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hotCues.map((cue, index) => (
            <div
              key={cue.id}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                selectedHotCue === cue.id
                  ? 'border-cyan-400 bg-cyan-500/20'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              onClick={() => onLoadHotCue(cue)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: cue.color }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{cue.name || `Loop ${index + 1}`}</p>
                    <p className="text-xs text-gray-400">{cue.length} beats</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHotCue(cue.id);
                  }}
                  className="w-6 h-6 rounded-md bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 text-xs transition-all"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{formatTime(cue.startTime)}</span>
                <span>→</span>
                <span>{formatTime(cue.endTime)}</span>
              </div>
              
              {/* Visual indicator */}
              <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    backgroundColor: cue.color,
                    width: '100%',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      {hotCues.length < 8 && (
        <div className="mt-6 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <p className="text-xs text-purple-300">
            💡 Save up to 8 loops. Click to load, ✕ to delete.
          </p>
        </div>
      )}
    </div>
  );
}
