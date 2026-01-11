import { useState } from 'react';

interface ExportPanelProps {
  onExport: (exportStems: boolean, dawTarget?: string) => void;
  processing: boolean;
  hasLoop: boolean;
}

export default function ExportPanel({ onExport, processing, hasLoop }: ExportPanelProps) {
  const [exportStems, setExportStems] = useState(false);
  const [dawTarget, setDawTarget] = useState<string>('');
  const [autoOpen, setAutoOpen] = useState(false);

  const handleExport = () => {
    onExport(exportStems, dawTarget || undefined);
  };

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold mb-6">Export</h3>

      {/* Export Mode */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-3">EXPORT MODE</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setExportStems(false)}
            className={`px-4 py-3 rounded-xl font-semibold transition-all ${
              !exportStems
                ? 'bg-cyan-500 text-white'
                : 'bg-white/10 hover:bg-white/20 text-gray-300'
            }`}
          >
            FULL MIX
          </button>
          <button
            onClick={() => setExportStems(true)}
            className={`px-4 py-3 rounded-xl font-semibold transition-all ${
              exportStems
                ? 'bg-cyan-500 text-white'
                : 'bg-white/10 hover:bg-white/20 text-gray-300'
            }`}
          >
            STEMS
          </button>
        </div>
      </div>

      {/* DAW Target */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-3">EXPORT TO DAW (Optional)</p>
        <select
          value={dawTarget}
          onChange={(e) => setDawTarget(e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white"
        >
          <option value="">Sound Bank Only</option>
          <option value="fl_studio">FL Studio</option>
          <option value="ableton">Ableton Live</option>
          <option value="logic">Logic Pro</option>
          <option value="maschine">Maschine</option>
        </select>
      </div>

      {/* Options */}
      {dawTarget && (
        <div className="mb-6">
          <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-all">
            <input
              type="checkbox"
              checked={autoOpen}
              onChange={(e) => setAutoOpen(e.target.checked)}
              className="w-5 h-5 rounded accent-cyan-500"
            />
            <span className="text-sm">Auto-open DAW after export</span>
          </label>
        </div>
      )}

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={!hasLoop || processing}
        className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {processing ? '⏳ Exporting...' : '📥 EXPORT LOOP'}
      </button>

      {/* Info */}
      <div className="mt-6 space-y-3">
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-xs text-green-300">
            <strong>FULL MIX:</strong> Exports loop as single WAV file
          </p>
        </div>
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <p className="text-xs text-purple-300">
            <strong>STEMS:</strong> Exports 6 stems (drums, bass, vocals, guitar, piano, other) with current levels applied
          </p>
        </div>
        {dawTarget && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>DAW EXPORT:</strong> Creates project file and imports stems automatically
            </p>
          </div>
        )}
      </div>

      {/* Output Path */}
      <div className="mt-6 p-3 bg-white/5 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">OUTPUT PATH</p>
        <p className="text-xs font-mono text-gray-300">~/Sound_Bank/</p>
      </div>
    </div>
  );
}
