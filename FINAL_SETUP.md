# ✅ Final Setup — 6-Stem Demucs + Clean Directory Structure

## 🎯 What's Configured

### **6-Stem Demucs Model**
- Model: `htdemucs_6s` (6 stems instead of 4)
- Stems: **vocals, drums, bass, other, guitar, piano**
- Device: MPS (Apple Silicon GPU)
- Processing time: 3-5 minutes per track

### **Clean Directory Structure**
```
/Volumes/hotblack-2tb/music-matters/
├── 0-cache/          # Metadata, logs, fingerprints
├── 1-downloads/      # YouTube/uploaded files
├── 2-stems/          # Demucs 6-stem output
├── 3-loops/          # Generated loops
└── 4-projects/       # FL Studio templates
```

Numbered prefixes show the pipeline flow clearly!

## 🚀 How to Use

### **1. Start Both Servers**

**Terminal 1 - Backend:**
```bash
cd /Volumes/deep-1t/Users/k3ss/projects/music-matters
conda activate music
uvicorn app.main:app --reload --port 8010
```

**Terminal 2 - Frontend:**
```bash
cd /Volumes/deep-1t/Users/k3ss/projects/music-matters/frontend
npm run dev
```

### **2. Open the UI**
http://localhost:5173

### **3. Upload a Track**
- Drag & drop an audio file
- OR paste a YouTube URL
- OR click to browse files

### **4. Watch Progress**
**Right sidebar shows:**
```
🔄 PROCESSING: Separation
Stage 3 of 5 • 60% complete
Demucs processing (this may take a few minutes)
```

### **5. Check Output**
After 3-5 minutes:
```bash
# 6 stems
ls -lh /Volumes/hotblack-2tb/music-matters/2-stems/htdemucs_6s/your-track/
# vocals.wav, drums.wav, bass.wav, other.wav, guitar.wav, piano.wav

# Loops
ls -lh /Volumes/hotblack-2tb/music-matters/3-loops/your-track/
```

## 🔧 If You Get 500 Errors

### **Cause**
Backend was down when frontend tried to connect.

### **Fix**
1. Make sure backend is running: `curl http://localhost:8010/health`
2. Refresh the frontend page: http://localhost:5173
3. Try uploading again

### **Test Backend Directly**
```bash
curl -X POST http://localhost:8010/api/v1/jobs/ingest \
  -H "Content-Type: application/json" \
  -d '{"source": "/path/to/track.mp3", "tags": ["test"]}'
```

Should return:
```json
{"job_id":"...","track_id":"...","stage":"queued"}
```

## 📊 What You Get

### **Full Pipeline**
1. **Ingest** (10s) — Download/copy file
2. **Analysis** (10s) — Real BPM + key detection
3. **Separation** (3-5 min) — **6-stem Demucs**
4. **Loop Slicing** (10s) — 4-bar loops
5. **Project Assembly** (5s) — FL Studio scaffold

### **6 High-Quality Stems**
- vocals.wav
- drums.wav
- bass.wav
- other.wav
- guitar.wav
- piano.wav

### **Visual Progress**
- Big colored status banners
- Real-time progress updates
- Stage-by-stage progress bars
- Detailed status messages

## 🎵 Ready to Use!

Both servers running:
- Backend: http://localhost:8010 ✅
- Frontend: http://localhost:5173 ✅

Upload a track and get 6 professional-quality stems! 🔥

---
**Note**: First run downloads the htdemucs_6s model (~2GB) — this happens once.
