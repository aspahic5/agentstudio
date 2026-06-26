import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/drizzle.js';
import { agentVersions, agents } from '../db/schema.js';
import { nodeRepository } from './NodeRepository.js';
import { saConfigRepository } from './SemanticAgentConfigRepository.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface NodePayload {
  id: string;
  name: string;
  nodeType: string;
  semanticAgentConfigId?: string | null;
  phaseLabel?: string;
  progressWeight?: number;
  configJson?: unknown;
  positionX?: number;
  positionY?: number;
}

interface SaConfigPayload {
  id: string;
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
}

export class VersionRepository {
  async list(agentId: string) {
    return db.query.agentVersions.findMany({
      where: eq(agentVersions.agentId, agentId),
      orderBy: desc(agentVersions.createdAt),
    });
  }

  async findByAgentVersion(agentId: string, version: string) {
    return db.query.agentVersions.findFirst({
      where: and(
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.version, version),
      ),
    });
  }

  async saveNewVersion(
    agentId: string,
    version: string,
    label: string | undefined,
    nodes: NodePayload[],
    saConfigs: SaConfigPayload[],
  ) {
    const { nodeIdMap, configIdMap } = this.buildIdMaps(nodes, saConfigs);

    try {
      await db.transaction(async (tx) => {
        await tx.insert(agentVersions).values({
          id: crypto.randomUUID(),
          agentId,
          version,
          label,
        });

        await nodeRepository.bulkInsert(
          this.remapNodes(nodes, agentId, version, nodeIdMap, configIdMap),
          tx,
        );

        await saConfigRepository.bulkInsert(
          this.remapConfigs(saConfigs, agentId, version, nodeIdMap, configIdMap),
          tx,
        );

        await tx.update(agents)
          .set({ currentVersion: version, updatedAt: new Date() })
          .where(eq(agents.id, agentId));
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('uq_agent_versions_agent_version')) {
        throw { statusCode: 409, message: `Version ${version} already exists` };
      }
      throw err;
    }
  }

  async overwriteVersion(
    agentId: string,
    version: string,
    nodes: NodePayload[],
    saConfigs: SaConfigPayload[],
  ) {
    const { nodeIdMap, configIdMap } = this.buildIdMaps(nodes, saConfigs);

    await db.transaction(async (tx) => {
      await this.assertVersionExists(tx, agentId, version);

      await saConfigRepository.deleteByAgentVersion(agentId, version, tx);
      await nodeRepository.deleteByAgentVersion(agentId, version, tx);

      await nodeRepository.bulkInsert(
        this.remapNodes(nodes, agentId, version, nodeIdMap, configIdMap),
        tx,
      );

      await saConfigRepository.bulkInsert(
        this.remapConfigs(saConfigs, agentId, version, nodeIdMap, configIdMap),
        tx,
      );
    });
  }

  async updateLabel(agentId: string, version: string, label: string) {
    const result = await db.update(agentVersions)
      .set({ label })
      .where(and(
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.version, version),
      ))
      .returning();
    if (result.length === 0) {
      throw { statusCode: 404, message: `Version ${version} not found` };
    }
    return result[0];
  }

  async deleteVersion(agentId: string, version: string) {
    await db.transaction(async (tx) => {
      await this.assertVersionExists(tx, agentId, version);

      await saConfigRepository.deleteByAgentVersion(agentId, version, tx);
      await nodeRepository.deleteByAgentVersion(agentId, version, tx);
      await tx.delete(agentVersions).where(
        and(
          eq(agentVersions.agentId, agentId),
          eq(agentVersions.version, version),
        ),
      );
    });
  }

  private async assertVersionExists(tx: Tx, agentId: string, version: string) {
    const [existing] = await tx.select({ id: agentVersions.id }).from(agentVersions).where(
      and(eq(agentVersions.agentId, agentId), eq(agentVersions.version, version)),
    );
    if (!existing) {
      throw { statusCode: 404, message: `Version ${version} not found` };
    }
  }

  private buildIdMaps(nodes: NodePayload[], saConfigs: SaConfigPayload[]) {
    const nodeIdMap = new Map<string, string>();
    for (const n of nodes) nodeIdMap.set(n.id, crypto.randomUUID());

    const configIdMap = new Map<string, string>();
    for (const c of saConfigs) configIdMap.set(c.id, crypto.randomUUID());

    return { nodeIdMap, configIdMap };
  }

  private remapNodes(
    nodes: NodePayload[], agentId: string, version: string,
    nodeIdMap: Map<string, string>, configIdMap: Map<string, string>,
  ) {
    return nodes.map(n => ({
      id: nodeIdMap.get(n.id)!,
      agentId,
      version,
      name: n.name,
      nodeType: n.nodeType,
      semanticAgentConfigId: n.semanticAgentConfigId
        ? (configIdMap.get(n.semanticAgentConfigId) ?? n.semanticAgentConfigId)
        : null,
      phaseLabel: n.phaseLabel,
      progressWeight: n.progressWeight,
      configJson: n.configJson,
      positionX: n.positionX,
      positionY: n.positionY,
    }));
  }

  private remapConfigs(
    saConfigs: SaConfigPayload[], agentId: string, version: string,
    nodeIdMap: Map<string, string>, configIdMap: Map<string, string>,
  ) {
    return saConfigs.map(c => ({
      id: configIdMap.get(c.id)!,
      agentId,
      version,
      nodeId: nodeIdMap.get(c.nodeId) ?? c.nodeId,
      name: c.name,
      systemPrompt: c.systemPrompt,
      outputSchemaJson: c.outputSchemaJson,
      maxRetries: c.maxRetries,
      temperature: c.temperature,
      maxOutputTokens: c.maxOutputTokens,
      outputFormatting: c.outputFormatting,
      outputDensity: c.outputDensity,
      reasoningFormatting: c.reasoningFormatting,
      thinkingGuidance: c.thinkingGuidance,
      modelAlias: c.modelAlias,
    }));
  }
}

export const versionRepository = new VersionRepository();
