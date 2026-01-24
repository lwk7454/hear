# Documentation Index

Welcome to the **Hear** project documentation. This folder contains all architectural, deployment, and operational guides.

## Core Documentation

*   **[Executive Summary](executive_summary.md)**: High-level vision, product pillars, and strategic goals.
*   **[App Architecture](app_architecture.md)**: Detailed breakdown of the Consumer App (`apps/app`), User Journeys, and API contracts.
*   **[Deployment & Infrastructure](deployment.md)**: Guide to the Hybrid Cloud architecture (AWS Lightsail, RunPod, Supabase) and CI/CD pipelines.
*   **[Handover Document](handover.md)**: Comprehensive status report, tech stack summary, and immediate next steps.

## Strategy & Planning

*   **[Production Strategy](production_strategy.md)**: Roadmap for scaling from prototype to production (Cloud GPUs, Latency optimization).
*   **[Implementation Plan](implementation_plan.md)**: (Artifact) Current active development plan.

## Technical References

*   **[Brain Training Architecture](brain_training_architecture.md)**: Details on the RAG pipeline and persona training.
*   **[Integration Guide](integration_guide.md)**: Guide for integrating new services or external APIs.

## Directory Map

*   `apps/` - Application source code.
    *   `apps/web` - Creator Dashboard (Next.js 15).
    *   `apps/app` - Consumer App (Next.js 16 PWA).
    *   `apps/server` - Backend API (Fastify).
    *   `apps/worker-higgs` - Voice Generation Worker (Python/RunPod).
    *   `apps/worker-cleanser` - Audio Processing Worker (Python/RunPod).
*   `terraform/` - Infrastructure as Code configurations.
*   `packages/` - Shared libraries (`db`, `ui`, `tsconfig`, etc.).
