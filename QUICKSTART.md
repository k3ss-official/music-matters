# Quickstart — 90 seconds

## 1. Clone & install

```bash
git clone https://github.com/k3ss-official/music-matters.git && cd music-matters
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && pip install demucs
cd ../frontend && npm install
```

## 2. Start

```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8010 --reload

# Terminal 2
cd frontend && npm run dev
```

Open **http://localhost:5173**

## 3. Ingest a track

Type an artist + title in the search bar (e.g. `Bicep - Glue`) and press **Search**.  
The job appears in the Queue panel. Wait for all stages to turn green (~60–120s with Demucs).

## 4. Explore

- Click the track in the Library → waveform loads in the Centre Workspace
- Use **Smart Phrases** buttons to snap the region to a chorus or drop
- Press **Preview** to listen to the region loop
- Click **Save Loop** to store it to the library

## 5. Export to Ableton

With a region selected, click **Export to Ableton (.als)** in the Export panel.  
The `.als` file downloads automatically. Open it in Ableton Live 11+.

## Batch ingest

Click the **Batch** tab in the search panel, paste one query per line, click **Queue**.

## API docs

[http://localhost:8010/api/docs](http://localhost:8010/api/docs)
