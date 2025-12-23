import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/db'
import { storageService } from '../services/storage'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { verifyUser } from '../lib/auth'

// Ensure storage directory exists
const VOICE_STORAGE_DIR = path.resolve(__dirname, '../../storage/voice_samples');
if (!fs.existsSync(VOICE_STORAGE_DIR)) {
    fs.mkdirSync(VOICE_STORAGE_DIR, { recursive: true });
}

export async function voiceRoutes(fastify: FastifyInstance) {
    
    fastify.post('/voice/enroll', async (request, reply) => {
        try {
            const user = await verifyUser(request);

            const data = await request.file();
            if (!data) {
                return reply.code(400).send({ error: "No file uploaded" });
            }

            // Validate Mime Type (basic check)
            if (!data.mimetype.startsWith('audio/')) {
                 return reply.code(400).send({ error: "Invalid file type. Please upload audio." });
            }

            const filename = `${user.id}_golden.wav`; // Normalize to one file per user for now
            
            // Upload to Supabase directly (Stream)
            // Note: We assume mp3/wav based on mimetype or filename, but let's trust mimetype
            const publicUrl = await storageService.upload(data.file, `voice_samples/${filename}`, data.mimetype);

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
            const user = await verifyUser(request);

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
