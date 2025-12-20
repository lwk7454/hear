# Project Handover Document

## 1. Core Goal: Authorized Multi-Modal Ingestion
*   **Objective**: Comprehensive "Digital Twin" creation via repository scanning.
*   **Permission**: User grants OAuth access to **YouTube** and **Instagram**.
*   **Scan Targets**:
    *   **YouTube**: Videos (Audio/Transcripts), Titles, Descriptions, Comments.
    *   **Instagram**: Images, Text Posts, Comments.
*   **Output**: A dual-training set for Text Persona (DeepSeek) and Voice Model (Tier 1: Higgs V2 / Tier 2: GLM-4-Voice).

## 2. Technical Stack (Pure TypeScript)
The technical stack is built entirely on Node.js/TypeScript.
*   **Storage Policy**: All persistent user assets (Audio, Images) MUST be stored in Supabase Storage. Local filesystem is not used, uploads are streamed.
*   **Repo**: Monorepo (Turbo + pnpm).
*   **Frontends**: 
    *   `apps/web` - Creator Dashboard (Next.js 15, Tailwind, Shadcn).
    *   `apps/app` - End-User App (Next.js 16, Tailwind, Mobile-First PWA).
*   **Backend**: `apps/server` (Fastify, Node.js).
*   **AI/Logic**: `LangChain.js` (Use **DeepSeek** or **Qwen** adapters, NOT OpenAI).
*   **Ingestion**: `googleapis` (YouTube Data API), `yt-dlp` (Fallback).
*   **Audio Processing**: `apps/worker` (Python 3.11/FastAPI) handles **Demucs** (Vocals) and **Pyannote** (Diarization).
*   **Voice Generation**: `apps/worker-higgs` (Python 3.10/FastAPI) handles **Higgs Audio V2** TTS.
*   **Voice Training**: Requirement identified for **GLM-4-Voice Fine-Tuning** (LoRA), using cloud GPU (RunPod).
*   **RAG/Brain**: `LangChain` (Ingestion/Splitting), `Perplexity API` (Bio Research), `Supabase pgvector`.

## 3. Current Implementation Status

### Creator-Side (`apps/web`)
*   **Creator Dashboard**:
    *   URL: `/creator` (in `apps/web`).
    *   State: **Updated**. Features "Quick Link" (YouTube) and "Authorized Connect" (Instagram). Displays Voice Tier and Engagement Style.

### AI Processing & Voice (`apps/worker` & `apps/worker-higgs`)
*   **Audio Processing (`apps/worker`)**:
    *   State: **Complete**. Handles Separation (Demucs) and Diarization (Pyannote).
*   **Voice Generation (`apps/worker-higgs`)**:
    *   State: **Active**. Higgs Audio V2 (3B) integrated with 8-bit quantization.
    *   **Features**: Supports **Instant Voice Cloning** via cached audio IDs. Resolved shape mismatch issues in generation loop.
    *   **Endpoint**: `POST /synthesize` is fully functional.

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
    *   `NO_PROXY` configured for Worker connectivity.
    *   `CORS_ORIGINS` configured for production.
2.  **Connect Database** (Completed):
    *   `packages/db` linked and schema updated (Voice/Ingestion).
    *   `auth.ts` handles OAuth token storage.

### Immediate Next Steps (Chat Interface)
3.  **Implement "The Brain" (RAG)**:
    *   Setup `vectors` table in Supabase.
    *   Implement **Perplexity API** search for Creator Bio.
    *   Implement **RAG Pipeline** (LangChain) for grounding answers in Transcripts.
4.  **Wire Up End-User App**:
    *   Implement `/api/chat/:creatorId` endpoints.
    *   Build Chat UI with real backend connection.
5.  **Voice Integration (Phase 2)**:
    *   Voice Tier 1: Connect to Higgs Audio V2 (Worker-Higgs)
    *   Voice Tier 2: Integrate GLM-4-Voice pseudo-duplex streaming

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

# Start Python Workers (New Terminals)
cd apps/worker
python main.py             # Worker: http://localhost:8001

cd apps/worker-higgs
python main.py             # Worker-Higgs: http://localhost:8002
```

## 6. Architecture Overview

The platform now has a **two-app architecture**:

| App | Purpose | Users | Tech | Status |
|-----|---------|-------|------|--------|
| `apps/web` | Creator Dashboard | Creators | Next.js 15 | Active |
| `apps/app` | Consumer Experience | Fans | Next.js 16 PWA | Scaffolded |
| `apps/server` | API + Orchestration | Both | Fastify | Active |
| `apps/worker` | Audio Processing | Backend | Python 3.11 | Active |
| `apps/worker-higgs` | Voice Generation | Backend | Python 3.10 | Active |

**Voice Tiers**:
- **Tier 1**: Async voice messages (Higgs TTS)
- **Tier 2**: Live pseudo-duplex conversation (GLM-4-Voice)

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
- [x] Voice Tier 1: Worker implementation (Higgs V2)
- [ ] Voice Tier 1: Audio upload/playback integration in server
- [ ] Voice Tier 2: Pseudo-duplex audio streaming
- [ ] GLM-4-Voice worker implementation (LoRA)

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
- ✅ Voice Tier 1 Worker (Higgs V2)

**Pending Integration**:
- ⏳ Database persistence (Auth tokens & User Session implemented, Content storage next)
- ⏳ API endpoints for app
- ✅ Authentication flow (Creator side implemented via Session/JWT)
- ⏳ Voice processing (Higgs/Moshi)

**Documentation**:
- See `apps/app/README.md` for app-specific details
- See `docs/app_architecture.md` for API contracts
- See `TASK.md` for detailed progress tracking
