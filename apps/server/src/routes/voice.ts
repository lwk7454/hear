import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/db.js'
import { storageService } from '../services/storage.js'
import fs from 'fs'
import { verifyUser } from '../lib/auth.js'

export async function voiceRoutes(fastify: FastifyInstance) {

    fastify.post('/voice/enroll', async (request, reply) => {
        try {
            const user = await verifyUser(request);
            const body = request.body as any;
            const youtubeUrl = body?.youtubeUrl?.value || body?.youtubeUrl;

            if (!youtubeUrl || typeof youtubeUrl !== 'string') {
                return reply.code(400).send({ error: "YouTube URL is required for enrollment" });
            }

            // 1. Set Status to PROCESSING immediately
            await prisma.creator.update({
                where: { id: user.id },
                data: {
                    voiceStatus: 'PROCESSING',
                    voiceSample: null // Clear old sample
                }
            });

            // 2. Start Background Job
            (async () => {
                try {
                    const { AudioService } = await import('../services/audio.js');
                    const audioService = new AudioService();

                    console.log(`[VoiceJob] Starting enrollment for ${user.id} with ${youtubeUrl}`);
                    const { audioPath, transcript } = await audioService.downloadAndExtractTranscript(youtubeUrl, user.id);

                    const publicUrl = await storageService.upload(audioPath, `voice_samples/${user.id}_golden.wav`, 'audio/wav');

                    await prisma.creator.update({
                        where: { id: user.id },
                        data: {
                            voiceSample: publicUrl,
                            voiceStatus: 'ENROLLED',
                            voiceTranscript: transcript
                        }
                    });

                    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    console.log(`[VoiceJob] Enrollment completed for ${user.id}`);

                } catch (err) {
                    console.error(`[VoiceJob] Failed for ${user.id}:`, err);
                    await prisma.creator.update({
                        where: { id: user.id },
                        data: { voiceStatus: 'FAILED' }
                    });
                }
            })();

            // 3. Return Accepted
            return reply.code(202).send({ status: 'processing', message: 'Voice enrollment started' });

        } catch (e) {
            console.error("[Voice Enrollment Error]", e);
            reply.code(500).send({ error: "Failed to start enrollment" });
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
