import { eq, desc } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { sessionSnapshots } from '../db/schema.js';
import { redis } from '../db/redis.js';
import type { ConversationContext } from './types.js';

const SNAPSHOT_TTL = 3600;
const CACHE_PREFIX = 'session:snapshot:';

export interface PersistedSnapshot {
  machineState: Record<string, unknown>;
  context: ConversationContext;
}

export class SnapshotRepository {
  async load(sessionId: string): Promise<PersistedSnapshot | null> {
    const cached = await redis.get(`${CACHE_PREFIX}${sessionId}`);
    if (cached) return JSON.parse(cached) as PersistedSnapshot;

    const row = await db.query.sessionSnapshots.findFirst({
      where: eq(sessionSnapshots.sessionId, sessionId),
      orderBy: desc(sessionSnapshots.createdAt),
    });
    if (!row) return null;

    const snapshot: PersistedSnapshot = {
      machineState: row.machineState as Record<string, unknown>,
      context: row.context as unknown as ConversationContext,
    };

    redis.set(`${CACHE_PREFIX}${sessionId}`, JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL).catch(() => {});
    return snapshot;
  }

  async save(
    sessionId: string,
    agentId: string,
    nodeId: string,
    machineState: Record<string, unknown>,
    context: ConversationContext,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await db.insert(sessionSnapshots).values({
      id, sessionId, agentId, nodeId, machineState,
      context: context as unknown as Record<string, unknown>,
    });

    const snapshot: PersistedSnapshot = { machineState, context };
    redis.set(`${CACHE_PREFIX}${sessionId}`, JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL).catch(() => {});
  }

  async delete(sessionId: string): Promise<void> {
    await redis.del(`${CACHE_PREFIX}${sessionId}`);
    await db.delete(sessionSnapshots).where(eq(sessionSnapshots.sessionId, sessionId));
  }
}

export const snapshotRepository = new SnapshotRepository();
