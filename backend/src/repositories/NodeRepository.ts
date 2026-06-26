import { and, eq } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { agentNodes } from '../db/schema.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class NodeRepository {
  async findByAgentVersion(agentId: string, version: string) {
    return db.query.agentNodes.findMany({
      where: and(eq(agentNodes.agentId, agentId), eq(agentNodes.version, version)),
    });
  }

  async bulkInsert(nodes: Array<{
    id: string;
    agentId: string;
    version: string;
    name: string;
    nodeType: string;
    semanticAgentConfigId?: string | null;
    phaseLabel?: string;
    progressWeight?: number;
    configJson?: unknown;
    positionX?: number;
    positionY?: number;
  }>, tx?: Tx) {
    if (nodes.length === 0) return;
    const target = tx ?? db;
    await target.insert(agentNodes).values(nodes);
  }

  async deleteByAgentVersion(agentId: string, version: string, tx?: Tx) {
    const target = tx ?? db;
    await target.delete(agentNodes).where(
      and(eq(agentNodes.agentId, agentId), eq(agentNodes.version, version)),
    );
  }
}

export const nodeRepository = new NodeRepository();
