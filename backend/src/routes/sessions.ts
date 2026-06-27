import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../validation.js';
import { authenticate } from '../auth/middleware.js';
import { agentRepository } from '../repositories/AgentRepository.js';
import { versionRepository } from '../repositories/VersionRepository.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { nodeRepository } from '../repositories/NodeRepository.js';
import { toolDefinitionRepository } from '../repositories/ToolDefinitionRepository.js';
import { processMessage } from '../engine/engineOrchestrator.js';
import { LiteLLMService } from '../engine/llm/liteLLMService.js';
import { config } from '../config.js';
import type {
  AgentDefinition,
  AgentNode,
  ToolDefinition,
} from '../engine/types.js';
import type { agentNodes, toolDefinitions } from '../db/schema.js';

type AgentNodeRow = typeof agentNodes.$inferSelect;
type ToolDefinitionRow = typeof toolDefinitions.$inferSelect;

function parseNodeRow(row: AgentNodeRow): AgentNode {
  const nodeConfig = (row.configJson ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    nodeType: row.nodeType as AgentNode['nodeType'],
    semanticAgentConfigId: row.semanticAgentConfigId ?? '',
    phaseLabel: row.phaseLabel,
    progressWeight: row.progressWeight,
    ...nodeConfig,
  } as AgentNode;
}

function parseToolRow(row: ToolDefinitionRow): ToolDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    urlTemplate: row.urlTemplate,
    method: row.method,
    headers: row.headers as Record<string, string> | null,
    bodyTemplate: row.bodyTemplate,
    responsePath: row.responsePath,
    authType: row.authType,
    parametersSchemaJson: row.parametersSchemaJson as Record<string, unknown> | null,
  };
}

function collectToolNames(parsedNodes: AgentNode[]): string[] {
  const names = new Set<string>();
  for (const node of parsedNodes) {
    if (node.nodeType === 'tool') names.add(node.toolName);
    if (node.nodeType === 'agentic') node.toolNames.forEach((t) => names.add(t));
    if (node.nodeType === 'conversation' && node.availableTools) {
      node.availableTools.forEach((t) => names.add(t));
    }
  }
  return Array.from(names);
}

const createSessionSchema = z.object({
  version: z.string().optional(),
});

const messageSchema = z.object({
  message: z.string().nullable(),
  initialContext: z.record(z.string(), z.unknown()).optional(),
});

export default async function sessionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.post('/agents/:agentId/sessions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = parseBody(createSessionSchema, request.body);

    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const version = body.version ?? agent.currentVersion;
    const versionRecord = await versionRepository.findByAgentVersion(agentId, version);
    if (!versionRecord) {
      return reply.code(404).send({ error: `Version ${version} not found` });
    }

    const session = await sessionRepository.create({
      agentId,
      version,
      userId: request.user.id,
    });
    return reply.code(201).send(session);
  });

  app.get('/agents/:agentId/sessions', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return sessionRepository.listByAgentAndUser(agentId, request.user.id);
  });

  app.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    await sessionRepository.delete(sessionId);
    return reply.code(204).send();
  });

  app.post('/sessions/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = parseBody(messageSchema, request.body);

    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const agent = await agentRepository.findById(session.agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    const nodeRows = await nodeRepository.findByAgentVersion(session.agentId, session.version);
    const parsedNodes = nodeRows.map(parseNodeRow);

    const toolNames = collectToolNames(parsedNodes);
    const toolRows = await toolDefinitionRepository.findByNames(toolNames);
    const toolDefs = new Map(toolRows.map((r) => [r.name, parseToolRow(r)]));

    const agentDef: AgentDefinition = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      initialNodeId: agent.initialNodeId,
      version: session.version,
      inputContract: agent.inputContract,
      metadata: (agent.metadata ?? {}) as Record<string, unknown>,
    };

    const provider = new LiteLLMService({
      baseUrl: config.LITELLM_BASE_URL,
      model: 'gemini-3-pro-preview',
      logger: request.log,
    });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      const stream = processMessage(
        {
          sessionId,
          userId: request.user.id,
          agent: agentDef,
          nodes: parsedNodes,
          toolDefinitions: toolDefs,
          message: body.message,
          initialContext: body.initialContext,
        },
        { provider, logger: request.log },
      );

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, '[Message] Engine error');
      reply.raw.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });
}
