# De-Mocking Checklist: From Prototype to Production

To move from the current "Hollow MVP" to a fully functional environment, you need to configure 4 external services.

## 1. Authentication & Ingestion (Google/YouTube)
*   **Requirement**: A Google Cloud Platform (GCP) Project.
*   **Action Items**:
    1.  Enable **YouTube Data API v3** in GCP Console.
    2.  Create **OAuth 2.0 Credentials** (Web Application).
        *   Allowed Redirect URI: `http://localhost:3000/api/auth/callback/google` (or similar).
    3.  **Environment Variables** (`apps/server/.env`):
        ```env
        YOUTUBE_CLIENT_ID=...
        YOUTUBE_CLIENT_SECRET=...
        YOUTUBE_REDIRECT_URI=...
        ```

## 2. Intelligence (The Brain)
*   **Requirement**: LLM Provider & Vector Logic.
*   **Action Items**:
    1.  Get an **OpenAI API Key** (for GPT-4o and Embeddings).
    2.  Update `apps/server` to initialize `ChatOpenAI` and `OpenAIEmbeddings`.
    3.  **Environment Variables**:
        ```env
        OPENAI_API_KEY=sk-...
        ```

## 3. Database (Memory)
*   **Requirement**: PostgreSQL with `pgvector` support.
*   **Recommended**: **Supabase** (Free Tier is sufficient).
*   **Action Items**:
    1.  Create Supabase Project.
    2.  Run SQL to enable vector extension: `create extension vector;`
    3.  **Environment Variables**:
        ```env
        SUPABASE_URL=...
        SUPABASE_SERVICE_ROLE_KEY=...
        ```

## 4. Voice (The Mouth) - *Optional for Phase 1*
*   **Requirement**: A GPU Environment for Moshi (or use OpenAI Realtime API as fallback).
*   **Option A: Local Moshi (Hard)**:
    *   Requires NVIDIA GPU (24GB+ VRAM recommended) or optimized Mac Metal build (Experimental).
    *   Run `apps/moshi` via Docker with GPU passthrough.
*   **Option B: OpenAI Realtime (Easy)**:
    *   Swap `MoshiClient` to use OpenAI's WebSocket API.
    *   Cost: ~$0.06/min.

*   **Option C: Private Cloud (Windows LAN - YOUR SETUP)**
    *   **Hardware**: RTX 4070 Super (12GB VRAM).
    *   **Constraint**: Standard Moshi (bf16) needs 16GB. You **MUST** use the 8-bit quantization (~8GB VRAM).
    *   **Steps**:
        1.  On Windows: Install **WSL2** (Ubuntu) + **Docker Desktop** (Enable WSL2 backend).
        2.  Run: `docker run --gpus all -p 8998:8998 kyutai/moshi:latest --quantization 8bit`
        3.  Find Windows LAN IP (e.g., `192.168.1.50`).
        4.  Update Mac `apps/server/.env`: `MOSHI_URL=ws://192.168.1.50:8998`.

## Summary of Work Required
1.  **Frontend**: Add "Login with Google" button to `apps/web` to capture the `access_token`.
2.  **Backend**: Update `ingestion.ts` to use real `googleapis` calls with that token.
3.  **Backend**: Implement `LangChain` flow to save extracted data to Supabase.
