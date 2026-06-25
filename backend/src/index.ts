import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import mcpPlugin from './mcp/plugin.js';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

await app.register(cors, { origin: true });

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(mcpPlugin);

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
