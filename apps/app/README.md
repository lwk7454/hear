# End-User App (apps/app)

**Purpose**: Mobile-first PWA for fans/consumers to discover and interact with AI creator clones.

## Overview

This is the consumer-facing application for the Hear platform. While `apps/web` serves the Creator Dashboard, `apps/app` is designed for end-users to:
- Discover and browse creator personas
- Sign up via email or SSO (Google, Meta)
- Chat with creator clones (text and voice)
- Access creators via deep links, QR codes, or reference codes

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **UI Components**: Custom components based on shadcn/ui patterns
- **State Management**: Zustand (for active call states)
- **Icons**: Lucide React
- **Animations**: Framer Motion

## Project Structure

```
apps/app/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Home/Discovery (/)
│   │   ├── login/             # Authentication (/login)
│   │   ├── c/[slug]/          # Creator Profile (/c/creator-1)
│   │   └── chat/[creatorId]/  # Chat Interface (/chat/creator-1)
│   ├── components/
│   │   └── ui/                # Reusable UI components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       └── card.tsx
│   └── lib/
│       └── utils.ts           # Utility functions (cn)
└── package.json
```

## Key Features

### 1. Authentication (`/login`)
- **SSO**: Google and Meta (Facebook) OAuth integration
- **Reference Code**: Allow users to unlock creators via special codes
- Designed for future Supabase Auth integration

### 2. Discovery & Catalog (`/`)
- **Search**: Real-time search across creator personas
- **Filters**: Category-based filtering (Trending, New, Gaming, Music, Tech)
- **Featured Creators**: Carousel showcasing top personas
- **Recent Activity**: Continue previous conversations

### 3. Creator Deep Linking (`/c/[slug]`)
- **Profile View**: Display creator bio, stats, and personality
- **QR Code Support**: Users scan creator QR codes → direct to profile
- **Actions**: Start chat or voice call
- **Follow System**: Track favorite creators

### 4. Chat Interface (`/chat/[creatorId]`)

The main interaction page supporting multiple modalities:

#### Text Chat (Default)
- Traditional message bubbles
- Real-time typing indicators
- Message history

#### Voice Tier 1 (Async Push-to-Talk)
- User records voice message
- Sent to server for STT → LLM → TTS
- Response appears as playable audio bubble
- Works with Higgs Audio V2 (TTS-based)

#### Voice Tier 2 (Live Duplex)
- Full-duplex voice conversation
- Similar to ChatGPT's Advanced Voice Mode
- Both parties can talk simultaneously
- Requires Moshi integration (2-stream audio)
- Overlay UI showing active call state

## Voice Chat Architecture

### Tier 1: Asynchronous Voice Messages
```
User Records → Upload → STT (Whisper) 
  → LLM (Brain) → TTS (Higgs) → Audio Bubble
```

### Tier 2: Live Duplex Conversation
```
User Audio Stream (WebRTC/WebSocket)
  ↓
Server (Moshi Client) ← → Moshi Python Service
  ↓                        (2 streams: in/out)
Creator Response Stream
```

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Run dev server
cd apps/app
pnpm dev

# Build for production
pnpm build

# Lint
pnpm lint
```

The app runs on `http://localhost:3000` by default.

## Integration Points

### Backend API (`apps/server`)
- `/api/personas` - List all creator personas
- `/api/auth/*` - Authentication endpoints
- `/api/chat/:creatorId` - Text chat messaging
- `/ws/audio` - WebSocket for voice chat (Tier 2)

### Voice Services
- **Higgs Audio V2**: Text-to-Speech for Tier 1 voice
- **Moshi**: Full-duplex conversational AI for Tier 2 voice
- **Whisper**: Speech-to-Text for voice input

## Deployment Considerations

### PWA Features (Future)
- Offline support for message history
- Push notifications for new messages
- Install prompt for native-like experience

### Mobile Optimization
- Touch-optimized UI
- Responsive breakpoints
- Bottom navigation for easy thumb reach
- Smooth animations and transitions

### Performance
- Image lazy loading with Next.js Image
- Route prefetching for instant navigation
- Optimized bundle size with tree-shaking

## Next Steps

1. **Authentication Integration**: Connect to Supabase Auth
2. **API Integration**: Wire up real endpoints from `apps/server`
3. **Voice Implementation**: 
   - Implement Tier 1 (async) with Higgs
   - Implement Tier 2 (duplex) with Moshi WebSocket
4. **State Management**: Set up Zustand stores for chat/call state
5. **Deep Linking**: Handle QR codes and reference codes
6. **PWA Setup**: Add service worker and manifest

## Design Philosophy

This app prioritizes:
- **Mobile-First**: Designed for smartphone use
- **Speed**: Instant page transitions and quick load times
- **Simplicity**: Minimal UI, maximum focus on conversation
- **Delight**: Smooth animations and premium feel
