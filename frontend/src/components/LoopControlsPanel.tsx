import type { Track } from '../App';

interface LoopControlsPanelProps {
  loopLength: number;
  setLoopLength: (length: number) => void;
  loopStart: number | null;
  loopEnd: number | null;
  setLoopStart: (time: number) => void;
  setLoopEnd: (time: number) => void;
  loopEnabled: boolean;
  setLoopEnabled: (enabled: boolean) => void;
  currentTime: number;
  track: Track;
  onSaveLoop: () => void;
}

const loopLengths = [
  { beats: 1, label: '1' },
  { beats: 2, label: '2' },
  { beats: 4, label: '4' },
  { beats: 8, label: '8' },
  { beats: 16, label: '16' },
  { beats: 32, label: '32' },
  { beats: 64, label: '64' },
];

const fractionalLengths = [
  { beats: 0.125, label: '1/32' },
  { beats: 0.25, label: '1/16' },
  { beats: 0.5, label: '1/8' },
  { beats: 1, label: '1/4' },
  { beats: 2, label: '1/2' },
];

export default function LoopControlsPanel({
  loopLength,
  setLoopLength,
  loopStart,
  loopEnd,
  setLoopStart,
  setLoopEnd,
  loopEnabled,
  setLoopEnabled,
  currentTime,
  track,
  onSaveLoop,
}: LoopControlsPanelProps) {
  const beatDuration = 60 / (track.bpm || 120);

  const handleSetLoopIn = () => {
    setLoopStart(currentTime);
    setLoopEnd(currentTime + loopLength * beatDuration);
  };

  const handleSetLoopOut = () => {
    setLoopEnd(currentTime);
  };

  const handleMoveLoop = (direction: 'left' | 'right') => {
    if (loopStart === null || loopEnd === null) return;
    
    const offset = direction === 'left' ? -beatDuration : beatDuration;
    setLoopStart(Math.max(0, loopStart + offset));
    setLoopEnd(Math.max(0, loopEnd + offset));
  };

  const handleSetLength = (beats: number) => {
    setLoopLength(beats);
    if (loopStart !== null) {
      setLoopEnd(loopStart + beats * beatDuration);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold mb-6">Loop Controls</h3>

      {/* Loop IN/OUT */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={handleSetLoopIn}
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 rounded-xl font-semibold transition-all"
        >
          LOOP IN
        </button>
        <button
          onClick={handleSetLoopOut}
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 rounded-xl font-semibold transition-all"
        >
          LOOP OUT
        </button>
      </div>

      {/* Loop ON/OFF */}
      <div className="mb-6">
        <button
          onClick={() => setLoopEnabled(!loopEnabled)}
          disabled={loopStart === null || loopEnd === null}
          className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all ${
            loopEnabled
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-white/10 hover:bg-white/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loopEnabled ? '🔁 LOOP ON' : '⭕ LOOP OFF'}
        </button>
      </div>

      {/* Fractional Loop Lengths */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">FINE</p>
        <div className="grid grid-cols-5 gap-2">
          {fractionalLengths.map(({ beats, label }) => (
            <button
              key={label}
              onClick={() => handleSetLength(beats)}
              className={`px-3 py-2 rounded-lg text-sm font-mono font-semibold transition-all ${
                loopLength === beats
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Coarse Loop Lengths */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-2">COARSE</p>
        <div className="grid grid-cols-7 gap-2">
          {loopLengths.map(({ beats, label }) => (
            <button
              key={label}
              onClick={() => handleSetLength(beats)}
              className={`px-3 py-2 rounded-lg text-sm font-mono font-semibold transition-all ${
                loopLength === beats
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Move Loop */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-2">MOVE LOOP</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleMoveLoop('left')}
            disabled={loopStart === null || loopEnd === null}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            ← LEFT
          </button>
          <button
            onClick={() => handleMoveLoop('right')}
            disabled={loopStart === null || loopEnd === null}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            RIGHT →
          </button>
        </div>
      </div>

      {/* Save Loop */}
      <button
        onClick={onSaveLoop}
        disabled={loopStart === null || loopEnd === null}
        className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        💾 SAVE LOOP
      </button>

      {/* Keyboard Shortcuts */}
      <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-xs text-blue-300 font-semibold mb-2">⌨️ Keyboard Shortcuts</p>
        <div className="text-xs text-blue-200 space-y-1">
          <p><kbd className="px-1 py-0.5 bg-white/10 rounded">Space</kbd> Play/Pause</p>
          <p><kbd className="px-1 py-0.5 bg-white/10 rounded">I</kbd> Loop In • <kbd className="px-1 py-0.5 bg-white/10 rounded">O</kbd> Loop Out</p>
          <p><kbd className="px-1 py-0.5 bg-white/10 rounded">L</kbd> Loop On/Off</p>
          <p><kbd className="px-1 py-0.5 bg-white/10 rounded">1-9</kbd> Set loop length</p>
          <p><kbd className="px-1 py-0.5 bg-white/10 rounded">←</kbd> <kbd className="px-1 py-0.5 bg-white/10 rounded">→</kbd> Move loop</p>
        </div>
      </div>
    </div>
  );
}
