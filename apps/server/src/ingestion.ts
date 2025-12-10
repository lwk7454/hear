import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { TranscriptProcessor } from './services/processor'
import { AudioCleaner } from './services/cleaner'
import { HiggsService } from './services/higgs'
import { AudioService } from './services/audio'

// Schema for Ingest Request
const IngestSchema = z.object({
  creatorId: z.string(),
  url: z.string().url()
})

// Mock processing function simulating Official API flow + Real LLM Extraction
async function processYoutubeUrl(creatorId: string, url: string) {
  console.log(`[Brain] Authenticating for creator ${creatorId}...`)
  
  // 1. Fetch Metadata (Simulated)
  console.log(`[Brain] Fetching metadata via Google API for ${url}...`)
  await new Promise(resolve => setTimeout(resolve, 800)) 

  // 2. Fetch Transcript (Simulated)
  console.log(`[Brain] Downloading secure captions via OAuth...`)
  const dummyTranscript = "Yo, welcome back to the channel. Today we are talking about mechanical keyboards. I love the clicky sound, but my neighbors hate it. I believe blue switches are the best."
  
  // 3. Process via DeepSeek/LLM (The Brain)
  const processor = new TranscriptProcessor();
  const persona = await processor.process(dummyTranscript);

  // 4. Process Audio (The Voice Pipeline)
  console.log(`[Brain] Starting Audio Processing Pipeline...`)
  const audio = new AudioService()
  const rawPath = await audio.downloadAudio(url, creatorId)
  
  // New: Cleaning Pipeline
  const cleaner = new AudioCleaner();
  const vocalsPath = await cleaner.isolateVoice(rawPath);  // Demucs
  const segments = await cleaner.diarize(vocalsPath);      // Pyannote
  const bestSample = await audio.extractBestSegment(vocalsPath, segments); // Filter for Creator
  
  // 5. Generate Voice Embedding (Higgs V2)
  console.log(`[Brain] Generating Higgs V2 Voice Embedding...`)
  const higgs = new HiggsService();
  const voiceId = await higgs.generateEmbedding(bestSample);
  
  // await vectorDb.saveCreatorProfile({ ...persona, voiceId })

  // Append Voice Status to response
  return {
    ...persona,
    voice: {
        tier: "Tier 1 (Higgs V2)",
        status: "Ready",
        voiceId: voiceId,
        sample: "processed_vocals.wav"
    }
  };
}

import { InstagramService } from './services/instagram'
import { EngagementProcessor } from './services/engagement'

const IGIngestSchema = z.object({
  creatorId: z.string(),
  accessToken: z.string() // OAuth token passed from frontend
})

async function processInstagramToken(creatorId: string, token: string) {
    console.log(`[Brain] Scanning Instagram for ${creatorId}...`);
    const ig = new InstagramService();
    
    // 1. Fetch Posts
    const posts = await ig.getPosts(token);
    
    // 2. Fetch Comments (Deep Scan)
    const allComments = [];
    for (const post of posts) {
        const comments = await ig.getComments(token, post.id);
        allComments.push(...comments);
    }
    
    // 3. Analyze Engagement
    const engagement = new EngagementProcessor();
    const style = await engagement.analyzeReplyStyle(allComments);
    
    return {
        source: "Instagram",
        postsScanned: posts.length,
        style: style
    };
}

export async function ingestionRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/youtube', async (request, reply) => {
    try {
      const body = IngestSchema.parse(request.body)
      const result = await processYoutubeUrl(body.creatorId, body.url)
      return { status: 'success', data: result }
    } catch (e) {
      reply.code(400)
      return { status: 'error', error: e }
    }
  })

  fastify.post('/ingest/instagram', async (request, reply) => {
    try {
        const body = IGIngestSchema.parse(request.body);
        const result = await processInstagramToken(body.creatorId, body.accessToken);
        return { status: 'success', data: result };
    } catch (e) {
        reply.code(400);
        return { status: 'error', error: e };
    }
  })
}
