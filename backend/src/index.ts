import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import agentRoutes from './routes/agents.js';
import toolRoutes from './routes/tools.js';
import sessionRoutes from './routes/sessions.js';
import mcpPlugin from './mcp/plugin.js';
import aiEditorRoutes from './routes/ai-editor.js';

const app = Fastify({
  logger: process.env.NODE_ENV === 'production'
    ? true
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      },
});

app.setErrorHandler((error: unknown, request, reply) => {
  const err = error as { statusCode?: number; message?: string };
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    reply.code(err.statusCode).send({ error: err.message ?? 'Request error' });
  } else {
    request.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  }
});

await app.register(cors, {
  origin: config.CORS_ORIGINS.split(','),
});

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Proxy LiteLLM model list so the frontend doesn't need the LiteLLM URL.
app.get('/api/models', async (_request, reply) => {
  const res = await fetch(`${config.LITELLM_BASE_URL.replace(/\/$/, '')}/v1/models`);
  const data = await res.json();
  return reply.send(data);
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(agentRoutes, { prefix: '/api/agents' });
await app.register(toolRoutes, { prefix: '/api/tools' });
await app.register(sessionRoutes, { prefix: '/api' });
await app.register(mcpPlugin);
await app.register(aiEditorRoutes, { prefix: '/api/ai-editor' });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
