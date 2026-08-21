/**
 * Extraction Settings Component
 * Configure sample extraction parameters
 */
import React from 'react';

interface ExtractionSettingsProps {
  barCount: number;
  onBarCountChange: (count: number) => void;
  extractStems: boolean;
  onExtractStemsChange: (value: boolean) => void;
  selectedStems: string[];
  onSelectedStemsChange: (stems: string[]) => void;
  sectionPreference: string | null;
  onSectionPreferenceChange: (section: string | null) => void;
  stemsAvailable: boolean;
}

const barOptions = [
  { value: 4, label: '4 bars', duration: '~8s' },
  { value: 8, label: '8 bars', duration: '~16s' },
  { value: 16, label: '16 bars', duration: '~32s' },
  { value: 32, label: '32 bars', duration: '~64s' },
  { value: 64, label: '64 bars', duration: '~128s' },
];

const sectionOptions = [
  { value: null, label: 'Auto (Best)', icon: '✨' },
  { value: 'drop', label: 'Drop', icon: '🔥' },
  { value: 'chorus', label: 'Chorus', icon: '🎵' },
  { value: 'breakdown', label: 'Breakdown', icon: '🌊' },
  { value: 'verse', label: 'Verse', icon: '📝' },
];

const stemOptions = [
  { value: 'drums', label: 'Drums', icon: '🥁' },
  { value: 'bass', label: 'Bass', icon: '🎸' },
  { value: 'vocals', label: 'Vocals', icon: '🎤' },
  { value: 'guitar', label: 'Guitar', icon: '🎸' },
  { value: 'piano', label: 'Piano', icon: '🎹' },
  { value: 'other', label: 'Other', icon: '🎼' },
];

export const ExtractionSettings: React.FC<ExtractionSettingsProps> = ({
  barCount,
  onBarCountChange,
  extractStems,
  onExtractStemsChange,
  selectedStems,
  onSelectedStemsChange,
  sectionPreference,
  onSectionPreferenceChange,
  stemsAvailable,
}) => {
  const toggleStem = (stem: string) => {
    if (selectedStems.includes(stem)) {
      onSelectedStemsChange(selectedStems.filter(s => s !== stem));
    } else {
      onSelectedStemsChange([...selectedStems, stem]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bar Count Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Sample Length
        </label>
        <div className="grid grid-cols-5 gap-2">
          {barOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onBarCountChange(option.value)}
              className={`p-3 rounded-lg border-2 transition-all text-center ${
                barCount === option.value
                  ? 'border-dj-accent bg-dj-accent/10'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className={`font-bold ${barCount === option.value ? 'text-dj-accent' : 'text-white'}`}>
                {option.label}
              </div>
              <div className="text-xs text-gray-500">{option.duration}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Duration is approximate at 120 BPM. Actual duration adapts to track tempo.
        </p>
      </div>

      {/* Section Preference */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Section Preference
        </label>
        <div className="flex flex-wrap gap-2">
          {sectionOptions.map((option) => (
            <button
              key={option.value || 'auto'}
              onClick={() => onSectionPreferenceChange(option.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                sectionPreference === option.value
                  ? 'border-dj-accent bg-dj-accent/10 text-white'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
              }`}
            >
              <span>{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stem Separation */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-300">
            Stem Separation
          </label>
          {!stemsAvailable && (
            <span className="text-xs text-yellow-500">
              ⚠️ Demucs not installed
            </span>
          )}
        </div>
        
        {/* Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => onExtractStemsChange(!extractStems)}
            disabled={!stemsAvailable}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              extractStems && stemsAvailable
                ? 'bg-dj-accent'
                : 'bg-gray-700'
            } ${!stemsAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                extractStems ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={extractStems ? 'text-white' : 'text-gray-400'}>
            Extract stems (6-stem AI separation)
          </span>
        </div>
        
        {/* Stem Selection */}
        {extractStems && stemsAvailable && (
          <div className="grid grid-cols-3 gap-2">
            {stemOptions.map((option) => {
              const isSelected = selectedStems.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => toggleStem(option.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-dj-purple bg-dj-purple/10 text-white'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span>{option.icon}</span>
                  <span className="font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
        
        <p className="mt-3 text-xs text-gray-500">
          Stem separation uses Demucs AI model. Processing may take 1-2 minutes per track on M4 Mini.
        </p>
      </div>
    </div>
  );
};

export default ExtractionSettings;
