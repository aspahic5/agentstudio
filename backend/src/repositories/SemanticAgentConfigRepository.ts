import { and, eq } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { semanticAgentConfigs } from '../db/schema.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SemanticAgentConfigRepository {
  async findByAgentVersion(agentId: string, version: string) {
    return db.query.semanticAgentConfigs.findMany({
      where: and(
        eq(semanticAgentConfigs.agentId, agentId),
        eq(semanticAgentConfigs.version, version),
      ),
    });
  }

  async bulkInsert(configs: Array<{
    id: string;
    agentId: string;
    version: string;
    nodeId: string;
    name: string;
    systemPrompt: string;
    outputSchemaJson?: unknown;
    maxRetries?: number;
    temperature?: number;
    maxOutputTokens?: number | null;
    outputFormatting?: string;
    outputDensity?: string;
    reasoningFormatting?: string;
    thinkingGuidance?: string | null;
    modelAlias?: string | null;
  }>, tx?: Tx) {
    if (configs.length === 0) return;
    const target = tx ?? db;
    await target.insert(semanticAgentConfigs).values(configs);
  }

  async deleteByAgentVersion(agentId: string, version: string, tx?: Tx) {
    const target = tx ?? db;
    await target.delete(semanticAgentConfigs).where(
      and(
        eq(semanticAgentConfigs.agentId, agentId),
        eq(semanticAgentConfigs.version, version),
      ),
    );
  }
}

export const saConfigRepository = new SemanticAgentConfigRepository();
