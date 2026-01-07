# Phase 1: Loop Extraction MVP

**Status:** 🚧 In Development  
**Timeline:** Weekend Build (12-18 hours)  
**Goal:** Functional loop extraction tool with essential features only

---

## 🎯 Scope

### Core Features
1. **Input Methods**
   - Search by artist/track name
   - Direct URL input (YouTube, SoundCloud, Bandcamp)

2. **Track Processing**
   - Download best quality audio via yt-dlp
   - BPM detection using librosa
   - Beatgrid mapping with downbeat detection
   - Waveform generation for visualization

3. **Loop Selection UI**
   - Waveform display with beat markers
   - Click/scrub to set loop start position
   - Keyboard shortcuts for loop length:
     - Press `1` = 1 bar
     - Press `4` = 4 bars
     - Press `8` = 8 bars
     - Press `16` = 16 bars
     - Press `32` = 32 bars
   - Visual loop region overlay
   - Beat-aligned snapping

4. **Export Options**
   - Full mix loop (24-bit WAV)
   - 6-stem separation (drums, bass, vocals, guitar, piano, other)
   - Save to `~/Sound_Bank/Artist - Track/`

---

## 🚫 Out of Scope (Phase 1)

- ❌ Real-time loop preview while scrubbing (Phase 1.5)
- ❌ Multiple loops per track (Phase 1.5)
- ❌ Semantic search ("find bass sounds") - Phase 2
- ❌ Boolean search - Phase 2
- ❌ Audio fingerprinting - Phase 2
- ❌ Mashup scoring - Never
- ❌ DAW export (Rekordbox/Serato) - Never
- ❌ Library management - Never
- ❌ Cloud sync - Never
- ❌ User authentication - Never

---

## 🏗️ Technical Implementation

### Backend Services (Keep)
- ✅ `search/download_service.py` - yt-dlp wrapper
- ✅ `search/metadata_service.py` - MusicBrainz/Spotify search
- ✅ `search/track_finder.py` - Track discovery
- ✅ `analysis/audio_analyzer.py` - BPM/beatgrid detection
- ✅ `processing/stem_separator.py` - Demucs integration
- ✅ `processing/sample_extractor.py` - Loop extraction logic
- 🆕 `processing/loop_extractor.py` - NEW: Beat-aligned loop extraction

### Backend Services (Remove)
- ❌ `analysis/harmonic_mixer.py` - Camelot wheel
- ❌ `analysis/sota_analyzer.py` - Advanced structure analysis
- ❌ `fingerprint/audio_fingerprint.py` - Fingerprinting
- ❌ `export/daw_exporter.py` - DAW export
- ❌ `library.py` - Library management
- ❌ `pipeline.py` - Job orchestration
- ❌ `registry.py` - Service registry

### API Endpoints (Phase 1)
```
GET  /api/health                    # Health check
POST /api/search                    # Search for tracks
POST /api/analyze                   # Analyze track (BPM/beatgrid)
POST /api/loop/extract              # Extract loop
  {
    "track_id": "...",
    "start_beat": 32,
    "length_bars": 4,
    "export_stems": true
  }
GET  /api/audio/{file}              # Stream audio files
```

### Frontend Components (Phase 1)
```
src/
├── App.tsx                         # Main app
├── components/
│   ├── SearchInput.tsx             # Search/URL input
│   ├── TrackInfo.tsx               # Track metadata display
│   ├── Waveform.tsx                # Waveform with beat grid
│   ├── LoopControls.tsx            # Loop selection UI
│   └── ExportPanel.tsx             # Export options
└── api.ts                          # API client
```

---

## 📋 Development Checklist

### Backend
- [ ] Simplify `audio_analyzer.py` to only BPM + beatgrid
- [ ] Create `loop_extractor.py` for beat-aligned extraction
- [ ] Update API routes (remove bloat endpoints)
- [ ] Test download → analyze → extract pipeline
- [ ] Verify Demucs stem separation works

### Frontend
- [ ] Build `SearchInput` component (search + URL input)
- [ ] Build `Waveform` component with beat markers
- [ ] Build `LoopControls` component (keyboard shortcuts)
- [ ] Implement beat-aligned snapping
- [ ] Add visual loop region overlay
- [ ] Build `ExportPanel` (full mix vs stems)
- [ ] Wire up API calls

### Integration
- [ ] Test end-to-end workflow
- [ ] Verify beat alignment accuracy
- [ ] Test stem separation quality
- [ ] Validate file output structure

---

## 🎨 UI/UX Design

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Music Matters - Loop Extraction                        │
├─────────────────────────────────────────────────────────┤
│  Search: [Artist or Track Name]  OR  URL: [Paste URL]  │
│  [Search] [Analyze]                                     │
├─────────────────────────────────────────────────────────┤
│  Track: Artist - Track Name                             │
│  BPM: 128  Key: Am  Duration: 3:45                      │
├─────────────────────────────────────────────────────────┤
│  Waveform:                                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ [====|====|====|====|====|====|====|====]         │  │
│  │      ^                  ^                         │  │
│  │   Start (beat 16)    End (beat 32)                │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Loop: 4 bars (16 beats)                                │
│  Press 1, 4, 8, 16, 32 to set loop length              │
├─────────────────────────────────────────────────────────┤
│  Export:  ○ Full Mix  ○ Stems (6)                      │
│  [Save to Sound Bank]                                   │
└─────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts
- `1` = 1 bar loop
- `2` = 2 bars
- `4` = 4 bars
- `8` = 8 bars
- `16` = 16 bars
- `32` = 32 bars
- `Space` = Play/Pause
- `←` / `→` = Scrub backward/forward (1 beat)
- `Shift + ←` / `→` = Scrub backward/forward (1 bar)

---

## 🧪 Testing Plan

### Manual Testing
1. Search for track → verify results
2. Paste YouTube URL → verify download
3. Analyze track → verify BPM detection
4. Set loop start → verify beat alignment
5. Press number key → verify loop region
6. Export full mix → verify output file
7. Export stems → verify 6 files created

### Edge Cases
- Invalid URL
- Track not found
- BPM detection failure
- Very short tracks (<1 minute)
- Very long tracks (>10 minutes)

---

## 📦 Dependencies

### Python (backend/requirements.txt)
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
librosa>=0.10.0
soundfile>=0.12.0
numpy>=1.24.0
yt-dlp>=2023.10.0
httpx>=0.25.0
musicbrainzngs>=0.7.1
spotipy>=2.23.0
python-dotenv>=1.0.0
```

### Node.js (frontend/package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.x",
    "wavesurfer.js": "^7.4.0"
  },
  "devDependencies": {
    "vite": "^5.4.21",
    "typescript": "^5.x",
    "tailwindcss": "^3.x"
  }
}
```

---

## 🚀 Success Criteria

Phase 1 is complete when:
- ✅ User can search or paste URL
- ✅ Track downloads and analyzes automatically
- ✅ Waveform displays with beat markers
- ✅ User can set loop start by clicking
- ✅ User can set loop length by pressing number keys
- ✅ Loop region is beat-aligned
- ✅ Export creates files in `~/Sound_Bank/`
- ✅ Stem separation works (optional)
- ✅ No crashes or errors in happy path

---

## 🔜 Phase 1.5 (Optional Enhancement)

If Phase 1 completes early, add:
- Real-time loop preview (plays the loop region)
- Multiple loops per track (loop_001, loop_002, etc.)
- Waveform zoom controls
- Fine-tune loop boundaries (adjust by 1/4 beat)

---

**Phase 1 Focus:** Get the core loop extraction workflow working. No bells and whistles. Just functional, fast, and reliable.
