import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../validation.js';
import { authenticate } from '../auth/middleware.js';
import { agentRepository } from '../repositories/AgentRepository.js';
import { versionRepository } from '../repositories/VersionRepository.js';
import { nodeRepository } from '../repositories/NodeRepository.js';
import { saConfigRepository } from '../repositories/SemanticAgentConfigRepository.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  initialNodeId: z.string().min(1).max(200),
  inputContract: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  initialNodeId: z.string().min(1).max(200).optional(),
  inputContract: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const nodeSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  nodeType: z.string().min(1).max(100),
  semanticAgentConfigId: z.string().max(200).nullable().optional(),
  phaseLabel: z.string().max(200).optional(),
  progressWeight: z.number().int().optional(),
  configJson: z.unknown().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const saConfigSchema = z.object({
  id: z.string().min(1).max(200),
  nodeId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  systemPrompt: z.string().max(100_000),
  outputSchemaJson: z.unknown().optional(),
  maxRetries: z.number().int().optional(),
  temperature: z.number().optional(),
  maxOutputTokens: z.number().int().nullable().optional(),
  outputFormatting: z.string().max(50).optional(),
  outputDensity: z.string().max(50).optional(),
  reasoningFormatting: z.string().max(50).optional(),
  thinkingGuidance: z.string().max(10_000).nullable().optional(),
  modelAlias: z.string().max(100).nullable().optional(),
});

const saveNewVersionSchema = z.object({
  version: z.string().regex(SEMVER_RE, 'Version must be semver (e.g. 1.0.0)'),
  label: z.string().max(200).optional(),
  nodes: z.array(nodeSchema).max(500),
  saConfigs: z.array(saConfigSchema).max(500),
});

const overwriteVersionSchema = z.object({
  nodes: z.array(nodeSchema).max(500),
  saConfigs: z.array(saConfigSchema).max(500),
});

const updateLabelSchema = z.object({
  label: z.string().min(1).max(200),
});

export default async function agentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  // --- Agent CRUD ---

  app.get('/', async () => {
    return agentRepository.list();
  });

  app.post('/', async (request, reply) => {
    const body = parseBody(createAgentSchema, request.body);
    const agent = await agentRepository.create({ ...body, createdBy: request.user.id });
    return reply.code(201).send(agent);
  });

  app.get('/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return agent;
  });

  app.put('/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = parseBody(updateAgentSchema, request.body);
    const existing = await agentRepository.findById(agentId);
    if (!existing) return reply.code(404).send({ error: 'Agent not found' });
    if (existing.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    return agentRepository.update(agentId, body);
  });

  app.delete('/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const existing = await agentRepository.findById(agentId);
    if (!existing) return reply.code(404).send({ error: 'Agent not found' });
    if (existing.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    await agentRepository.delete(agentId);
    return reply.code(204).send();
  });

  // --- Version endpoints ---

  app.get('/:agentId/versions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return versionRepository.list(agentId);
  });

  app.get('/:agentId/versions/:version/data', async (request, reply) => {
    const { agentId, version } = request.params as { agentId: string; version: string };
    if (!SEMVER_RE.test(version)) return reply.code(400).send({ error: 'Invalid version format' });
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    const versionRecord = await versionRepository.findByAgentVersion(agentId, version);
    if (!versionRecord) return reply.code(404).send({ error: 'Version not found' });
    const nodes = await nodeRepository.findByAgentVersion(agentId, version);
    const saConfigs = await saConfigRepository.findByAgentVersion(agentId, version);
    return { version: versionRecord, nodes, saConfigs };
  });

  app.post('/:agentId/versions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = parseBody(saveNewVersionSchema, request.body);
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    await versionRepository.saveNewVersion(agentId, body.version, body.label, body.nodes, body.saConfigs);
    return reply.code(201).send({ version: body.version });
  });

  app.put('/:agentId/versions/:version', async (request, reply) => {
    const { agentId, version } = request.params as { agentId: string; version: string };
    if (!SEMVER_RE.test(version)) return reply.code(400).send({ error: 'Invalid version format' });
    const body = parseBody(overwriteVersionSchema, request.body);
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    await versionRepository.overwriteVersion(agentId, version, body.nodes, body.saConfigs);
    return { version };
  });

  app.put('/:agentId/versions/:version/label', async (request, reply) => {
    const { agentId, version } = request.params as { agentId: string; version: string };
    if (!SEMVER_RE.test(version)) return reply.code(400).send({ error: 'Invalid version format' });
    const body = parseBody(updateLabelSchema, request.body);
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return versionRepository.updateLabel(agentId, version, body.label);
  });

  app.delete('/:agentId/versions/:version', async (request, reply) => {
    const { agentId, version } = request.params as { agentId: string; version: string };
    if (!SEMVER_RE.test(version)) return reply.code(400).send({ error: 'Invalid version format' });
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    await versionRepository.deleteVersion(agentId, version);
    return reply.code(204).send();
  });
}
