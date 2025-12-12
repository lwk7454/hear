# Executive Summary: Project "Hear"

## 1. Vision: The Effortless Digital Twin
**Hear** is an AI platform that allows Creators to scale their intimacy without scaling their effort. Our core value proposition is **Zero-Friction Onboarding**: a creator drops a link to their YouTube or Instagram, and we instantly generate a high-fidelity "Digital Twin" that knows their stories, speaks in their style, and respects their boundaries.

## 2. Product Pillars
1.  **Creator-First Onboarding**:
    *   **Authorized Ingestion**: Securely connect **YouTube & Instagram** via OAuth.
        *   **Stage 1: Discovery**: We scan the repo to normalized "Content Items" (Videos, Posts).
        *   **Stage 2: Deep Parsing**:
            *   **Video/Audio**: For Tier 1 Voice. **Processed via Demucs (Noise Removal) & Pyannote (Diarization)** to ensure clean, isolated vocals.
            *   **Meta-Data**: Titles, Descriptions, Post Captions.
            *   **Social**: Comments (to learn how they reply to fans).
    *   **Fine-Tuning Studio**: Simple controls for "Topics to Avoid" (e.g., "Don't talk about my ex") and "Personality Sliders" (Sassy vs. Supportive).
2.  **Hybrid Engagement**:
    *   **Text Chat (Baseline)**: Always-available, low-cost intimacy for the massive fan base.
    *   **Voice-to-Voice (Premium)**: High-fidelity, emotional audio calls for super-fans, utilizing the same "Brain" but adding the "Mouth".

## 3. Architecture Overview
We separate the **Persona Brain** from the **Interaction Modality**.

```mermaid
---
config:
  theme: default
---
graph TD
    %% Input Sources
    subgraph Ingestion ["Ingestion Pipeline (Node.js)"]
        YT[YouTube API]
        Processor[DeepSeek / Qwen]
        FastClone[Style Embedder]
        Trainer[LoRA Trainer]
        VectorDB[(Knowledge Base)]
    end
    
    %% AI Core
    subgraph "The Brain (Persona Engine)"
        LLM[Personality Model]
        Rules[Safety & Topic Guardrails]
        Memory[Long-Term User Context]
    end
    
    %% Interfaces
    subgraph "Interaction Layer"
        TextUI[Text Chat]
        VoiceUI["Voice Mode (Moshi/Higgs V2)"]
    end
    
    %% Flow
    YT & IG -->|Text extraction| Processor
    YT & IG -->|30s Audio| FastClone
    YT & IG -->|30m Audio| Trainer
    Processor -->|Knowledge| VectorDB
    FastClone -->|Embedding| VoiceUI
    Trainer -->|Adapter| VoiceUI
    VectorDB -->|Context Retrieval| LLM
    Rules -->|Constraints| LLM
    LLM -->|Reply| TextUI
    LLM -->|Reply| VoiceUI
```

## 4. Workload & Roadmap

*   **Phase 1: The "Digital Twin" Factory (Tier 1 Focus)**
    *   🎯 **Goal**: Creator links YouTube -> We extract Text Personality + **Instant Voice Clone** (Embedding).
    *   🛠 **Tech**: DeepSeek (Brain), Higgs Audio V2 (Instant Voice), Supabase, **Python Worker (Demucs/Pyannote)**.
    *   ✅ **Status**: Audio clean-up/diarization mechanism implemented via `apps/worker` (Demucs + Pyannote).

* 3.  **Pipeline Flow (official APIs)**:
    1.  **Auth**: Creator logs in with Google/Meta.
    2.  **Fetch**: Server pulls captions/posts via official APIs.
    3.  **Process**: LangChain extracts structured Persona.
    4.  **Clone**: Bot is ready.

*   **Phase 2: Creator Studio**
    *   🎯 **Goal**: Creator Dashboard to tweak the brain.
    *   🛠 **UI**: "Rule Builder" interface, "Memory Viewer".

*   **Phase 3: The Voice Layer**
    *   🎯 **Goal**: Add audio support to the existing Persona.
    *   🛠 **Tech**: Voice Cloning (fine-tuned on the Ingested Audio).

## 5. Strategic Advantage
Our competitors focus on "Chatting." We focus on **"Cloning."** By making the training process automatic (ingesting existing content), we solve the #1 problem for creators: **Laziness/Time**. They don't want to write a prompt; they want to be uploaded.
