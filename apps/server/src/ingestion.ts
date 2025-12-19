import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { z } from 'zod'
import { TranscriptProcessor } from './services/processor'
import { AudioCleaner } from './services/cleaner'
import { HiggsService } from './services/higgs'
import { AudioService } from './services/audio'
import { InstagramService } from './services/instagram'
import { YouTubeService } from './services/youtube'

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
        if (!connection || !connection.accessToken) {
            // TODO: Handle refresh token flow if access token expired
            throw new Error("No YouTube connection found. Please authorize.");
        }
        
        const ytService = new  YouTubeService(connection.accessToken, connection.refreshToken || undefined);
        
        // 1. Identify the Creator (Channel ID)
        let channelId; 
        try {
            channelId = await ytService.getChannelID();
        } catch (e) {
            console.error("Failed to get Channel ID", e);
            throw new Error("Could not fetch YouTube Channel ID. Connection might be invalid.");
        }

        // 2. Get Uploads Playlist
        const uploadsId = await ytService.getUploadsPlaylistId();
        if (!uploadsId) return { items: [] };

        // 3. Get Recent Videos
        const videos = await ytService.getPlaylistItems(uploadsId, 10);
        
        // 4. Deep Scan: Comments & Replies
        const itemsWithEngagement = await Promise.all(videos.map(async (v) => {
            const videoId = v.contentDetails?.videoId || "";
            if (!videoId) return null;

            // 4a. Fetch detailed video stats (views, likes, full desc)
            const details = await ytService.getVideoDetails(videoId);
            const viewCount = details?.statistics?.viewCount || "0";
            const likeCount = details?.statistics?.likeCount || "0";
            // Use details description if available, otherwise snippet from playlist (which might be truncated)
            const description = details?.snippet?.description || v.snippet?.description || "";

            const comments = await ytService.getVideoComments(videoId, 20);
            
            console.log(`[Engage] V:${videoId} | Mine:${channelId} | Comments:${comments.length}`);

            // Filter: Find threads where the creator (channelId) has participated
            const relevantThreads = comments.filter(thread => {
                const topLevel = thread.snippet?.topLevelComment?.snippet;
                const replies = thread.replies?.comments || [];
                
                // Did creator write the top comment? (Unlikely for "replies", but possible for own posts)
                const isCreatorTop = topLevel?.authorChannelId?.value === channelId;
                
                // Did creator reply?
                const hasCreatorReply = replies.some(r => r.snippet?.authorChannelId?.value === channelId);
                
                if (isCreatorTop || hasCreatorReply) {
                     console.log(`[Match] Thread ${thread.id} has creator interaction.`);
                }
                
                return isCreatorTop || hasCreatorReply;
            }).map(thread => {
                const top = thread.snippet?.topLevelComment?.snippet;
                const creatorReply = thread.replies?.comments?.find(r => r.snippet?.authorChannelId?.value === channelId);
                
                return {
                    id: thread.id,
                    author: top?.authorDisplayName,
                    text: top?.textDisplay,
                    creatorReply: creatorReply?.snippet?.textDisplay,
                    authorImage: top?.authorProfileImageUrl
                };
            });


            // CORRECT APPROACH: custom find -> skip/create
            const existing = await prisma.contentItem.findFirst({
                where: { externalId: videoId, platform: 'YOUTUBE', creatorId }
            });
            
            let dbItem;
            if (existing) {
                // SKIP UPDATE - RETURN EXISTING to prevent overwriting manual changes or wasting ops
                dbItem = existing;
            } else {
                dbItem = await prisma.contentItem.create({
                    data: {
                        creatorId: creatorId,
                        platform: 'YOUTUBE',
                        externalId: videoId,
                        title: v.snippet?.title || "Untitled",
                        description: description,
                        thumbnail: v.snippet?.thumbnails?.medium?.url || null,
                        publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
                        status: 'PENDING'
                    }
                })
            }

            return {
                id: dbItem.id, // Use DB ID
                externalId: videoId,
                title: dbItem.title,
                description: dbItem.description,
                thumbnail: dbItem.thumbnail,
                status: dbItem.status,
                url: `https://youtube.com/watch?v=${videoId}`,
                type: "video",
                date: dbItem.publishedAt?.toISOString() || new Date().toISOString(),
                stats: {
                    comments: relevantThreads.length,
                    views: viewCount,
                    likes: likeCount
                },
                comments: relevantThreads
            };
        }));

        return {
            items: itemsWithEngagement.filter(i => i !== null)
        };

    } else if (platform === 'instagram') {
        if (!connection || !connection.accessToken) {
             throw new Error("No Instagram connection found. Please authorize.");
        }
    
        const ig = new InstagramService();
        try {
            // Pass the real stored token
            const posts = await ig.getPosts(connection.accessToken);
            
            // Persist to DB (Sync)
            const syncedItems = await Promise.all(posts.map(async (p: any) => {
                 const existing = await prisma.contentItem.findFirst({
                     where: { externalId: p.id, platform: 'INSTAGRAM', creatorId }
                 });

                 const data = {
                     creatorId,
                     platform: 'INSTAGRAM',
                     externalId: p.id,
                     title: p.caption ? p.caption.substring(0, 50) + "..." : "Untitled Post",
                     description: p.caption || "",
                     imagePath: p.media_url,
                     publishedAt: p.timestamp ? new Date(p.timestamp) : null,
                 };

                 let dbItem;
                 if (existing) {
                     // SKIP UPDATE
                     dbItem = existing;
                 } else {
                     dbItem = await prisma.contentItem.create({ 
                         data: { ...data, status: 'PENDING' } 
                     });
                 }

                 return {
                    id: dbItem.id,
                    externalId: p.id,
                    title: dbItem.title,
                    description: dbItem.description, // Full caption
                    url: dbItem.imagePath, // IG Media URL
                    type: "post",
                    date: dbItem.publishedAt?.toISOString(),
                    stats: { views: "0", likes: "0", comments: 0 } // Mock stats for now
                 };
            }));

            return { items: syncedItems };
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
import { storageService } from './services/storage'

async function parseContentItem(creatorId: string, item: { url: string, type: string, contentId?: string }) {
    console.log(`[Parser] Processing ${item.type} from ${item.url}...`);

    if (item.type === 'video') {
         // 0. Enforce Voice Enrollment
         const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
         if (!creator || creator.voiceStatus !== 'ENROLLED' || !creator.voiceSample) {
             throw new Error("Voice enrollment required before ingesting video content.");
         }

         // 1. Text & Audio Pipeline
         const audio = new AudioService();
         
         // A. Build Brain (Text Processing)
         const metadata = await audio.getVideoMetadata(item.url);
         const transcript = await audio.getTranscript(item.url, metadata.language);
         
         const textContext = `Title: ${metadata.title}\nDescription: ${metadata.description}\nTranscript: ${transcript.slice(0, 15000)}`; // Truncate to avoid context overflow
         
         const processor = new TranscriptProcessor();
         const personaAnalysis = await processor.process(textContext);

         // Persist Brain Extraction
         await prisma.personaProfile.upsert({
             where: { creatorId },
             create: {
                 creatorId,
                 tone: personaAnalysis.style.tone,
                 keywords: personaAnalysis.style.keywords,
                 facts: [...personaAnalysis.facts, ...personaAnalysis.beliefs]
             },
             update: {
                 tone: personaAnalysis.style.tone,
                 keywords: personaAnalysis.style.keywords,
                 facts: [...personaAnalysis.facts, ...personaAnalysis.beliefs]
             }
         });
         
         // B. Audio Pipeline
         const rawPath = await audio.downloadAudio(item.url, creatorId);
         const ts = Date.now();
         const rawUrl = await storageService.upload(rawPath, `ingest/${creatorId}/${ts}_raw.mp3`);
         
         const cleaner = new AudioCleaner();
         // Offload to GPU Worker
         const { vocalsUrl, segments } = await cleaner.process(rawUrl, creatorId, creator.voiceSample);
         
         // For MVP Split Arch: Use full vocals as sample
         const sampleUrl = vocalsUrl; 
         
         // Download vocals locally for Higgs
         const vocalsPath = rawPath.replace('_full.mp3', '_vocals_dl.wav'); // or similar temp path
         await storageService.download(vocalsUrl, vocalsPath);

         const higgs = new HiggsService();
         const voiceId = await higgs.generateEmbedding(vocalsPath, creatorId);
         
         return {
             ...personaAnalysis,
             voice: {
                 tier: "Tier 1 (Higgs V2)",
                 status: "Ready",
                 voiceId: voiceId
             },
             artifacts: {
                 raw: rawUrl,
                 vocals: vocalsUrl,
                 sample: sampleUrl,
                 segments: segments
             }
         };
    } else if (item.type === 'post') {
        // Instagram Post Logic (Text Ingestion)
         let textToProcess = "";
         if (item.contentId) {
             const dbItem = await prisma.contentItem.findUnique({ where: { id: item.contentId } });
             if (dbItem?.description) textToProcess = dbItem.description;
         }

         if (!textToProcess) {
             // Fallback or skip if no caption
             return { status: "skipped", reason: "No caption content found" };
         }

         const processor = new TranscriptProcessor();
         const personaAnalysis = await processor.process(textToProcess);

         // Persist Brain Extraction
         await prisma.personaProfile.upsert({
             where: { creatorId },
             create: {
                 creatorId,
                 tone: personaAnalysis.style.tone,
                 keywords: personaAnalysis.style.keywords,
                 facts: [...personaAnalysis.facts, ...personaAnalysis.beliefs]
             },
             update: {
                 tone: personaAnalysis.style.tone,
                 keywords: personaAnalysis.style.keywords,
                 facts: [...personaAnalysis.facts, ...personaAnalysis.beliefs]
             }
         });

        return { 
            status: "processed", 
            analysis: "Text context extracted",
            style: personaAnalysis.style, // Return style so Queue updates 'transcript' field
            artifacts: { text: textToProcess }
        };
    }
}

export async function ingestionRoutes(fastify: FastifyInstance) {
  // Step 0: List Scanned Content
  fastify.get('/ingest/list', async (request, reply) => {
    try {
        let user;
        try {
             user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
             return reply.code(401).send({ error: "Unauthorized" });
        }
        
        const items = await prisma.contentItem.findMany({
            where: { creatorId: user.id },
            orderBy: { publishedAt: 'desc' },
            include: { comments: true } // Include comments to count them
        });

        const mappedItems = items.map(item => ({
            id: item.id,
            externalId: item.externalId,
            title: item.title || "Untitled",
            description: item.description,
            thumbnail: item.thumbnail,
            status: item.status,
            url: item.platform === 'YOUTUBE' ? `https://youtube.com/watch?v=${item.externalId}` : item.imagePath,
            type: item.platform === 'YOUTUBE' ? 'video' : 'post',
            date: item.publishedAt?.toISOString() || new Date().toISOString(),
            stats: {
                comments: item.comments.length, // Simple count for now
                // Views/Likes generally not stored unless we expanded schema, but we can return 0 or cached values if we added them.
                // Schema update for stats wasn't done, only new fields for queue.
                // Let's return "N/A" or "0" since we don't persist these dynamic stats yet.
                views: "0", 
                likes: "0"
            }
        }));

        return { status: 'success', data: { items: mappedItems } };
    } catch (e) {
        console.error("[List Error]", e);
        reply.code(500);
        return { status: 'error', error: 'Failed to fetch items' };
    }
  });

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
    } catch (e: any) {
        console.error("[Discovery Error]", e);
        reply.code(400); 
        return { 
            status: 'error', 
            error: e instanceof Error ? e.message : 'Unknown error',
            details: e 
        };
    }
  });

  // Step 3: Trigger Processing (Queue)
  fastify.post('/ingest/queue/:id', async (request, reply) => {
      try {
        const { id } = z.object({ id: z.string() }).parse(request.params);
        
        // 1. Mark as PROCESSING
        const item = await prisma.contentItem.update({
            where: { id },
            data: { status: 'PROCESSING' }
        });
        
        // 2. Trigger Async Processing (Fire & Forget for MVP)
        const type = item.platform === 'YOUTUBE' ? 'video' : 'post';
        const url = item.platform === 'YOUTUBE' ? `https://youtube.com/watch?v=${item.externalId}` : (item.imagePath || item.externalId);
        
        parseContentItem(item.creatorId, { url: url!, type, contentId: item.id })
            .then(async (res) => {
                if (!res) return;
                
                let audioPath = null;
                let transcript = null;
                let segments = null;

                // Check if this is the video result with artifacts
                if ('artifacts' in res) {
                     // @ts-ignore - TS might struggle with union inference here without explicit type
                     audioPath = res.artifacts?.vocals;
                     // @ts-ignore
                     segments = res.artifacts?.segments;
                     transcript = JSON.stringify(res.style);
                }

                await prisma.contentItem.update({
                    where: { id },
                    data: { 
                        status: 'COMPLETED',
                        audioPath: audioPath || null, 
                        transcript: transcript || null,
                        diarization: segments || []
                    }
                });
                console.log(`[Queue] Completed ${id}`);
            })
            .catch(async (e) => {
                console.error(`[Queue] Failed ${id}`, e);
                await prisma.contentItem.update({
                    where: { id },
                    data: { status: 'FAILED' }
                });
            });

        return { status: 'queued', item };
      } catch (e) {
          reply.code(400);
          return { status: 'error', error: e };
      }
  });

  // Step 4: Delete Item
  fastify.delete('/ingest/item/:id', async (request, reply) => {
      try {
        let user;
        try {
             user = await (request as any).jwtVerify() as { id: string };
        } catch (e) {
             return reply.code(401).send({ error: "Unauthorized" });
        }

        const { id } = z.object({ id: z.string() }).parse(request.params);
        
        const item = await prisma.contentItem.findUnique({
            where: { id }
        });

        if (!item) return reply.code(404).send({ error: "Not found" });
        if (item.creatorId !== user.id) return reply.code(403).send({ error: "Forbidden" });
        
        // 1. Delete associated files from Storage
        if (item.audioPath) {
            await storageService.delete(item.audioPath);
        }
        
        // 2. Delete from DB
        await prisma.contentItem.delete({
            where: { id }
        });

        return { status: 'success', id };
      } catch (e) {
          console.error("Delete failed", e);
          reply.code(500); 
          return { status: 'error', error: 'Failed to delete item' };
      }
  });

  // Batch Queue
  fastify.post('/ingest/batch/queue', async (request, reply) => {
      try {
          let user;
          try {
               user = await (request as any).jwtVerify() as { id: string };
          } catch (e) {
               return reply.code(401).send({ error: "Unauthorized" });
          }

          const { ids } = z.object({ ids: z.array(z.string()) }).parse(request.body);

          // Get items to confirm ownership
          const items = await prisma.contentItem.findMany({
              where: {
                  id: { in: ids },
                  creatorId: user.id
              }
          });
          
          if (items.length === 0) return { status: 'success', msg: 'No matching items found' };

          // Mark all as PROCESSING first
          await prisma.contentItem.updateMany({
              where: { id: { in: items.map(i => i.id) } },
              data: { status: 'PROCESSING' }
          });

          // Fire and forget processing loop
          items.forEach(item => {
              if (item.status === 'COMPLETED') return; // Skip if already done? Actually user might want re-ingest. Let's allow it but UI should hide it.
              
              const type = item.platform === 'YOUTUBE' ? 'video' : 'post';
              const url = item.platform === 'YOUTUBE' ? `https://youtube.com/watch?v=${item.externalId}` : (item.imagePath || item.externalId);
              
              parseContentItem(item.creatorId, { url: url!, type, contentId: item.id })
                .then(async (res) => {
                    if (!res) return;
                    
                    let audioPath = null;
                    let transcript = null;
                    let segments = null;

                    if ('artifacts' in res) {
                        // @ts-ignore
                        audioPath = res.artifacts?.vocals;
                        // @ts-ignore
                        segments = res.artifacts?.segments;
                        transcript = JSON.stringify(res.style);
                    }

                    await prisma.contentItem.update({
                        where: { id: item.id },
                        data: { 
                            status: 'COMPLETED',
                            audioPath: audioPath || null, 
                            transcript: transcript || null,
                            diarization: segments || []
                        }
                    });
                })
                .catch(async (e) => {
                    console.error(`[Batch Queue] Failed ${item.id}`, e);
                    await prisma.contentItem.update({
                        where: { id: item.id },
                        data: { status: 'FAILED' }
                    });
                });
          });

          return { status: 'success', msg: `Queued ${items.length} items` };

      } catch (e) {
          console.error("Batch Queue Error", e);
          reply.code(500);
          return { status: 'error', error: 'Failed to batch queue items' };
      }
  });

  // Batch Delete
  fastify.post('/ingest/batch/delete', async (request, reply) => {
      try {
          let user;
          try {
               user = await (request as any).jwtVerify() as { id: string };
          } catch (e) {
               return reply.code(401).send({ error: "Unauthorized" });
          }

          const { ids } = z.object({ ids: z.array(z.string()) }).parse(request.body);

          const items = await prisma.contentItem.findMany({
              where: {
                  id: { in: ids },
                  creatorId: user.id
              }
          });

          // Delete files for each item
          for (const item of items) {
              if (item.audioPath) {
                  await storageService.delete(item.audioPath).catch(err => console.error(`Failed to delete file for ${item.id}`, err));
              }
          }

          // Delete DB records
          await prisma.contentItem.deleteMany({
              where: {
                  id: { in: ids },
                  creatorId: user.id
              }
          });

          return { status: 'success', count: items.length };
      } catch (e) {
          console.error("Batch Delete Error", e);
          reply.code(500);
          return { status: 'error', error: 'Failed to batch delete items' };
      }
  });



  // Step 5: Reset / Clear All Training Data
  fastify.delete('/ingest/reset', async (request, reply) => {
      console.log("[Reset] Resetting creator training data...");
      try {
          let user;
          try {
               user = await (request as any).jwtVerify() as { id: string };
          } catch (e) {
               return reply.code(401).send({ error: "Unauthorized" });
          }
          
          const creatorId = user.id;

          // 1. Delete all ContentItems from DB
          // We do this first or alongside storage cleanup
          await prisma.contentItem.deleteMany({
              where: { creatorId }
          });
          
          // 2. Clear Storage Bucket
          // Path: ingest/{creatorId}/...
          const folder = `ingest/${creatorId}`;
          const files = await storageService.list(folder);
          
          if (files.length > 0) {
              await storageService.deleteMany(files);
          }
          
          // 3. Reset Persona Profile (The "Brain")
          // If we want a full reset of the twin's knowledge:
          await prisma.personaProfile.delete({
             where: { creatorId }
          }).catch(() => {}); // Ignore if not exists

          console.log(`[Reset] Completed for ${creatorId}: Deleted items and ${files.length} files.`);

          return { status: 'success', message: 'Twin training data reset complete' };
      } catch (e) {
          console.error("[Reset Error]", e);
          reply.code(500);
          return { status: 'error', error: 'Failed to reset training data' };
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
    } catch (e: any) {
        console.error("Parse Error", e);
        const msg = e instanceof Error ? e.message : String(e);
        reply.code(400); 
        return { status: 'error', error: msg };
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
        
        // 1. Fetch Basic Metadata (Sync) for UI Feedback
        // Improve: Use OAuth token if available to bypass Rate Limits on Metadata
        const connection = await prisma.platformConnection.findFirst({
            where: { creatorId: user.id, platform: 'YOUTUBE' }
        });

        const audio = new AudioService();
        const meta = await audio.getVideoMetadata(body.url, connection?.accessToken || undefined, connection?.refreshToken || undefined);
        
        // Robust ID extraction
        // Use AudioService logic if possible, or updated regex here
        const videoId = body.url.match(/(?:v=|\/|shorts\/|live\/)([\w-]{11})(?:\?|&|\/|$)/)?.[1] || `link_${Date.now()}`;

        // 2. Dedup Check
        const existing = await prisma.contentItem.findFirst({
             where: { externalId: videoId, platform: 'YOUTUBE', creatorId: user.id }
        });

        if (existing) {
             return { status: 'exists', data: existing };
        }

        // 3. Create Record (Pending)
        const item = await prisma.contentItem.create({
            data: {
                creatorId: user.id,
                platform: 'YOUTUBE',
                externalId: videoId,
                title: meta.title || "Processing Link...",
                description: meta.description || "",
                thumbnail: meta.thumbnail || null,
                status: 'PROCESSING',
                publishedAt: new Date()
            }
        });

        // 3. Trigger Async Processing (Fire & Forget)
        parseContentItem(user.id, { url: body.url, type: 'video', contentId: item.id })
            .then(async (res) => {
                 if (!res) return;
                 // @ts-ignore
                 const audioPath = res.artifacts?.vocals;
                 // @ts-ignore
                 const segments = res.artifacts?.segments;
                 const transcript = JSON.stringify(res.style);

                 await prisma.contentItem.update({
                     where: { id: item.id },
                     data: { 
                         status: 'COMPLETED',
                         audioPath: audioPath || null,
                         transcript: transcript || null,
                         diarization: segments || []
                     }
                 });
            })
            .catch(async (e) => {
                console.error(`[QuickLink] Parse Failed`, e);
                await prisma.contentItem.update({ where: { id: item.id }, data: { status: 'FAILED' }});
            });

        return { status: 'queued', data: item };
      } catch (e: any) {
          console.error("QuickLink Error", e);
          const msg = e instanceof Error ? e.message : String(e);
          reply.code(400); 
          return { status: 'error', error: msg };
      }
  });
}
