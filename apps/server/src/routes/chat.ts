import { FastifyInstance } from 'fastify';
import { LLMService } from '../services/llm';
import { HiggsService } from '../services/higgs';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { storageService } from '../services/storage';

const ChatSchema = z.object({
  text: z.string().min(1),
  creatorId: z.string() 
});

export async function chatRoutes(fastify: FastifyInstance) {
  const llmService = new LLMService();
  const higgsService = new HiggsService();

  // Mode 1: Chat (Text -> LLM -> Text + Audio)
  fastify.post('/chat/text', async (request, reply) => {
    try {
        const body = ChatSchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(400).send({ error: "Invalid Input", details: body.error });
        }
        const { text, creatorId } = body.data;
        
        // 0. Resolve Creator/Session (Test Mode)
        // We treat the "Tester" as a Fan with fingerprint = "creator-test-{creatorId}"
        const testerFingerprint = `creator-test-${creatorId}`;
        
        // Find or Create Tester Fan
        let fan = await prisma.fan.findFirst({ where: { fingerprint: testerFingerprint } });
        if (!fan) {
            fan = await prisma.fan.create({
                data: {
                    fingerprint: testerFingerprint,
                    email: null
                }
            });
        }

        // Find or Create Active Session
        let session = await prisma.chatSession.findFirst({
            where: { fanId: fan.id, creatorId: creatorId },
            orderBy: { updatedAt: 'desc' }
        });

        if (!session) {
            session = await prisma.chatSession.create({
                data: { fanId: fan.id, creatorId }
            });
        }

        // Save User Message
        await prisma.message.create({
            data: {
                chatSessionId: session.id,
                role: 'USER',
                content: text
            }
        });
        
        // 1. Get LLM Response
        // Retrieve last 5 messages for context
        const history = await prisma.message.findMany({
            where: { chatSessionId: session.id },
            orderBy: { createdAt: 'asc' },
            take: 10 // Take last 10
        });

        const context = history.map(m => `${m.role}: ${m.content}`).join("\n");
        const systemPrompt = `You are a digital twin of the creator. Respond in their style. Keep response under 50 words. Context:\n${context}`;
        
        const responseText = await llmService.analyzeText(systemPrompt, text);

        // 2. Synthesize Audio
        let audioUrl = null;
        try {
            audioUrl = await higgsService.synthesize(responseText, creatorId);
        } catch (e) {
            console.error("Audio gen failed in chat", e);
        }

        // Save Assistant Message
        await prisma.message.create({
            data: {
                chatSessionId: session.id,
                role: 'ASSISTANT',
                content: responseText,
                audioUrl: audioUrl || undefined
            }
        });

        // Update Session Timestamp
        await prisma.chatSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date() }
        });
        
        return {
            status: 'success',
            text: responseText,
            audioUrl
        };
    } catch (e: any) {
        request.log.error(e);
        reply.code(500);
        return { status: 'error', error: e.message || 'Chat failed' };
    }
  });

  // Get History
  fastify.get('/chat/history', async (request, reply) => {
      try {
           const { creatorId } = request.query as { creatorId: string };
           if (!creatorId) return { status: 'error', error: 'Missing creatorId' };
           
           const testerFingerprint = `creator-test-${creatorId}`;
           const fan = await prisma.fan.findFirst({ where: { fingerprint: testerFingerprint } });
           if (!fan) return { status: 'success', messages: [] };

           const session = await prisma.chatSession.findFirst({
                where: { fanId: fan.id, creatorId: creatorId },
                orderBy: { updatedAt: 'desc' }
           });
           
           if (!session) return { status: 'success', messages: [] };

           const messages = await prisma.message.findMany({
               where: { chatSessionId: session.id },
               orderBy: { createdAt: 'asc' }
           });

           return { 
               status: 'success', 
               messages: messages.map(m => ({
                   role: m.role.toLowerCase(),
                   text: m.content,
                   audioUrl: m.audioUrl
               }))
           };
      } catch (e) {
          return { status: 'error', error: e };
      }
  });



// ... (existing helper function to delete audio if valid)

  // Clear History
  fastify.delete('/chat/history', async (request, reply) => {
       try {
           const { creatorId } = request.query as { creatorId: string };
           if (!creatorId) return { status: 'error', error: 'Missing creatorId' }; 
           
           const testerFingerprint = `creator-test-${creatorId}`;
           const fan = await prisma.fan.findFirst({ where: { fingerprint: testerFingerprint } });
           if (!fan) return { status: 'success' };

           const sessions = await prisma.chatSession.findMany({
                where: { fanId: fan.id, creatorId }
           });

           for (const session of sessions) {
               // Find messages with audio
               const messages = await prisma.message.findMany({
                   where: { chatSessionId: session.id, audioUrl: { not: null } }
               });
               
               // Delete files from storage
               for (const m of messages) {
                   if (m.audioUrl) {
                       await storageService.delete(m.audioUrl).catch(() => {});
                   }
               }
               
               await prisma.message.deleteMany({
                   where: { chatSessionId: session.id }
               });
               await prisma.chatSession.delete({
                   where: { id: session.id }
               });
           }
           
           return { status: 'success', message: 'Chat history cleared' };

       } catch (e) {
           return { status: 'error', error: e };
       }
  });

  // Mode 2: Read Aloud (Text -> Audio)
  fastify.post('/chat/tts', async (request, reply) => {
    try {
        const body = ChatSchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(400).send({ error: "Invalid Input", details: body.error });
        }
        const { text, creatorId } = body.data;

        const audioUrl = await higgsService.synthesize(text, creatorId);

        return {
            status: 'success',
            audioUrl
        };
    } catch (e: any) {
        request.log.error(e);
        reply.code(500);
        return { status: 'error', error: e.message || 'TTS failed' };
    }
  });
}
