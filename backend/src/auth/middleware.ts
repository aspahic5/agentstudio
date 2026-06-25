import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string; role: string };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    request.user = { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' });
  }
}
