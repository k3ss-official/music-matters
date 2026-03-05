/**
 * Search Panel Component
 * Artist search with date range and track type filters
 */
import React, { useState, useCallback } from 'react';
import type { Artist, SearchFilters } from '../types';
import { searchArtists } from '../services/api';

interface SearchPanelProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading?: boolean;
}

const trackTypeOptions = [
  { value: 'original', label: 'Original', icon: '🎵' },
  { value: 'remix', label: 'Remix', icon: '🔄' },
  { value: 'collaboration', label: 'Collaboration', icon: '🤝' },
  { value: 'production', label: 'Production', icon: '🎹' },
];

export const SearchPanel: React.FC<SearchPanelProps> = ({
  onSearch,
  isLoading = false,
}) => {
  const [artistQuery, setArtistQuery] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['original', 'remix', 'collaboration', 'production']);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced artist search
  const handleArtistSearch = useCallback(async (query: string) => {
    setArtistQuery(query);
    setSelectedArtist(null);
    
    if (query.length < 2) {
      setArtistSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await searchArtists(query);
      setArtistSuggestions(results.slice(0, 8));
      setShowSuggestions(true);
    } catch (error) {
      console.error('Artist search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectArtist = (artist: Artist) => {
    setSelectedArtist(artist);
    setArtistQuery(artist.name);
    setShowSuggestions(false);
  };

  const handleToggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!artistQuery.trim()) return;
    
    onSearch({
      artist: selectedArtist?.name || artistQuery,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      trackTypes: selectedTypes as any[],
    });
  };

  // Quick date presets
  const setDatePreset = (preset: string) => {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    let from: Date;
    
    switch (preset) {
      case 'year':
        from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '5years':
        from = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        break;
      case '10years':
        from = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
        break;
      case 'all':
        setDateFrom('');
        setDateTo('');
        return;
      default:
        return;
    }
    
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Artist Search */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Artist Name
        </label>
        <div className="relative">
          <input
            type="text"
            value={artistQuery}
            onChange={(e) => handleArtistSearch(e.target.value)}
            onFocus={() => artistSuggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search for an artist..."
            className="input w-full text-lg"
            autoComplete="off"
          />
          
          {/* Search icon or spinner */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-dj-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <SearchIcon className="w-5 h-5 text-gray-500" />
            )}
          </div>
          
          {/* Suggestions dropdown */}
          {showSuggestions && artistSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {artistSuggestions.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => handleSelectArtist(artist)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors text-left"
                >
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {artist.name}
                    </div>
                    {artist.genres.length > 0 && (
                      <div className="text-sm text-gray-400 truncate">
                        {artist.genres.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Selected artist info */}
        {selectedArtist && (
          <div className="mt-2 flex items-center gap-2 text-sm text-dj-accent">
            <CheckIcon className="w-4 h-4" />
            Selected: {selectedArtist.name}
          </div>
        )}
      </div>
      
      {/* Date Range */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Date Range
        </label>
        
        {/* Quick presets */}
        <div className="flex gap-2 mb-3">
          {[
            { value: 'year', label: 'Last Year' },
            { value: '5years', label: 'Last 5 Years' },
            { value: '10years', label: 'Last 10 Years' },
            { value: 'all', label: 'All Time' },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setDatePreset(preset.value)}
              className="px-3 py-1 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
        
        {/* Custom date inputs */}
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input w-full"
            />
            <span className="text-xs text-gray-500 mt-1">From</span>
          </div>
          <div className="flex items-center text-gray-500">→</div>
          <div className="flex-1">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input w-full"
            />
            <span className="text-xs text-gray-500 mt-1">To</span>
          </div>
        </div>
      </div>
      
      {/* Track Types */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Track Types
        </label>
        <div className="grid grid-cols-2 gap-2">
          {trackTypeOptions.map((option) => {
            const isSelected = selectedTypes.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleToggleType(option.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-dj-accent bg-dj-accent/10 text-white'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="text-lg">{option.icon}</span>
                <span className="font-medium">{option.label}</span>
                {isSelected && (
                  <CheckIcon className="w-4 h-4 ml-auto text-dj-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Submit Button */}
      <button
        type="submit"
        disabled={!artistQuery.trim() || isLoading || selectedTypes.length === 0}
        className="btn-primary w-full py-3 text-lg flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <SearchIcon className="w-5 h-5" />
            Find Tracks
          </>
        )}
      </button>
    </form>
  );
};

// Icons
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default SearchPanel;
