# Phase 2: Semantic Sound Search

**Status:** 📋 Planned  
**Prerequisites:** Phase 1 complete  
**Timeline:** TBD  
**Goal:** Search for specific sounds across your sound bank

---

## 🎯 Vision

Instead of searching by artist/track, search by **sound characteristics**:

- "Find bass sounds"
- "Find kick drums"
- "Find melodic loops"
- "Find energetic drops"
- "Find vocal chops"

Boolean search:
- "kick AND snare"
- "bass OR sub"
- "vocal NOT rap"

---

## 🔍 Features

### 1. Semantic Search
- Natural language queries: "find bass sounds"
- Audio embeddings (CLAP or similar)
- Similarity matching
- Confidence scores

### 2. Boolean Search
- Logical operators: AND, OR, NOT
- Tag-based filtering
- Multi-dimensional search

### 3. Sound Bank Indexing
- Automatic indexing of all loops in `~/Sound_Bank/`
- Extract audio features (spectral, temporal, harmonic)
- Generate embeddings for similarity search
- Tag generation (automatic or manual)

### 4. Audio Fingerprinting
- Spectral peak extraction
- Constellation map generation
- Duplicate detection
- Similar sound finder

### 5. Advanced Filtering
- BPM range
- Key/scale
- Energy level
- Duration
- Instrument type
- Genre tags

---

## 🏗️ Technical Implementation

### Backend Services (New)
- `fingerprint/audio_fingerprint.py` - Audio fingerprinting
- `search/semantic_search.py` - Embedding-based search
- `search/indexer.py` - Sound bank indexing
- `analysis/feature_extractor.py` - Audio feature extraction
- `analysis/tagger.py` - Automatic tag generation

### API Endpoints (Phase 2)
```
POST /api/search/semantic              # Semantic search
  {
    "query": "find bass sounds",
    "filters": {
      "bpm_min": 120,
      "bpm_max": 140,
      "key": "Am"
    }
  }

POST /api/search/boolean               # Boolean search
  {
    "query": "kick AND snare",
    "filters": {}
  }

POST /api/index/scan                   # Index sound bank
GET  /api/index/status                 # Indexing status

POST /api/fingerprint/generate         # Generate fingerprint
POST /api/fingerprint/compare          # Compare two sounds
POST /api/fingerprint/find-similar     # Find similar sounds
```

### Frontend Components (Phase 2)
```
src/
├── components/
│   ├── SemanticSearch.tsx             # Natural language search
│   ├── BooleanSearch.tsx              # Boolean query builder
│   ├── FilterPanel.tsx                # Advanced filters
│   ├── SoundBankBrowser.tsx           # Browse indexed sounds
│   ├── SimilarityResults.tsx          # Similar sound results
│   └── TagEditor.tsx                  # Manual tag editing
```

---

## 🧠 Machine Learning

### Audio Embeddings
**Option 1: CLAP (Contrastive Language-Audio Pretraining)**
- Pre-trained model for audio-text matching
- Natural language queries
- Zero-shot classification

**Option 2: VGGish**
- Pre-trained on AudioSet
- 128-dimensional embeddings
- Good for similarity search

**Option 3: Custom Model**
- Train on DJ/producer-specific dataset
- Fine-tuned for loop/sample classification

### Feature Extraction
- **Spectral features**: MFCC, spectral centroid, rolloff
- **Temporal features**: Zero-crossing rate, tempo
- **Harmonic features**: Chroma, key, chord progression
- **Timbral features**: Brightness, roughness, warmth

### Similarity Metrics
- Cosine similarity (embeddings)
- Euclidean distance (features)
- Dynamic Time Warping (temporal alignment)

---

## 📊 Indexing Strategy

### Sound Bank Structure
```
~/Sound_Bank/
├── Artist - Track/
│   ├── loop_001.wav
│   ├── loop_002.wav
│   └── stems/
│       ├── drums.wav
│       ├── bass.wav
│       └── ...
└── .index/
    ├── metadata.db                    # SQLite database
    ├── embeddings.npy                 # Numpy array of embeddings
    └── features.json                  # Extracted features
```

### Metadata Database Schema
```sql
CREATE TABLE loops (
    id INTEGER PRIMARY KEY,
    file_path TEXT,
    track_name TEXT,
    artist TEXT,
    bpm REAL,
    key TEXT,
    duration REAL,
    energy REAL,
    tags TEXT,  -- JSON array
    embedding_id INTEGER,
    created_at TIMESTAMP
);

CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY,
    loop_id INTEGER,
    embedding BLOB,  -- Serialized numpy array
    model_version TEXT
);
```

---

## 🔧 Tech Stack (Phase 2)

### New Dependencies
```
# Machine Learning
torch>=2.0.0
transformers>=4.30.0
laion-clap>=1.0.0  # or alternative

# Vector Search
faiss-cpu>=1.7.4  # or faiss-gpu
annoy>=1.17.0

# Database
sqlalchemy>=2.0.0
alembic>=1.11.0

# Feature Extraction
essentia>=2.1b6
madmom>=0.16.1
```

---

## 🎨 UI/UX Design (Phase 2)

### Semantic Search View
```
┌─────────────────────────────────────────────────────────┐
│  Search Sound Bank                                      │
├─────────────────────────────────────────────────────────┤
│  Query: [find bass sounds]                              │
│                                                         │
│  Filters:                                               │
│  BPM: [120] - [140]                                     │
│  Key: [Any ▼]                                           │
│  Energy: [●●●○○]                                        │
│                                                         │
│  [Search]                                               │
├─────────────────────────────────────────────────────────┤
│  Results (12 found):                                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Artist - Track / loop_001.wav                   │   │
│  │ BPM: 128  Key: Am  Energy: ●●●●○                │   │
│  │ Tags: bass, sub, deep                           │   │
│  │ Confidence: 95%                                 │   │
│  │ [Play] [Add to Project]                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Artist 2 - Track 2 / loop_003.wav               │   │
│  │ ...                                             │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Development Checklist (Phase 2)

### Backend
- [ ] Implement audio fingerprinting
- [ ] Integrate CLAP or alternative embedding model
- [ ] Build sound bank indexer
- [ ] Create feature extraction pipeline
- [ ] Implement vector search (FAISS)
- [ ] Build semantic search API
- [ ] Build boolean search API
- [ ] Add automatic tagging

### Frontend
- [ ] Build semantic search UI
- [ ] Build boolean query builder
- [ ] Build filter panel
- [ ] Build sound bank browser
- [ ] Add similarity visualization
- [ ] Add tag editor

### Integration
- [ ] Test indexing performance (1000+ loops)
- [ ] Validate search accuracy
- [ ] Benchmark query speed
- [ ] Test similarity matching

---

## 🧪 Testing Plan (Phase 2)

### Semantic Search Accuracy
- Query: "find bass sounds" → should return bass-heavy loops
- Query: "find vocal chops" → should return vocal samples
- Query: "find energetic drops" → should return high-energy sections

### Boolean Search Logic
- "kick AND snare" → both present
- "bass OR sub" → either present
- "vocal NOT rap" → vocal but not rap vocals

### Performance
- Index 1000 loops in <5 minutes
- Search query response <500ms
- Similarity search <1 second

---

## 🚀 Success Criteria (Phase 2)

Phase 2 is complete when:
- ✅ Sound bank is automatically indexed
- ✅ Semantic search returns relevant results
- ✅ Boolean search works correctly
- ✅ Similarity matching is accurate
- ✅ Search is fast (<500ms)
- ✅ Tags are automatically generated
- ✅ UI is intuitive and responsive

---

## 🔮 Future Enhancements (Phase 3?)

- AI-powered loop generation
- Style transfer (apply style of one loop to another)
- Automatic mashup suggestions
- Collaborative sound bank sharing
- Cloud sync for sound bank
- Mobile app for browsing sound bank

---

**Phase 2 Focus:** Make finding the right sound as easy as describing it. No more digging through folders—just ask for what you need.
