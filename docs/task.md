# Project Hear - Task List

## Phase 1: Foundation & "Hollow" MVP (Current Focus)
- [x] **Project Scaffolding**
    - [x] Initialize Monorepo (Turborepo or simple root)
    - [x] Setup Frontend (Next.js, Tailwind, Shadcn)
    - [x] Setup Backend (Node.js/TypeScript for AI Orchestration)
    - [x] Setup Database (Postgres/Supabase schema)
- [/] **Ingestion Data Pipeline (Node.js)**
    - [x] Setup Ingestion Endpoint Structure (Node.js)
    - [x] Setup YouTube Data API Client (googleapis)
    - [x] Setup Instagram Graph API Client
    - [x] Implement Transcript Processor (DeepSeek/Qwen)
    - [x] Implement Comment Scraper/Processor (Engagement Style)
    - [x] Setup Vector DB (pgvector Schema)
    - [x] Implement Audio Extractor (FFmpeg Structure)
    - [x] Implement Audio Cleaning (Demucs for Noise, Pyannote for Diarization)
    - [x] Setup Tier 1 Voice (Higgs Audio V2)
- [/] **Creator Dashboard & Brain**
    - [x] Basic UI Scaffolding
    - [x] Implement "Persona Config" (System Prompt Builder)
    - [x] Implement Text Chat Interface (Baseline - Twin Test Section)
- [ ] **Voice Layer (Tier 2 Premium)**
    - [ ] Setup GPU Worker for LoRA Training
    - [ ] Implement Moshi Fine-Tuning Pipeline

## Phase 2: Memory & Persona (The "Brain")
- [ ] **Memory Infrastructure**
    - [ ] Setup Vector DB (pgvector or Qdrant)
    - [ ] Integrate Letta (MemGPT) for long-term state
- [ ] **Persona Management**
    - [ ] Create Creator Dashboard for Persona configuration
    - [ ] Implement System Prompt builder

## Phase 3: Monetization & Creator Economy
- [ ] **Billing Infrastructure**
    - [ ] Deploy Lago (Self-hosted or Cloud dev)
    - [ ] Integrate HyperSwitch for payments
- [ ] **Business Logic**
    - [ ] Implement "Voice Seconds" metering
    - [ ] Create Subscription gating middleware

## Phase 4: Safety & Production
- [ ] **Guardrails**
    - [ ] Integrate Llama Guard 3 pipeline
    - [ ] Implement Audio Watermarking
- [ ] **Deployment**
    - [ ] Dockerize services
    - [ ] CI/CD pipeline setup
