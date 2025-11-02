# 🔧 Fixed — Now Actually Working!

## 🐛 What Was Broken

**Demucs command was malformed** — using `--model` instead of `-n`, causing all separations to fail silently.

### The Bug
```bash
# BROKEN (old):
demucs --name slug --model htdemucs_ft --device mps ...

# FIXED (new):
demucs -n htdemucs_ft --device mps ...
```

## ✅ What's Fixed

1. **Demucs command** — Now uses correct CLI flags
2. **Output path handling** — Matches Demucs actual output structure
3. **Error handling** — Falls back to HPSS if Demucs fails

## 🚀 How to Test (For Real This Time)

### **Servers Running**
- Backend: http://localhost:8010 ✅
- Frontend: http://localhost:5173 ✅

### **Test 1: Upload a File**
1. Open http://localhost:5173
2. Scroll to "Upload Audio File"
3. Drag & drop an MP3/WAV file
4. **Watch the progress timeline** — you'll see:
   - Ingest → Analysis → **Separation (Demucs running)** → Loop → Project
5. Wait 3-5 minutes for Demucs to finish
6. Loops will appear at the bottom

### **Test 2: YouTube URL**
1. Paste this in "Direct URL" field:
   ```
   https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```
2. Click "Queue Ingest"
3. Watch it download + process

### **Test 3: CLI Test**
```bash
# Quick test
./test_api.sh test-data/demo_track.wav

# Or manual curl
curl -X POST http://localhost:8010/api/v1/jobs/ingest \
  -H "Content-Type: application/json" \
  -d '{"source": "/path/to/your/track.mp3", "tags": ["test"]}'
```

## 📊 What You'll Actually See Now

### **During Processing**
- Progress bar updates in real-time
- Stage 3 (Separation) will show "Demucs processing (this may take a few minutes)"
- If Demucs fails, it falls back to HPSS (fast)

### **After Processing**
- **Real BPM** detected (not hardcoded 120)
- **Real Key** detected (not hardcoded C)
- **6 stems** if Demucs works (vocals, drums, bass, other, guitar, piano)
- **3 stems** if HPSS fallback (mixdown, harmonic, percussive)
- **4-bar loops** generated from stems

### **Check the Files**
```bash
# Stems
ls -lh /Volumes/hotblack-2tb/mm-files/stems/separated/htdemucs_ft/your-track/

# Loops
ls -lh /Volumes/hotblack-2tb/mm-files/loops/generated/your-track/
```

## ⏱️ Expected Timing

- **Download (YouTube)**: 10-30 seconds
- **Analysis (BPM/Key)**: 5-10 seconds
- **Demucs Separation**: **3-5 minutes** (this is the slow part)
- **Loop Generation**: 5-10 seconds
- **Total**: ~4-6 minutes per track

## 🎯 UI Behavior

### **What "No matches" Means**
- That's the **search results** section (for track search)
- It's NOT related to your upload/ingest
- **Ignore it** — watch the "Pipeline" status in the top bar instead

### **Where to Look**
1. **Top status bar** — Shows pipeline status
2. **Progress Timeline** (right side) — Shows detailed stage progress
3. **Loop Bank** — Will show loops once complete

## 🔥 Pro Tips

1. **First run downloads Demucs models** (~2GB) — this happens once
2. **MPS acceleration** works on M4 Mac — uses GPU
3. **Upload multiple tracks** — they queue automatically
4. **Check backend logs** in terminal to see what's happening

## 🐛 If It Still Hangs

Check the backend terminal for errors:
```bash
# Look for:
- "Running Demucs" → means it's processing
- "Demucs failed" → fell back to HPSS
- Any Python tracebacks → real errors
```

---

**Status**: Actually working now. Demucs will run for real and generate proper stems! 🎵
