PLAN.md
1. **Step 1: SQLite Persistence Storage (~100 Credits)**
   - **Goal:** Replace volatile [_tracks](cci:1://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/pipeline.py:596:4-603:9) dictionary with an SQLite backend to survive daemon restarts, persisting track definitions and processing stages.
   - **Files to touch:**
     - `backend/app/models/base.py` (new)
     - `backend/app/services/db.py` (new)
     - [backend/app/services/pipeline.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/pipeline.py:0:0-0:0) (update pipeline hooks to write/read DB)
     - [backend/app/main.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/main.py:0:0-0:0) (add startup DB init)
2. **Step 2: Basic Text Search Implementation (~50 Credits)**
   - **Goal:** Un-stub [SearchIngest.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/SearchIngest.tsx:0:0-0:0) to intercept non-URL text and hit the backend. Route text queries under the hood using `ytsearch:` in `yt-dlp` to grab the top result.
   - **Files to touch:**
     - [frontend/src/components/SearchIngest.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/SearchIngest.tsx:0:0-0:0) (wire input to new search API format)
     - [backend/app/api/routes/ingest.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/api/routes/ingest.py:0:0-0:0) (accept generic text payload)
     - [backend/app/services/pipeline.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/pipeline.py:0:0-0:0) (modify downloader to parse `ytsearch1:` params)
3. **Step 3: Interactive Smart Regions Selector (~120 Credits)**
   - **Goal:** Upgrade [WaveformCanvas](cci:1://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/WaveformCanvas.tsx:14:0-130:1) + [CentreWorkspace](cci:1://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/CentreWorkspace.tsx:19:0-122:1) with two-way regions selection, precise tempo-synced grid snapping, live loop previews, and a "Save Loop" executor.
   - **Files to touch:**
     - [frontend/src/components/WaveformCanvas.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/WaveformCanvas.tsx:0:0-0:0) (inject RegionsPlugin drag events + snap logic)
     - [frontend/src/components/CentreWorkspace.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/CentreWorkspace.tsx:0:0-0:0) (state propagation for start/end bars)
     - [frontend/src/components/LoopEditorToolbar.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/LoopEditorToolbar.tsx:0:0-0:0) (wire the 'Save' callback to backend export)
4. **Step 4: Smart Phrase Auto-Snap Engine (~150 Credits)**
   - **Goal:** Build the "Traktor" macro-logic. Utilize existing librosa beats/onset arrays to calculate phrase density peaks (drops/choruses) and pass exact anchor points to the UI for instant 16-bar mapping.
   - **Files to touch:**
     - `backend/app/services/analyzer.py` (add `detect_smart_phrases` calculating energy + downbeats)
     - [backend/app/api/routes/library.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/api/routes/library.py:0:0-0:0) (expose the smart array)
     - [frontend/src/components/CentreWorkspace.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/CentreWorkspace.tsx:0:0-0:0) (map markers dynamically to the UI)
5. **Step 5: Ableton (.als) Export Builder (~100 Credits)**
   - **Goal:** Construct a raw XML packager assembling the extracted chunked stems horizontally across an 8x8 Live Session grid format, zipped into an `.als`.
   - **Files to touch:**
     - `backend/app/services/ableton_exporter.py` (new XML builder daemon)
     - [backend/app/api/routes/export.py](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/api/routes/export.py:0:0-0:0) (new route for ZIP/ALS dispatch)
     - [frontend/src/components/ExportPanel.tsx](cci:7://file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/components/ExportPanel.tsx:0:0-0:0) (add Ableton button)
6. **Step 6: End-to-End Validation & Commit (~30 Credits)**
   - **Goal:** Run `ytsearch` ingest, snap a Smart Region, export as Ableton, and ensure no crashes on daemon restart. Commit explicitly.
   - **Files to touch:** None (Browser tests + bash `git commit`).