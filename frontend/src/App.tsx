import { useState, useEffect } from 'react';
import SearchPanel from './components/SearchPanel';
import WaveformView from './components/WaveformView';
import NeuralMixPanel from './components/NeuralMixPanel';
import LoopControlsPanel from './components/LoopControlsPanel';
import HotCuesPanel from './components/HotCuesPanel';
import ExportPanel from './components/ExportPanel';
import './index.css';

export interface Track {
  id: string;
  artist: string;
  title: string;
  bpm?: number;
  key?: string;
  camelot?: string;
  year?: number;
  audioUrl?: string;
  waveformData?: number[];
  beats?: number[];
  downbeats?: number[];
  duration?: number;
}

export interface Loop {
  id: string;
  startTime: number;
  endTime: number;
  startBeat: number;
  endBeat: number;
  length: number; // in beats
  color: string;
  name?: string;
}

export interface StemLevels {
  drums: number;
  bass: number;
  vocals: number;
  guitar: number;
  piano: number;
  other: number;
}

function App() {
  const [connected, setConnected] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  
  // Loop state
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [loopLength, setLoopLength] = useState<number>(16); // beats
  const [hotCues, setHotCues] = useState<Loop[]>([]);
  const [selectedHotCue, setSelectedHotCue] = useState<string | null>(null);
  
  // Stem levels
  const [stemLevels, setStemLevels] = useState<StemLevels>({
    drums: 100,
    bass: 100,
    vocals: 100,
    guitar: 100,
    piano: 100,
    other: 100,
  });
  const [soloedStem, setSoloedStem] = useState<keyof StemLevels | null>(null);
  const [mutedStems, setMutedStems] = useState<Set<keyof StemLevels>>(new Set());

  // Check backend connection
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentTrack) return;
      
      // Spacebar = play/pause
      if (e.code === 'Space' && !e.target || (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
      
      // Number keys = set loop length (in beats)
      const loopLengths: { [key: string]: number } = {
        'Digit1': 1,
        'Digit2': 2,
        'Digit4': 4,
        'Digit8': 8,
        'Digit6': 16, // 6 key for 16 beats
        'Digit3': 32, // 3 key for 32 beats
      };
      
      if (loopLengths[e.code]) {
        setLoopLength(loopLengths[e.code]);
        if (loopStart !== null) {
          // Auto-set loop end based on new length
          const beatDuration = 60 / (currentTrack.bpm || 120);
          setLoopEnd(loopStart + loopLengths[e.code] * beatDuration);
        }
      }
      
      // I key = set loop in point
      if (e.code === 'KeyI') {
        setLoopStart(currentTime);
        const beatDuration = 60 / (currentTrack.bpm || 120);
        setLoopEnd(currentTime + loopLength * beatDuration);
      }
      
      // O key = set loop out point
      if (e.code === 'KeyO') {
        setLoopEnd(currentTime);
      }
      
      // L key = toggle loop on/off
      if (e.code === 'KeyL') {
        setLoopEnabled(!loopEnabled);
      }
      
      // Arrow keys = move loop
      if (e.code === 'ArrowLeft' && loopStart !== null && loopEnd !== null) {
        const beatDuration = 60 / (currentTrack.bpm || 120);
        setLoopStart(loopStart - beatDuration);
        setLoopEnd(loopEnd - beatDuration);
      }
      if (e.code === 'ArrowRight' && loopStart !== null && loopEnd !== null) {
        const beatDuration = 60 / (currentTrack.bpm || 120);
        setLoopStart(loopStart + beatDuration);
        setLoopEnd(loopEnd + beatDuration);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentTrack, isPlaying, currentTime, loopStart, loopEnd, loopLength, loopEnabled]);

  const handleTrackSelected = async (track: Track) => {
    setLoading(true);
    try {
      // Fetch track details with beat detection
      const res = await fetch(`/api/track/${track.id}/analyze`);
      const data = await res.json();
      
      setCurrentTrack({
        ...track,
        audioUrl: data.audioUrl,
        waveformData: data.waveformData,
        beats: data.beats,
        downbeats: data.downbeats,
        duration: data.duration,
        bpm: data.bpm,
        key: data.key,
      });
      
      // Reset state
      setLoopStart(null);
      setLoopEnd(null);
      setHotCues([]);
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err) {
      console.error('Failed to load track:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLoop = () => {
    if (loopStart === null || loopEnd === null || !currentTrack) return;
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const newLoop: Loop = {
      id: `loop-${Date.now()}`,
      startTime: loopStart,
      endTime: loopEnd,
      startBeat: Math.floor(loopStart / (60 / (currentTrack.bpm || 120))),
      endBeat: Math.floor(loopEnd / (60 / (currentTrack.bpm || 120))),
      length: loopLength,
      color: colors[hotCues.length % colors.length],
      name: `Loop ${hotCues.length + 1}`,
    };
    
    setHotCues([...hotCues, newLoop]);
  };

  const handleLoadHotCue = (loop: Loop) => {
    setLoopStart(loop.startTime);
    setLoopEnd(loop.endTime);
    setLoopLength(loop.length);
    setSelectedHotCue(loop.id);
    setCurrentTime(loop.startTime);
  };

  const handleExport = async (exportStems: boolean, dawTarget?: string) => {
    if (!currentTrack || loopStart === null || loopEnd === null) return;
    
    setProcessing(true);
    try {
      const res = await fetch('/api/loop/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id: currentTrack.id,
          start_time: loopStart,
          end_time: loopEnd,
          export_stems: exportStems,
          stem_levels: exportStems ? stemLevels : undefined,
          daw_target: dawTarget,
        }),
      });
      
      const data = await res.json();
      alert(`Loop exported! Files: ${data.files.join(', ')}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/30 backdrop-blur-lg">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
                🎧 Music Matters
              </h1>
              <p className="text-gray-400 text-sm mt-1">Loop Extraction & Stem Control</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
                <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {currentTrack && (
                <div className="text-sm text-gray-400">
                  {currentTrack.bpm && <span className="mr-4">🥁 {currentTrack.bpm} BPM</span>}
                  {currentTrack.key && <span>🎹 {currentTrack.key}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-6">
        {!currentTrack ? (
          <SearchPanel
            connected={connected}
            loading={loading}
            onTrackSelected={handleTrackSelected}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* Left Panel - Neural Mix */}
            <div className="col-span-3">
              <NeuralMixPanel
                stemLevels={stemLevels}
                setStemLevels={setStemLevels}
                soloedStem={soloedStem}
                setSoloedStem={setSoloedStem}
                mutedStems={mutedStems}
                setMutedStems={setMutedStems}
              />
            </div>

            {/* Center Panel - Waveform & Controls */}
            <div className="col-span-6 space-y-4">
              <WaveformView
                track={currentTrack}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                loopStart={loopStart}
                loopEnd={loopEnd}
                setLoopStart={setLoopStart}
                loopEnabled={loopEnabled}
                hotCues={hotCues}
              />
              
              <LoopControlsPanel
                loopLength={loopLength}
                setLoopLength={setLoopLength}
                loopStart={loopStart}
                loopEnd={loopEnd}
                setLoopStart={setLoopStart}
                setLoopEnd={setLoopEnd}
                loopEnabled={loopEnabled}
                setLoopEnabled={setLoopEnabled}
                currentTime={currentTime}
                track={currentTrack}
                onSaveLoop={handleSaveLoop}
              />
            </div>

            {/* Right Panel - Hot Cues & Export */}
            <div className="col-span-3 space-y-4">
              <HotCuesPanel
                hotCues={hotCues}
                selectedHotCue={selectedHotCue}
                onLoadHotCue={handleLoadHotCue}
                onDeleteHotCue={(id) => setHotCues(hotCues.filter(h => h.id !== id))}
              />
              
              <ExportPanel
                onExport={handleExport}
                processing={processing}
                hasLoop={loopStart !== null && loopEnd !== null}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {(loading || processing) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xl font-semibold">{loading ? 'Loading track...' : 'Processing export...'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
