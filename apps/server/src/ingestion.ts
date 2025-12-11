import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
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

import { prisma } from './lib/db';

/**
 * Step 1: Discovery Phase
 * Listing content without heavy processing.
 */
async function discoverContent(creatorId: string, platform: string, authCode?: string) {
    console.log(`[Discovery] Scanning ${platform} for ${creatorId}...`);
    
    // 1. Fetch Connection
    // Try to find the user. In our demo auth flow, we used email = creatorId@demo.com
    // We need to resolve the creatorId to the UUID in the DB or use the demo email approach.
    // For consistency with Auth route, let's assume we find by email constructed from creatorId if not found by ID.
    
    let creator = await prisma.creator.findFirst({
        where: { OR: [{ id: creatorId }, { email: `${creatorId}@demo.com` }] },
        include: { authConnections: true }
    });

    if (!creator) {
        // Fallback for demo: if not in DB, maybe just return empty or mock if strictly required.
        console.warn(`Creator ${creatorId} not found in DB. Returning mock/empty.`);
        if (platform === 'youtube') {
             // Default Mocks if no auth
             return { items: [{ id: "v1", title: "Demo Video (No Auth)", url: "...", type: "video" }] };
        }
    }

    const connection = creator?.authConnections.find((c: { platform: string }) => c.platform === platform.toUpperCase());
    
    if (platform === 'youtube') {
        if (!connection) {
             console.warn("No YouTube connection found.");
             return { items: [] };
        }
        if (!connection || !connection.accessToken) {
            // TODO: Handle refresh token flow if access token expired
            throw new Error("No YouTube connection found. Please authorize.");
        }
        
        const oauth2Client = new google.auth.OAuth2(
            process.env.YOUTUBE_CLIENT_ID,
            process.env.YOUTUBE_CLIENT_SECRET
        );
        
        oauth2Client.setCredentials({ 
            access_token: connection.accessToken,
            refresh_token: connection.refreshToken || undefined 
            // expiry_date?
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        // List uploaded videos from the user's "uploads" playlist
        // 1. Get channel "uploads" playlist ID
        const channelRes = await youtube.channels.list({
            part: ['contentDetails'],
            mine: true
        });
        
        const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        
        if (!uploadsPlaylistId) {
             return { items: [] }; // No channel or no uploads
        }

        // 2. List videos in that playlist
        const playlistItems = await youtube.playlistItems.list({
            part: ['snippet', 'contentDetails'],
            playlistId: uploadsPlaylistId,
            maxResults: 10
        });
        
        return {
            items: playlistItems.data.items?.map(item => ({
                id: item.contentDetails?.videoId || "unknown",
                title: item.snippet?.title || "Untitled",
                url: `https://youtube.com/watch?v=${item.contentDetails?.videoId}`,
                type: "video",
                date: item.snippet?.publishedAt || new Date().toISOString()
            })) || []
        };

    } else if (platform === 'instagram') {
        if (!connection || !connection.accessToken) {
             throw new Error("No Instagram connection found. Please authorize.");
        }
    
        const ig = new InstagramService();
        try {
            // Pass the real stored token
            const posts = await ig.getPosts(connection.accessToken);
            return {
                items: posts.map((p: any) => ({
                    id: p.id,
                    title: p.caption ? p.caption.substring(0, 30) + "..." : "No Caption",
                    url: p.media_url, // Note: minimal URL, might need permalink
                    type: "post",
                    date: p.timestamp
                }))
            };
        } catch (e) {
            console.error("IG Scan failed", e);
            throw e;
        }
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
        let user;
        try {
             user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
             return reply.code(401).send({ error: "Unauthorized" });
        }
        
        // We still parse body for platform/authCode, but overwrite creatorId
        const body = DiscoverySchema.omit({ creatorId: true }).parse(request.body);
        const result = await discoverContent(user.id, body.platform, body.authCode);
        return { status: 'success', data: result };
    } catch (e) {
        reply.code(400); 
        return { status: 'error', error: e };
    }
  });

  // Step 2: Parse (The Heavy Worker)
  fastify.post('/ingest/parse', async (request, reply) => {
    try {
        let user;
        try {
             user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
             return reply.code(401).send({ error: "Unauthorized" });
        }

        const body = ParseContentSchema.omit({ creatorId: true }).parse(request.body);
        // Map body to expected item structure
        const item = { url: body.url, type: body.type };
        const result = await parseContentItem(user.id, item);
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
        let user;
        try {
             user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
             return reply.code(401).send({ error: "Unauthorized" });
        }

        const body = z.object({ url: z.string().url() }).parse(request.body);
        const result = await parseContentItem(user.id, { url: body.url, type: 'video' });
        return { status: 'success', data: result };
      } catch (e) {
          reply.code(400); return { status: 'error', error: e };
      }
  });
}
