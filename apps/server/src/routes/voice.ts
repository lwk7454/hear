import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/db'
import { storageService } from '../services/storage'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'

// Ensure storage directory exists
const VOICE_STORAGE_DIR = path.resolve(__dirname, '../../storage/voice_samples');
if (!fs.existsSync(VOICE_STORAGE_DIR)) {
    fs.mkdirSync(VOICE_STORAGE_DIR, { recursive: true });
}

export async function voiceRoutes(fastify: FastifyInstance) {
    
    fastify.post('/voice/enroll', async (request, reply) => {
        try {
            let user;
            try {
                 user = await (request as any).jwtVerify() as { id: string };
            } catch (e) {
                 return reply.code(401).send({ error: "Unauthorized" });
            }

            const data = await request.file();
            if (!data) {
                return reply.code(400).send({ error: "No file uploaded" });
            }

            // Validate Mime Type (basic check)
            if (!data.mimetype.startsWith('audio/')) {
                 return reply.code(400).send({ error: "Invalid file type. Please upload audio." });
            }

            const filename = `${user.id}_golden.wav`; // Normalize to one file per user for now
            const savePath = path.join(VOICE_STORAGE_DIR, filename);

            await pipeline(data.file, fs.createWriteStream(savePath));

            // Upload to Supabase
            const publicUrl = await storageService.upload(savePath, `voice_samples/${filename}`);
            
            // Clean up local file? Keep it as cache for now if needed, or delete. 
            // In Prod/Lambda, we MUST delete or let it expire.
            // Let's keep it for now as "cache" since we are in local dev mostly.

            // Update DB
            await prisma.creator.update({
                where: { id: user.id },
                data: {
                    voiceSample: publicUrl, // Save URL instead of local path
                    voiceStatus: 'ENROLLED'
                }
            });
            
            console.log(`[Voice] Enrolled ${user.id}. Saved to ${publicUrl}`);

            return { status: 'success', message: 'Voice enrolled successfully', path: publicUrl };

        } catch (e) {
            console.error("[Voice Enrollment Error]", e);
            reply.code(500).send({ error: "Failed to upload voice sample" });
        }
    });

    fastify.get('/voice/status', async (request, reply) => {
        try {
            let user;
            try {
                 user = await (request as any).jwtVerify() as { id: string };
            } catch (e) {
                 return reply.code(401).send({ error: "Unauthorized" });
            }

            const creator = await prisma.creator.findUnique({
                where: { id: user.id },
                select: { voiceStatus: true, voiceSample: true }
            });

            return { 
                status: 'success', 
                enrolled: creator?.voiceStatus === 'ENROLLED',
                hasFile: !!creator?.voiceSample
            };
        } catch (e) {
            reply.code(500);
            return { error: e };
        }
    });
}
