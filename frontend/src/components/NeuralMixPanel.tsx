import type { StemLevels } from '../App';

interface NeuralMixPanelProps {
  stemLevels: StemLevels;
  setStemLevels: (levels: StemLevels) => void;
  soloedStem: keyof StemLevels | null;
  setSoloedStem: (stem: keyof StemLevels | null) => void;
  mutedStems: Set<keyof StemLevels>;
  setMutedStems: (stems: Set<keyof StemLevels>) => void;
}

const stemConfig: { key: keyof StemLevels; label: string; icon: string; color: string }[] = [
  { key: 'drums', label: 'Drums', icon: '🥁', color: '#EF4444' },
  { key: 'bass', label: 'Bass', icon: '🎸', color: '#F59E0B' },
  { key: 'vocals', label: 'Vocals', icon: '🎤', color: '#10B981' },
  { key: 'guitar', label: 'Guitar', icon: '🎸', color: '#3B82F6' },
  { key: 'piano', label: 'Piano', icon: '🎹', color: '#8B5CF6' },
  { key: 'other', label: 'Other', icon: '🎵', color: '#6B7280' },
];

export default function NeuralMixPanel({
  stemLevels,
  setStemLevels,
  soloedStem,
  setSoloedStem,
  mutedStems,
  setMutedStems,
}: NeuralMixPanelProps) {
  const handleLevelChange = (stem: keyof StemLevels, value: number) => {
    setStemLevels({ ...stemLevels, [stem]: value });
  };

  const handleSolo = (stem: keyof StemLevels) => {
    setSoloedStem(soloedStem === stem ? null : stem);
  };

  const handleMute = (stem: keyof StemLevels) => {
    const newMuted = new Set(mutedStems);
    if (newMuted.has(stem)) {
      newMuted.delete(stem);
    } else {
      newMuted.add(stem);
    }
    setMutedStems(newMuted);
  };

  const handleReset = () => {
    setStemLevels({
      drums: 100,
      bass: 100,
      vocals: 100,
      guitar: 100,
      piano: 100,
      other: 100,
    });
    setSoloedStem(null);
    setMutedStems(new Set());
  };

  const handlePreset = (preset: string) => {
    switch (preset) {
      case 'drums':
        setStemLevels({ drums: 100, bass: 30, vocals: 0, guitar: 0, piano: 0, other: 0 });
        break;
      case 'no_vocals':
        setStemLevels({ drums: 100, bass: 100, vocals: 0, guitar: 100, piano: 100, other: 100 });
        break;
      case 'acapella':
        setStemLevels({ drums: 0, bass: 0, vocals: 100, guitar: 0, piano: 0, other: 0 });
        break;
    }
    setSoloedStem(null);
    setMutedStems(new Set());
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
        Neural Mix
      </h3>

      {/* Presets */}
      <div className="mb-6 space-y-2">
        <p className="text-xs text-gray-500 mb-2">PRESETS</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-all"
          >
            RESET
          </button>
          <button
            onClick={() => handlePreset('drums')}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-all"
          >
            DRUMS
          </button>
          <button
            onClick={() => handlePreset('no_vocals')}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-all"
          >
            NO VOCALS
          </button>
          <button
            onClick={() => handlePreset('acapella')}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-all"
          >
            ACAPELLA
          </button>
        </div>
      </div>

      {/* Stem Controls */}
      <div className="space-y-4">
        {stemConfig.map(({ key, label, icon, color }) => {
          const isSoloed = soloedStem === key;
          const isMuted = mutedStems.has(key);
          const level = stemLevels[key];

          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{icon}</span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSolo(key)}
                    className={`w-8 h-8 rounded-md text-xs font-bold transition-all ${isSoloed
                        ? 'bg-yellow-500 text-black'
                        : 'bg-white/10 hover:bg-white/20 text-gray-400'
                      }`}
                  >
                    S
                  </button>
                  <button
                    onClick={() => handleMute(key)}
                    className={`w-8 h-8 rounded-md text-xs font-bold transition-all ${isMuted
                        ? 'bg-red-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-gray-400'
                      }`}
                  >
                    M
                  </button>
                  <span className="text-xs font-mono w-10 text-right">{level}%</span>
                </div>
              </div>

              {/* Vertical Fader */}
              <div className="relative h-32 bg-white/5 rounded-lg overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all"
                  style={{
                    height: `${level}%`,
                    backgroundColor: color,
                    opacity: isMuted ? 0.3 : 1,
                  }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={level}
                  onChange={(e) => handleLevelChange(key, parseInt(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{
                    writingMode: 'vertical-lr' as any,
                    WebkitAppearance: 'slider-vertical' as any
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="mt-6 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
        <p className="text-xs text-cyan-300">
          💡 Adjust stem levels in real-time. Changes apply to loop export.
        </p>
      </div>
    </div>
  );
}
