import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/db'
import { verifyUser } from '../lib/auth'

const FactUpdateSchema = z.object({
  content: z.string().optional(),
  status: z.enum(['ALLOWED', 'FORBIDDEN', 'EDITED']).optional(),
  isManual: z.boolean().optional()
});

const FactCreateSchema = z.object({
  content: z.string(),
  status: z.enum(['ALLOWED', 'FORBIDDEN', 'EDITED']).default('ALLOWED')
});

export async function factRoutes(fastify: FastifyInstance) {
  // 1. List All Facts
  fastify.get('/facts', async (request, reply) => {
    try {
      const user = await verifyUser(request);
      
      const profile = await prisma.personaProfile.findUnique({
        where: { creatorId: user.id },
        include: { facts: { orderBy: { createdAt: 'desc' } } }
      });

      if (!profile) return { status: 'success', facts: [] };

      return { status: 'success', facts: profile.facts };
    } catch (e) {
      console.error("[Fact List Error]", e);
      reply.code(500);
      return { status: 'error', error: 'Failed to fetch facts' };
    }
  });

  // 2. Update Fact
  fastify.patch('/facts/:id', async (request, reply) => {
    try {
      const user = await verifyUser(request);
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = FactUpdateSchema.parse(request.body);

      // Security check: ensure the fact belongs to the user's profile
      const fact = await prisma.personaFact.findUnique({
        where: { id },
        include: { profile: true }
      });

      if (!fact || fact.profile.creatorId !== user.id) {
        return reply.code(403).send({ error: "Forbidden or not found" });
      }

      const updateData: any = { ...body };
      if (body.content) {
        updateData.status = 'EDITED';
        updateData.isManual = true;
      }

      const updatedFact = await prisma.personaFact.update({
        where: { id },
        data: updateData
      });

      return { status: 'success', fact: updatedFact };
    } catch (e: any) {
      console.error("[Fact Update Error]", e);
      reply.code(400);
      return { status: 'error', error: e.message };
    }
  });

  // 3. Create Manual Fact
  fastify.post('/facts', async (request, reply) => {
    try {
      const user = await verifyUser(request);
      const body = FactCreateSchema.parse(request.body);

      const profile = await prisma.personaProfile.findUnique({
        where: { creatorId: user.id }
      });

      if (!profile) {
        return reply.code(404).send({ error: "Persona profile not found. Ingest some content first." });
      }

      const fact = await prisma.personaFact.create({
        data: {
          profileId: profile.id,
          content: body.content,
          status: body.status,
          isManual: true
        }
      });

      return { status: 'success', fact };
    } catch (e: any) {
      console.error("[Fact Create Error]", e);
      reply.code(400);
      return { status: 'error', error: e.message };
    }
  });

  // 4. Delete Fact
  fastify.delete('/facts/:id', async (request, reply) => {
    try {
      const user = await verifyUser(request);
      const { id } = z.object({ id: z.string() }).parse(request.params);

      const fact = await prisma.personaFact.findUnique({
        where: { id },
        include: { profile: true }
      });

      if (!fact || fact.profile.creatorId !== user.id) {
        return reply.code(403).send({ error: "Forbidden or not found" });
      }

      await prisma.personaFact.delete({ where: { id } });

      return { status: 'success', id };
    } catch (e: any) {
      console.error("[Fact Delete Error]", e);
      reply.code(400);
      return { status: 'error', error: e.message };
    }
  });
}
