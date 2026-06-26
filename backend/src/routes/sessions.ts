import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../validation.js';
import { authenticate } from '../auth/middleware.js';
import { agentRepository } from '../repositories/AgentRepository.js';
import { versionRepository } from '../repositories/VersionRepository.js';
import { sessionRepository } from '../repositories/SessionRepository.js';

const createSessionSchema = z.object({
  version: z.string().optional(),
});

export default async function sessionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.post('/agents/:agentId/sessions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = parseBody(createSessionSchema, request.body);

    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const version = body.version ?? agent.currentVersion;
    const versionRecord = await versionRepository.findByAgentVersion(agentId, version);
    if (!versionRecord) {
      return reply.code(404).send({ error: `Version ${version} not found` });
    }

    const session = await sessionRepository.create({
      agentId,
      version,
      userId: request.user.id,
    });
    return reply.code(201).send(session);
  });

  app.get('/agents/:agentId/sessions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return sessionRepository.listByAgentAndUser(agentId, request.user.id);
  });

  app.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    await sessionRepository.delete(sessionId);
    return reply.code(204).send();
  });
}
