/**
 * Mashup Scorer Component
 * Calculate and display mashup potential between samples
 */
import React, { useState, useCallback, useMemo } from 'react';

interface Sample {
  id: string;
  source_track: string;
  source_artist: string;
  key: string;
  bpm: number;
  energy_level: number;
  camelot?: string;
  section_type?: string;
}

interface MashupResult {
  track_a: string;
  track_b: string;
  overall_score: number;
  harmonic_score: number;
  bpm_score: number;
  energy_score: number;
  structure_score: number;
  recommendation: string;
  notes: string[];
}

interface Props {
  samples: Sample[];
  onMashupSelect?: (sampleA: Sample, sampleB: Sample, score: MashupResult) => void;
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  excellent: '#4ADE80',
  good: '#A3E635',
  possible: '#FBBF24',
  difficult: '#FB923C',
  avoid: '#F87171',
};

const RECOMMENDATION_EMOJIS: Record<string, string> = {
  excellent: '🔥',
  good: '✨',
  possible: '🤔',
  difficult: '⚠️',
  avoid: '❌',
};

export function MashupScorer({ samples, onMashupSelect }: Props) {
  const [selectedA, setSelectedA] = useState<Sample | null>(null);
  const [selectedB, setSelectedB] = useState<Sample | null>(null);
  const [result, setResult] = useState<MashupResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Calculate mashup score locally (simplified version)
  const calculateMashupScore = useCallback((sampleA: Sample, sampleB: Sample): MashupResult => {
    // Harmonic score based on Camelot compatibility
    const camelotA = sampleA.camelot || getCamelotFromKey(sampleA.key);
    const camelotB = sampleB.camelot || getCamelotFromKey(sampleB.key);
    const harmonicScore = calculateHarmonicScore(camelotA, camelotB);
    
    // BPM score
    const bpmDiff = Math.abs(sampleA.bpm - sampleB.bpm);
    let bpmScore = 100;
    if (bpmDiff > 10) bpmScore = 20;
    else if (bpmDiff > 6) bpmScore = 50;
    else if (bpmDiff > 3) bpmScore = 70;
    else if (bpmDiff > 1) bpmScore = 90;
    
    // Check half/double time
    const ratio = sampleA.bpm / sampleB.bpm;
    if (bpmScore < 50 && (Math.abs(ratio - 2) < 0.1 || Math.abs(ratio - 0.5) < 0.1)) {
      bpmScore = 80;
    }
    
    // Energy score
    const energyDiff = Math.abs(sampleA.energy_level - sampleB.energy_level);
    const energyScore = energyDiff < 0.15 ? 100 : energyDiff < 0.3 ? 80 : 60;
    
    // Structure score (based on section types)
    let structureScore = 70;
    const hasDrop = sampleA.section_type === 'drop' || sampleB.section_type === 'drop';
    const hasBreakdown = sampleA.section_type === 'breakdown' || sampleB.section_type === 'breakdown';
    if (hasDrop) structureScore += 15;
    if (hasBreakdown) structureScore += 10;
    structureScore = Math.min(100, structureScore);
    
    // Overall weighted score
    const overall = (
      harmonicScore * 0.35 +
      bpmScore * 0.30 +
      energyScore * 0.20 +
      structureScore * 0.15
    );
    
    // Generate notes
    const notes: string[] = [];
    if (harmonicScore >= 85) notes.push('Keys are harmonically compatible');
    else if (harmonicScore < 50) notes.push('Keys may clash - use with caution');
    
    if (bpmDiff <= 3) notes.push(`BPM difference: ${bpmDiff.toFixed(1)} (good match)`);
    else notes.push(`BPM difference: ${bpmDiff.toFixed(1)} (adjustment needed)`);
    
    if (energyScore >= 80) notes.push('Energy levels match well');
    if (hasDrop && hasBreakdown) notes.push('Great for drop/breakdown transitions');
    
    // Recommendation
    let recommendation: string;
    if (overall >= 85) recommendation = 'excellent';
    else if (overall >= 70) recommendation = 'good';
    else if (overall >= 50) recommendation = 'possible';
    else if (overall >= 35) recommendation = 'difficult';
    else recommendation = 'avoid';
    
    return {
      track_a: `${sampleA.source_artist} - ${sampleA.source_track}`,
      track_b: `${sampleB.source_artist} - ${sampleB.source_track}`,
      overall_score: overall,
      harmonic_score: harmonicScore,
      bpm_score: bpmScore,
      energy_score: energyScore,
      structure_score: structureScore,
      recommendation,
      notes
    };
  }, []);
  
  const handleCalculate = useCallback(() => {
    if (!selectedA || !selectedB) return;
    
    setIsCalculating(true);
    
    // Simulate async for UI feedback
    setTimeout(() => {
      const mashupResult = calculateMashupScore(selectedA, selectedB);
      setResult(mashupResult);
      setIsCalculating(false);
      onMashupSelect?.(selectedA, selectedB, mashupResult);
    }, 300);
  }, [selectedA, selectedB, calculateMashupScore, onMashupSelect]);
  
  // Matrix view for all combinations
  const compatibilityMatrix = useMemo(() => {
    if (samples.length < 2) return null;
    
    const matrix: { a: Sample; b: Sample; score: number }[] = [];
    
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const score = calculateMashupScore(samples[i], samples[j]);
        matrix.push({
          a: samples[i],
          b: samples[j],
          score: score.overall_score
        });
      }
    }
    
    // Sort by score descending
    matrix.sort((a, b) => b.score - a.score);
    
    return matrix.slice(0, 10); // Top 10 combinations
  }, [samples, calculateMashupScore]);
  
  if (samples.length < 2) {
    return (
      <div className="card p-6 text-center text-gray-500">
        <div className="text-4xl mb-2">🎚️</div>
        <p>Need at least 2 samples to calculate mashup potential</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Mashup Potential</h3>
          <p className="text-sm text-gray-500">Find compatible samples for mixing</p>
        </div>
      </div>
      
      {/* Sample Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Sample A</label>
          <select
            value={selectedA?.id || ''}
            onChange={(e) => {
              const sample = samples.find(s => s.id === e.target.value);
              setSelectedA(sample || null);
              setResult(null);
            }}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-dj-accent focus:outline-none"
          >
            <option value="">Select sample...</option>
            {samples.map(s => (
              <option key={s.id} value={s.id}>
                {s.source_artist} - {s.source_track}
              </option>
            ))}
          </select>
          
          {selectedA && (
            <div className="mt-2 p-2 bg-gray-800/50 rounded text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Key:</span>
                <span className="text-white">{selectedA.key}</span>
                <span className="text-gray-400">BPM:</span>
                <span className="text-white">{selectedA.bpm.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Sample B</label>
          <select
            value={selectedB?.id || ''}
            onChange={(e) => {
              const sample = samples.find(s => s.id === e.target.value);
              setSelectedB(sample || null);
              setResult(null);
            }}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-dj-accent focus:outline-none"
          >
            <option value="">Select sample...</option>
            {samples.filter(s => s.id !== selectedA?.id).map(s => (
              <option key={s.id} value={s.id}>
                {s.source_artist} - {s.source_track}
              </option>
            ))}
          </select>
          
          {selectedB && (
            <div className="mt-2 p-2 bg-gray-800/50 rounded text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Key:</span>
                <span className="text-white">{selectedB.key}</span>
                <span className="text-gray-400">BPM:</span>
                <span className="text-white">{selectedB.bpm.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Calculate Button */}
      <button
        onClick={handleCalculate}
        disabled={!selectedA || !selectedB || isCalculating}
        className="w-full btn-primary py-3"
      >
        {isCalculating ? 'Calculating...' : 'Calculate Mashup Potential'}
      </button>
      
      {/* Result */}
      {result && (
        <div className="p-4 rounded-lg bg-gray-800/50 space-y-4">
          {/* Overall score */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{RECOMMENDATION_EMOJIS[result.recommendation]}</span>
              <div>
                <div className="text-sm text-gray-400">Mashup Potential</div>
                <div 
                  className="text-2xl font-bold"
                  style={{ color: RECOMMENDATION_COLORS[result.recommendation] }}
                >
                  {result.overall_score.toFixed(0)}%
                </div>
              </div>
            </div>
            <div 
              className="px-3 py-1 rounded-full text-sm font-medium capitalize"
              style={{ 
                backgroundColor: `${RECOMMENDATION_COLORS[result.recommendation]}20`,
                color: RECOMMENDATION_COLORS[result.recommendation]
              }}
            >
              {result.recommendation}
            </div>
          </div>
          
          {/* Score breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreBar label="Harmonic" score={result.harmonic_score} color="#8B5CF6" />
            <ScoreBar label="BPM" score={result.bpm_score} color="#3B82F6" />
            <ScoreBar label="Energy" score={result.energy_score} color="#F59E0B" />
            <ScoreBar label="Structure" score={result.structure_score} color="#10B981" />
          </div>
          
          {/* Notes */}
          <div className="space-y-1">
            {result.notes.map((note, i) => (
              <div key={i} className="text-sm text-gray-400 flex items-start gap-2">
                <span className="text-gray-600">•</span>
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Top Compatible Pairs */}
      {compatibilityMatrix && compatibilityMatrix.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Top Compatible Pairs</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {compatibilityMatrix.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded bg-gray-800/30 hover:bg-gray-800/50 cursor-pointer"
                onClick={() => {
                  setSelectedA(item.a);
                  setSelectedB(item.b);
                  const mashupResult = calculateMashupScore(item.a, item.b);
                  setResult(mashupResult);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.a.source_track}</div>
                  <div className="text-xs text-gray-500 truncate">{item.a.source_artist}</div>
                </div>
                <div className="text-gray-500">×</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{item.b.source_track}</div>
                  <div className="text-xs text-gray-500 truncate">{item.b.source_artist}</div>
                </div>
                <div 
                  className="text-sm font-bold w-12 text-right"
                  style={{
                    color: item.score >= 80 ? '#4ADE80' : item.score >= 60 ? '#FBBF24' : '#F87171'
                  }}
                >
                  {item.score.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for score bars
function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{score.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// Helper function to get Camelot from key string
function getCamelotFromKey(key: string): string {
  const CAMELOT_MAP: Record<string, string> = {
    'C major': '8B', 'A minor': '8A',
    'G major': '9B', 'E minor': '9A',
    'D major': '10B', 'B minor': '10A',
    'A major': '11B', 'F# minor': '11A',
    'E major': '12B', 'C# minor': '12A',
    'B major': '1B', 'G# minor': '1A',
    'F# major': '2B', 'D# minor': '2A',
    'Db major': '3B', 'Bb minor': '3A',
    'Ab major': '4B', 'F minor': '4A',
    'Eb major': '5B', 'C minor': '5A',
    'Bb major': '6B', 'G minor': '6A',
    'F major': '7B', 'D minor': '7A',
  };
  
  // Extract key from format like "A minor (8A)"
  if (key.includes('(')) {
    const match = key.match(/\(([^)]+)\)/);
    if (match) return match[1];
  }
  
  return CAMELOT_MAP[key] || '?';
}

// Helper function to calculate harmonic score between two Camelot codes
function calculateHarmonicScore(camelotA: string, camelotB: string): number {
  if (camelotA === '?' || camelotB === '?') return 50;
  if (camelotA === camelotB) return 100;
  
  try {
    const numA = parseInt(camelotA.replace(/[AB]/, ''));
    const letterA = camelotA.includes('A') ? 'A' : 'B';
    const numB = parseInt(camelotB.replace(/[AB]/, ''));
    const letterB = camelotB.includes('A') ? 'A' : 'B';
    
    let diff = (numB - numA + 12) % 12;
    if (diff > 6) diff = 12 - diff;
    
    // Same letter (major/minor family)
    if (letterA === letterB) {
      if (diff <= 1) return 90;
      if (diff === 2) return 50;
      if (diff === 7) return 75; // Energy boost
      return 30;
    }
    
    // Different letter (relative major/minor)
    if (diff === 0) return 85;
    if (diff === 1) return 70;
    return 30;
    
  } catch {
    return 50;
  }
}

export default MashupScorer;
