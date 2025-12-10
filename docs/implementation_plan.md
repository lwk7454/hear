# Implementation Plan - Project Hear

## Goal Description
Build "Hear", an AI-powered voice companionship and creator monetization platform. The goal is to create a high-fidelity emotional connection between High-Value Creators and Super Fans using asynchronous voice messages.

## System Architecture

### High-Level Design
We use a **Split-Stack Architecture** to leverage the best tools for UI and AI:
- **Frontend/App Layer (TypeScript)**: Next.js 15 (App Router). Handles Creator Dashboard, Chat UI, and Auth.
- **Unified Backend Layer (Node.js/TypeScript)**: Handles Ingestion, AI Brain (LangChain.js), and Real-time Voice.

### Tech Stack
- **Frontend**: Next.js, TailwindCSS, Shadcn/UI.
- **Backend**: Node.js (Fastify) for API, LangChain.js for AI Logic.
- **Database**: PostgreSQL (Supabase) + pgvector.
- **Ingestion**: Node.js clients for YouTube/Meta APIs (Official).
- **AI Models**:
    *   **Brain**: DeepSeek-V3 / Qwen-2.5 (Reasoning).
    *   **Voice Tier 1 (Standard)**: Higgs Audio V2 (Zero-shot cloning via embedding).
    *   **Voice Tier 2 (Premium)**: Moshi (Fine-tuned LoRA for max fidelity).

## Proposed Changes (Phase 1: Hollow MVP)

### 1. Project Structure
We organized as a Monorepo to keep full-stack code accessible.
```text
/hear-platform
  /apps
    /web             # Next.js User/Creator App (Initialized)
    /server          # Node.js AI Orchestrator (Initialized)
  /packages
    /db              # Shared Schema/Prisma
    /ui              # Shared UI components
```

### 2. Database Schema (Preliminary)
- **Creators**: Profile, Subscription Tiers.
- **KnowledgeBase**: Vector chunks from ingested content (Source: "YouTube: My Trip to Japan").
- **PersonaRules**: "Never discuss X", "Always be Y".
- **Conversations**: Text/Audio logs.

### 3. Pipeline Flow (Creator Onboarding)
1.  **Ingest (Authorized Scan)**: 
    *   Creator connects OAuth for **YouTube** & **Instagram**.
    *   **YouTube**: Extract Video Audio (Voice), Transcripts (Style), Titles/Descriptions (Topics), Comments (Engagement Style).
    *   **Audio Enhancement Pipeline**:
        1.  **Demucs**: Remove background music and noise (Isolate Vocals).
        2.  **Pyannote.audio**: Diarization to identify the main speaker (Creator) vs Guests.
        3.  **Filter**: Keep only "Speaker 0" (Creator) segments > 5sec.
    *   **Instagram**: Extract Posts (Visual context/Captions), Comments.
2.  **Process Mind**: Text -> DeepSeek extracting "Style", "Facts", "Beliefs" -> Vector DB.
3.  **Process Voice**:
    *   *Default*: Extract 30s clean sample -> Generate Voice Embedding.
    *   *Premium*: Queue 30m audio -> Start LoRA Training Job.
4.  **Deploy**: Bot is ready.

## Verification Plan

### Automated Tests
- **Backend**: Vitest/Jest for AI endpoints.
- **Frontend**: Jest/React Testing Library for Chat components.

### Manual Verification
- **Real-World Test**: No mocks allowed.
- **Workflow**:
    1.  Deploy stack locally with real API keys (YouTube, DeepSeek, Higgs).
    2.  Ingest a real YouTube video (e.g., MKBHD).
    3.  **Interaction**: Use the Web UI to chat with the resulting Persona textually and verify the Voice ID matches Higgs V2 output.
