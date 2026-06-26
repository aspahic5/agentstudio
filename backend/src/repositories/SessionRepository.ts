import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { sessions } from '../db/schema.js';

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
    return db.query.sessions.findMany({
      where: and(eq(sessions.agentId, agentId), eq(sessions.userId, userId)),
      orderBy: desc(sessions.createdAt),
    });
  }

  async delete(id: string) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
}

export const sessionRepository = new SessionRepository();
