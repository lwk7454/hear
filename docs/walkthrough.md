# Verification Walkthrough

## 1. Start Full Stack
Run the standard dev command (now pure Node.js):
```bash
pnpm dev
```

## 2. Verify Ingestion
1. Open http://localhost:3000/creator
2. Enter a dummy YouTube URL (e.g. `https://youtube.com/watch?v=123`).
3. Click **Ingest & Train**.
4. **Validation**: 
    - UI shows "Analyzing Transcript..."
    - Server logs show `[Brain] Processing ...`
    - After ~1.5s, UI shows "Authentic & Grounded" (Data returned from Node.js).

## 3. Verify Voice
1. Open http://localhost:3000
2. Chat still works via WebSocket.
