# 🔄 Handover: Enhanced UI with Track History & Processing Options

## ✅ What's Already Working

**Backend:**
- 6-stem Demucs separation (vocals, drums, bass, other, guitar, piano)
- Real BPM/key detection
- File upload API (`POST /api/v1/jobs/upload`)
- URL ingest API (`POST /api/v1/jobs/ingest`)
- Track listing API (`GET /api/v1/library/tracks`)
- Clean directory structure (0-cache, 1-downloads, 2-stems, 3-loops, 4-projects)
- CORS enabled
- Git committed and pushed

**Frontend:**
- Basic upload working
- Progress timeline with visual indicators
- Loop controls
- Search panel

## 🚧 What Needs Completing

### 1. **Integrate UploadPanel Component**

**File:** `/Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/App.tsx`

**What to do:**
- Replace the current `SearchPanel` upload logic with the new `UploadPanel` component
- Add handlers for file upload and URL submit that accept `ProcessingOptions`
- The `UploadPanel` component is already created at `frontend/src/components/UploadPanel.tsx`

**Handler signature:**
```typescript
const handleFileUploadWithOptions = async (file: File, options: ProcessingOptions) => {
  // Upload file with processing options
  // Currently uploadFile() doesn't accept options - you'll need to update the API
};

const handleUrlSubmitWithOptions = async (url: string, options: ProcessingOptions) => {
  // Submit URL with processing options
  // Currently ingestSource() doesn't accept options - you'll need to update the API
};
```

### 2. **Integrate TrackHistory Component**

**File:** `/Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend/src/App.tsx`

**What to do:**
- Add a `useEffect` to load tracks on mount:
```typescript
useEffect(() => {
  const loadTracks = async () => {
    try {
      const trackList = await listTracks();
      setTracks(trackList);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };
  loadTracks();
}, []);
```

- Add handler for track selection:
```typescript
const handleTrackSelect = async (trackId: string) => {
  setActiveTrackId(trackId);
  await loadLoops(trackId, loopLength);
};
```

- Render the component in the layout (probably in the right sidebar or a new section)

### 3. **Update Backend API to Accept Processing Options**

**Files to modify:**
- `app/api/schemas.py` - Add `ProcessingOptions` schema
- `app/api/routes/ingest.py` - Update endpoints to accept options
- `app/services/pipeline.py` - Conditionally skip stages based on options

**Example schema:**
```python
class ProcessingOptions(BaseModel):
    analysis: bool = True
    separation: bool = True
    loop_slicing: bool = True
    mastering: bool = False

class IngestRequest(BaseModel):
    source: str
    tags: list[str] = []
    collection: str | None = None
    options: ProcessingOptions = ProcessingOptions()
```

**Pipeline modification:**
```python
def run_pipeline(self, track_id: str, options: ProcessingOptions):
    stages = []
    if options.analysis:
        stages.append(self._stage_analysis)
    if options.separation:
        stages.append(self._stage_separation)
    if options.loop_slicing:
        stages.append(self._stage_loop)
    # etc...
```

### 4. **Update Frontend API Calls**

**File:** `frontend/src/services/api.ts`

Update these functions to accept and send processing options:
```typescript
export async function uploadFile(file: File, options?: ProcessingOptions): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options) {
    formData.append('options', JSON.stringify(options));
  }
  // ... rest of implementation
}

export async function ingestSource(payload: IngestPayload & { options?: ProcessingOptions }): Promise<IngestResponse> {
  // ... include options in request body
}
```

### 5. **Layout Integration**

**Suggested layout in App.tsx:**
```tsx
<main className="panel-grid">
  <section className="column column--primary">
    <UploadPanel
      onFileUpload={handleFileUploadWithOptions}
      onUrlSubmit={handleUrlSubmitWithOptions}
      loading={loading}
    />
    <LoopControls ... />
  </section>
  
  <aside className="column column--secondary">
    <TrackHistory
      tracks={tracks}
      onTrackSelect={handleTrackSelect}
      selectedTrackId={activeTrackId}
    />
    <ProgressTimeline job={job} />
  </aside>
</main>
```

## 📁 Files Created

**New Components:**
- `frontend/src/components/UploadPanel.tsx` - Upload UI with processing mode selection
- `frontend/src/components/TrackHistory.tsx` - Track history list

**Updated Types:**
- `frontend/src/types.ts` - Added `TrackSummary`, `ProcessingMode`, `ProcessingOptions`

## 🐛 Minor Fixes Needed

1. Remove unused `KeyboardEvent` import from `UploadPanel.tsx` line 1
2. The `UploadPanel` component uses inline event handlers - consider extracting them if needed
3. Add proper error handling for track list loading

## 🎯 Testing Checklist

After integration:
- [ ] Upload file with "Full Pipeline" mode
- [ ] Upload file with "Stems Only" mode
- [ ] Upload file with "Master + Stems" mode
- [ ] Upload file with "Custom" mode (select specific stages)
- [ ] Verify track appears in history
- [ ] Click track in history to load its loops
- [ ] Verify selected track is highlighted
- [ ] Check that processing respects the selected options

## 🚀 Quick Start Commands

```bash
# Backend
cd /Volumes/deep-1t/Users/k3ss/projects/music-matters
conda activate music
uvicorn app.main:app --reload --port 8010

# Frontend
cd frontend
npm run dev
```

## 📝 Notes

- The backend currently processes all stages regardless of options - you need to implement conditional stage execution
- The `mastering` option is new - you'll need to implement a mastering stage if desired
- Track history refreshes on mount but doesn't auto-update when new tracks are added - consider adding polling or WebSocket updates
- Processing options are currently frontend-only - backend needs to be updated to respect them

---

**Current Status:** Components created, types defined, ready for integration into App.tsx and backend API updates.
