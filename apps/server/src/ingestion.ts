import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TranscriptProcessor } from './services/processor'
import { AudioCleaner } from './services/cleaner'
import { HiggsService } from './services/higgs'
import { AudioService } from './services/audio'
import { InstagramService } from './services/instagram'

// Schema for Step 1: Discovery
const DiscoverySchema = z.object({
  creatorId: z.string(),
  platform: z.enum(['youtube', 'instagram']),
  authCode: z.string().optional() // For OAuth
});

// Schema for Step 2: Content Parsing
const ParseContentSchema = z.object({
  creatorId: z.string(),
  contentId: z.string(),
  type: z.enum(['video', 'post']),
  url: z.string().url()
});

/**
 * Step 1: Discovery Phase
 * Listing content without heavy processing.
 */
async function discoverContent(creatorId: string, platform: string, authCode?: string) {
    console.log(`[Discovery] Scanning ${platform} for ${creatorId}...`);
    
    if (platform === 'youtube') {
        // Mock: List recent videos
        return {
            items: [
                { id: "v1", title: "Mechanical Keyboards 101", url: "https://youtube.com/watch?v=101", type: "video", date: "2023-10-01" },
                { id: "v2", title: "My Coding Setup", url: "https://youtube.com/watch?v=102", type: "video", date: "2023-10-05" }
            ]
        };
    } else if (platform === 'instagram') {
        const ig = new InstagramService();
        // Assume authCode is actually an accessToken for this mock
        const posts = await ig.getPosts(authCode || "mock_token");
        return {
            items: posts.map((p: any) => ({
                id: p.id,
                title: p.caption?.substring(0, 30) + "...",
                url: p.media_url,
                type: "post",
                date: p.timestamp
            }))
        };
    }
    throw new Error("Unsupported platform");
}

/**
 * Step 2: Content Parsing Phase
 * Heavy lifting: Download, Demucs, Transcribe, Higgs.
 */
async function parseContentItem(creatorId: string, item: { url: string, type: string }) {
    console.log(`[Parser] Processing ${item.type} from ${item.url}...`);

    if (item.type === 'video') {
         // 1. Text & Audio Pipeline (Refactored from previous monolith)
         const dummyTranscript = "Yo, welcome back to the channel. Today we are talking about mechanical keyboards.";
         
         const processor = new TranscriptProcessor();
         const persona = await processor.process(dummyTranscript);
         
         const audio = new AudioService();
         const rawPath = await audio.downloadAudio(item.url, creatorId);
         
         const cleaner = new AudioCleaner();
         const vocalsPath = await cleaner.isolateVoice(rawPath);
         const segments = await cleaner.diarize(vocalsPath);
         const bestSample = await audio.extractBestSegment(vocalsPath, segments);
         
         const higgs = new HiggsService();
         const voiceId = await higgs.generateEmbedding(bestSample);
         
         return {
             ...persona,
             voice: {
                 tier: "Tier 1 (Higgs V2)",
                 status: "Ready",
                 voiceId: voiceId
             }
         };
    } else if (item.type === 'post') {
        // Instagram Post Logic
        // In a real app, we'd fetch the specific post details again or pass them in
        return { status: "processed", analysis: "Visual context extracted (Mock)" };
    }
}


export async function ingestionRoutes(fastify: FastifyInstance) {
  // Step 1: Discover
  fastify.post('/ingest/discover', async (request, reply) => {
    try {
        const body = DiscoverySchema.parse(request.body);
        const result = await discoverContent(body.creatorId, body.platform, body.authCode);
        return { status: 'success', data: result };
    } catch (e) {
        reply.code(400); 
        return { status: 'error', error: e };
    }
  });

  // Step 2: Parse (The Heavy Worker)
  fastify.post('/ingest/parse', async (request, reply) => {
    try {
        const body = ParseContentSchema.parse(request.body);
        // Map body to expected item structure
        const item = { url: body.url, type: body.type };
        const result = await parseContentItem(body.creatorId, item);
        return { status: 'success', data: result };
    } catch (e) {
        reply.code(400); 
        return { status: 'error', error: e };
    }
  });

  // Legacy (Keep for backward compatibility during migration if needed, or remove)
  // Re-mapping old /ingest/youtube to use parseContentItem internally for "Quick Link" mode
  fastify.post('/ingest/youtube', async (request, reply) => {
      try {
        const body = z.object({ creatorId: z.string(), url: z.string().url() }).parse(request.body);
        const result = await parseContentItem(body.creatorId, { url: body.url, type: 'video' });
        return { status: 'success', data: result };
      } catch (e) {
          reply.code(400); return { status: 'error', error: e };
      }
  });
}
