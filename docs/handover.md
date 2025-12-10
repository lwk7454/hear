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
*   **Frontend**: `apps/web` (Next.js 15, Tailwind, Shadcn).
*   **Backend**: `apps/server` (Fastify, Node.js).
*   **AI/Logic**: `LangChain.js` (Use **DeepSeek** or **Qwen** adapters, NOT OpenAI).
*   **Ingestion**: `googleapis` (YouTube Data API).
*   **Voice Training**: Requirement identified for **Moshi Fine-Tuning** (Python/PyTorch) to capture raw audio style.

## 3. Current Implementation Status
*   **Creator Dashboard**:
    *   URL: `/creator` (in `apps/web`).
    *   State: **Updated**. features "Quick Link" (YouTube) and "Authorized Connect" (Instagram). Dispalys Voice Tier and Engagement Style.
*   **Ingestion Endpoint**:
    *   Route: `POST /ingest/youtube` & `POST /ingest/instagram`.
    *   State: **Implemented**. Supports Text (DeepSeek), Voice (Higgs V2), and Engagement (Comments).
    *   Current Behavior: Returns structured Persona with mocked analysis.

## 4. Immediate Next Steps (For Next Agent)
1.  **Configure Environment**:
    *   Add `OPENAI_BASE_URL` (DeepSeek), `YOUTUBE_CLIENT_ID`, `IG_CLIENT_ID` to `.env`.
2.  **Connect Database** (CRITICAL):
    *   `packages/db` has the schema.
    *   **Action**: Create a Supabase project, get the `DATABASE_URL`, and run `pnpm prisma db push`.
    *   *Then* update `apps/server` to actually save the ingested data (currently it just returns the JSON).

## 5. How to Run
```bash
pnpm dev
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```
