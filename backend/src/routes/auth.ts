import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/jwt.js';
import { userRepository, hashRefreshToken } from '../repositories/UserRepository.js';
import { authenticate } from '../auth/middleware.js';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map(i => i.message).join(', ');
    throw { statusCode: 400, message: `Validation error: ${issues}` };
  }
  return result.data;
}

async function generateTokens(user: { id: string; email: string; role: string }) {
  const accessToken = await signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const rawRefreshToken = await signRefreshToken({ sub: user.id, type: 'refresh' });
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await userRepository.createRefreshToken(user.id, tokenHash, expiresAt);
  return { accessToken, refreshToken: rawRefreshToken };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = parseBody(registerSchema, request.body);

    const existing = await userRepository.findByEmail(body.email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await userRepository.create({ email: body.email, name: body.name, passwordHash });
    const tokens = await generateTokens(user);

    return reply.code(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  });

  app.post('/login', async (request, reply) => {
    const body = parseBody(loginSchema, request.body);

    const user = await userRepository.findByEmail(body.email);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const tokens = await generateTokens(user);
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...tokens };
  });

  app.get('/me', { onRequest: [authenticate] }, async (request, reply) => {
    const user = await userRepository.findById(request.user.id);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
  });

  app.post('/refresh', async (request, reply) => {
    const body = parseBody(refreshSchema, request.body);

    const tokenHash = hashRefreshToken(body.refreshToken);
    const stored = await userRepository.findRefreshToken(tokenHash);
    if (!stored) {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    try {
      await verifyRefreshToken(body.refreshToken);
    } catch {
      await userRepository.deleteRefreshToken(tokenHash);
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    if (new Date() > stored.expiresAt) {
      await userRepository.deleteRefreshToken(tokenHash);
      return reply.code(401).send({ error: 'Refresh token expired' });
    }

    await userRepository.deleteRefreshToken(tokenHash);

    const user = await userRepository.findById(stored.userId);
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const tokens = await generateTokens(user);
    return tokens;
  });
}
