import { eq, desc } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { agents } from '../db/schema.js';

export class AgentRepository {
  async list() {
    return db.query.agents.findMany({ orderBy: desc(agents.createdAt) });
  }

  async findById(id: string) {
    return db.query.agents.findFirst({ where: eq(agents.id, id) });
  }

  async create(data: {
    name: string;
    description: string;
    createdBy: string;
    inputContract?: unknown;
    metadata?: unknown;
  }) {
    const id = crypto.randomUUID();
    const [agent] = await db.insert(agents).values({
      id,
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      inputContract: data.inputContract,
      metadata: data.metadata ?? {},
    }).returning();
    return agent;
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    initialNodeId?: string | null;
    inputContract?: unknown;
    metadata?: unknown;
  }) {
    const [agent] = await db.update(agents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    return agent;
  }

  async updateCurrentVersion(id: string, version: string) {
    await db.update(agents)
      .set({ currentVersion: version, updatedAt: new Date() })
      .where(eq(agents.id, id));
  }

  async delete(id: string) {
    await db.delete(agents).where(eq(agents.id, id));
  }
}

export const agentRepository = new AgentRepository();
