import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server.js';
import { verifyAccessToken } from '../auth/jwt.js';

export default async function mcpPlugin(app: FastifyInstance): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  async function extractAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Bearer token required' });
      return;
    }
    try {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token);
      (request.raw as any).auth = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  }

  app.post('/mcp', { onRequest: extractAuth }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
      return;
    }

    if (!sessionId && isInitializeRequest(request.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });
      const server = createMcpServer();

      transport.onclose = () => {
        const sid = (transport as any).sessionId;
        if (sid) transports.delete(sid);
      };

      await server.connect(transport);

      const sid = (transport as any).sessionId as string;
      if (sid) transports.set(sid, transport);

      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
      return;
    }

    reply.code(400).send({ error: 'Bad request: missing session ID or not an initialize request' });
  });

  app.get('/mcp', { onRequest: extractAuth }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      reply.code(400).send({ error: 'Invalid or missing session ID' });
      return;
    }
    reply.hijack();
    await transports.get(sessionId)!.handleRequest(request.raw, reply.raw);
  });

  app.delete('/mcp', { onRequest: extractAuth }, async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      reply.code(400).send({ error: 'Invalid or missing session ID' });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.close();
    transports.delete(sessionId);
    reply.code(200).send({ status: 'session terminated' });
  });

  app.addHook('onClose', async () => {
    for (const transport of transports.values()) {
      await transport.close();
    }
    transports.clear();
  });
}
