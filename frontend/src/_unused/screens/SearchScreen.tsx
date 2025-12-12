/**
 * Search Screen - Find that sound in your head
 */
import React, { useState } from 'react';
import { SearchParams } from '../api';

interface Props {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

export function SearchScreen({ onSearch, isLoading }: Props) {
  const [artist, setArtist] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [trackType, setTrackType] = useState('all');
  const [hints, setHints] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!artist.trim()) return;

    onSearch({
      artist: artist.trim(),
      year_from: yearFrom ? parseInt(yearFrom) : undefined,
      year_to: yearTo ? parseInt(yearTo) : undefined,
      track_type: trackType,
      hints: hints.trim()
    });
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">🎧</div>
        <h1 className="text-4xl font-bold text-white mb-2">DJ Library Tool</h1>
        <p className="text-gray-400 text-lg">Find the sound in your head. Grab it. Use it.</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Artist */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Artist
          </label>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="e.g., Disclosure, Fred Again, Peggy Gou..."
            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl 
                       text-white placeholder-gray-500 focus:outline-none focus:ring-2 
                       focus:ring-emerald-500 focus:border-transparent transition-all"
            autoFocus
          />
        </div>

        {/* Year Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              From Year
            </label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="e.g., 2018"
              min="1900"
              max={currentYear}
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl 
                         text-white placeholder-gray-500 focus:outline-none focus:ring-2 
                         focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              To Year
            </label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder={currentYear.toString()}
              min="1900"
              max={currentYear}
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl 
                         text-white placeholder-gray-500 focus:outline-none focus:ring-2 
                         focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Track Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Track Type
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'original', label: 'Originals' },
              { value: 'remix', label: 'Remixes' },
              { value: 'collab', label: 'Collabs' }
            ].map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTrackType(option.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  trackType === option.value
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hints - The Magic Field */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Anything else you remember?
            <span className="text-gray-500 font-normal ml-2">
              (lyrics, vibes, "white label", "that bouncy bassline"...)
            </span>
          </label>
          <textarea
            value={hints}
            onChange={(e) => setHints(e.target.value)}
            placeholder="e.g., 'white label from around 2019, had that deep house vibe with the vocal sample...'"
            rows={3}
            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl 
                       text-white placeholder-gray-500 focus:outline-none focus:ring-2 
                       focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!artist.trim() || isLoading}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 
                     text-white font-bold text-lg rounded-xl
                     hover:from-emerald-600 hover:to-teal-600 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all transform hover:scale-[1.02] active:scale-[0.98]
                     shadow-lg shadow-emerald-500/25"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🔍 Find Tracks
            </span>
          )}
        </button>
      </form>

      {/* Quick Tips */}
      <div className="mt-12 p-6 bg-gray-800/30 rounded-xl border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-400 mb-3">💡 Tips for better results</h3>
        <ul className="text-sm text-gray-500 space-y-2">
          <li>• <strong>Be specific with years</strong> - narrow range = better matches</li>
          <li>• <strong>Use the hints field</strong> - describe the vibe, any lyrics you remember</li>
          <li>• <strong>"White label"</strong> - helps find unreleased/promo tracks</li>
          <li>• <strong>Track type matters</strong> - if you know it's a remix, filter for it</li>
        </ul>
      </div>
    </div>
  );
}
