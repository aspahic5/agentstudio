import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { sessions, sessionSnapshots } from '../db/schema.js';

export class SessionRepository {
  async create(data: { agentId: string; version: string; userId: string }) {
    const id = crypto.randomUUID();
    const [session] = await db.insert(sessions).values({
      id,
      agentId: data.agentId,
      version: data.version,
      userId: data.userId,
    }).returning();
    return session;
  }

  async findById(id: string) {
    return db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  }

  async listByAgentAndUser(agentId: string, userId: string) {
    const rows = await db
      .select({
        id: sessions.id,
        agentId: sessions.agentId,
        version: sessions.version,
        userId: sessions.userId,
        status: sessions.status,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        hasSnapshot: sql<boolean>`(EXISTS (
          SELECT 1 FROM session_snapshots
          WHERE session_snapshots.session_id = sessions.id
        ))`,
      })
      .from(sessions)
      .where(and(eq(sessions.agentId, agentId), eq(sessions.userId, userId)))
      .orderBy(desc(sessions.createdAt));
    return rows;
  }

  async delete(id: string) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
}

export const sessionRepository = new SessionRepository();
