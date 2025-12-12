# Project Handover Document

## 1. Core Goal: Authorized Multi-Modal Ingestion
*   **Objective**: Comprehensive "Digital Twin" creation via repository scanning.
*   **Permission**: User grants OAuth access to **YouTube** and **Instagram**.
*   **Scan Targets**:
    *   **YouTube**: Videos (Audio/Transcripts), Titles, Descriptions, Comments.
    *   **Instagram**: Images, Text Posts, Comments.
*   **Output**: A dual-training set for Text Persona (DeepSeek) and Voice Model (Tier 1: Higgs V2 / Tier 2: Moshi).

## 2. Technical Stack (Pure TypeScript)
The technical stack is built entirely on Node.js/TypeScript.
*   **Repo**: Monorepo (Turbo + pnpm).
*   **Frontends**: 
    *   `apps/web` - Creator Dashboard (Next.js 15, Tailwind, Shadcn).
    *   `apps/app` - End-User App (Next.js 16, Tailwind, Mobile-First PWA).
*   **Backend**: `apps/server` (Fastify, Node.js).
*   **AI/Logic**: `LangChain.js` (Use **DeepSeek** or **Qwen** adapters, NOT OpenAI).
*   **Ingestion**: `googleapis` (YouTube Data API).
*   **Audio Processing**: `apps/worker` (Python 3.11/FastAPI) handles **Demucs** (Vocals) and **Pyannote** (Diarization).
*   **Voice Training**: Requirement identified for **Moshi Fine-Tuning**, using `apps/worker` or cloud GPU.

## 3. Current Implementation Status

### Creator-Side (`apps/web`)
*   **Creator Dashboard**:
    *   URL: `/creator` (in `apps/web`).
    *   State: **Updated**. Features "Quick Link" (YouTube) and "Authorized Connect" (Instagram). Displays Voice Tier and Engagement Style.
*   **Ingestion Endpoint**:
    *   Route: `POST /ingest/parse` triggers `apps/worker`.
    *   State: **Complete**. `AudioService` downloads via `yt-dlp`. Worker handles Separation/Diarization via GPU.
    *   **Data**: Vocals uploaded to Supabase; Diarization segments stored in `ContentItem.diarization`.

### Consumer-Side (`apps/app`) - NEW
*   **End-User App**:
    *   State: **Scaffolded** (December 2025).
    *   Routes Implemented:
        *   `/` - Home/Discovery page with search and creator catalog
        *   `/login` - Authentication (Google/Meta SSO UI)
        *   `/c/[slug]` - Creator profile with deep linking support
        *   `/chat/[creatorId]` - Chat interface (text + voice modes UI)
    *   **Status**: UI complete, awaiting backend integration
    *   **See**: `docs/app_architecture.md` for detailed specs

## 4. Immediate Next Steps (For Next Agent)

### Backend Integration (Complete)
1.  **Configure Environment**:
    *   Add `OPENAI_BASE_URL` (DeepSeek), `YOUTUBE_CLIENT_ID`, `IG_CLIENT_ID`, `JWT_SECRET`, `COOKIE_SECRET` to `.env`.
2.  **Connect Database** (Completed):
    *   `packages/db` has been linked.
    *   `auth.ts` handles OAuth token storage.
    *   `ingestion.ts` uses stored tokens for scanning.

### End-User App Integration
3.  **Wire Up App APIs**:
    *   Implement `/api/personas` endpoint (list creators)
    *   Implement `/api/chat/:creatorId/messages` (text chat)
    *   Set up WebSocket for real-time messaging
4.  **Setup Authentication**:
    *   Configure Supabase Auth with Google & Meta OAuth
    *   Implement auth callback routes in `apps/app`
5.  **Voice Integration (Phase 2)**:
    *   Voice Tier 1: Connect to Higgs Audio V2
    *   Voice Tier 2: Integrate Moshi WebSocket streaming

## 5. How to Run

### Development
```bash
# Install dependencies
pnpm install

# Run all apps concurrently
pnpm dev

# Or run individually
cd apps/web && pnpm dev    # Creator Dashboard: http://localhost:3000
cd apps/server && pnpm dev # Backend: http://localhost:8000
cd apps/app && pnpm dev    # End-User App: http://localhost:3001

# Start Python Worker (New Terminal)
cd apps/worker
source venv/bin/activate   # (Mac/Linux)
# .\venv\Scripts\Activate  # (Windows)
python main.py             # Worker: http://localhost:8001
```

### Build
```bash
# Build all apps
pnpm build

# Build specific app
pnpm build --filter app
pnpm build --filter web
pnpm build --filter server
```

## 6. Architecture Overview

The platform now has a **two-app architecture**:

| App | Purpose | Users | Tech | Status |
|-----|---------|-------|------|--------|
| `apps/web` | Creator Dashboard | Creators | Next.js 15 | Active |
| `apps/app` | Consumer Experience | Fans | Next.js 16 PWA | Scaffolded |
| `apps/server` | API + Orchestration | Both | Fastify | Active |
| `apps/worker` | AI Processing | Backend | Python 3.11 | Active |

**Voice Tiers**:
- **Tier 1**: Async voice messages (Higgs TTS)
- **Tier 2**: Live duplex conversation (Moshi)

**Key Documents**:
- Creator workflows: `docs/implementation_plan.md`
- End-user flows: `docs/app_architecture.md`
- API specs: See both architecture docs

## 7. What's Left to Build

### Phase 1: Backend Connectivity
- [ ] Implement persona CRUD APIs
- [ ] Set up Supabase Auth
- [ ] Create chat message endpoints
- [ ] WebSocket real-time messaging

### Phase 2: Voice Layer
- [ ] Voice Tier 1: Audio upload/playback
- [ ] Voice Tier 2: WebSocket audio streaming
- [ ] Moshi service integration

### Phase 3: Polish
- [ ] Search and filtering logic
- [ ] Analytics tracking
- [ ] PWA features (offline, notifications)
- [ ] Performance optimization

## 8. Quick Reference

**Current Working Features**:
- ✅ Creator Dashboard UI
- ✅ Ingestion pipeline (YouTube/Instagram) - *Backend Implemented*
- ✅ End-User App UI (all pages)
- ✅ Voice chat UI mockups

**Pending Integration**:
- ⏳ Database persistence (Auth tokens & User Session implemented, Content storage next)
- ⏳ API endpoints for app
- ✅ Authentication flow (Creator side implemented via Session/JWT)
- ⏳ Voice processing (Higgs/Moshi)

**Documentation**:
- See `apps/app/README.md` for app-specific details
- See `docs/app_architecture.md` for API contracts
- See `TASK.md` for detailed progress tracking
