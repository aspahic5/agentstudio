import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { toolDefinitions } from '../db/schema.js';

export class ToolDefinitionRepository {
  async list() {
    return db.query.toolDefinitions.findMany();
  }

  async findById(id: string) {
    return db.query.toolDefinitions.findFirst({ where: eq(toolDefinitions.id, id) });
  }

  async findByNames(names: string[]) {
    if (names.length === 0) return [];
    return db.query.toolDefinitions.findMany({
      where: inArray(toolDefinitions.name, names),
    });
  }

  async create(data: {
    name: string;
    description: string;
    urlTemplate?: string;
    method?: string;
    headers?: unknown;
    bodyTemplate?: string | null;
    responsePath?: string | null;
    authType?: string | null;
    parametersSchemaJson?: unknown;
  }) {
    const id = crypto.randomUUID();
    const [tool] = await db.insert(toolDefinitions).values({ id, ...data }).returning();
    return tool;
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    urlTemplate?: string;
    method?: string;
    headers?: unknown;
    bodyTemplate?: string | null;
    responsePath?: string | null;
    authType?: string | null;
    parametersSchemaJson?: unknown;
  }) {
    const [tool] = await db.update(toolDefinitions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(toolDefinitions.id, id))
      .returning();
    return tool;
  }

  async delete(id: string) {
    await db.delete(toolDefinitions).where(eq(toolDefinitions.id, id));
  }
}

export const toolDefinitionRepository = new ToolDefinitionRepository();
