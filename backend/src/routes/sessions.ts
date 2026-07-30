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
import { snapshotRepository } from '../engine/snapshotRepository.js';
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
  const nodeType = row.nodeType as AgentNode['nodeType'];
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    nodeType,
    semanticAgentConfigId: row.semanticAgentConfigId ?? '',
    phaseLabel: row.phaseLabel,
    progressWeight: row.progressWeight,
    ...(nodeType === 'conversation' && { maxStepsPerTurn: 5 }),
    ...(nodeType === 'agentic' && { maxSteps: 10 }),
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

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const createSessionSchema = z.object({
  version: z.string().regex(SEMVER_RE, 'Version must be semver (e.g. 1.0.0)').optional(),
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

    if (agent.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Not authorized' });
    }

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

  app.get('/sessions/:sessionId/history', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    const snapshot = await snapshotRepository.load(sessionId);
    if (!snapshot) return reply.send({ messages: [], webview: null });

    const engine = (snapshot.context.data?._engine as Record<string, unknown> | undefined);
    const conversation = engine?.conversation as Record<string, unknown> | undefined;
    const responses = (conversation?.responses ?? []) as Array<{
      turn: number;
      userMessage: string;
      assistantMessage: string;
    }>;

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const r of responses) {
      if (r.userMessage) messages.push({ role: 'user', content: r.userMessage });
      messages.push({ role: 'assistant', content: r.assistantMessage });
    }

    // If the current node has a webviewConfig, include it so the frontend can re-render the form
    let webview: { nodeId: string; html: string; css?: string; js?: string } | null = null;
    const currentNodeId = snapshot.context.currentNodeId;
    if (currentNodeId) {
      const nodeRows = await nodeRepository.findByAgentVersion(session.agentId, session.version);
      const currentNode = nodeRows.find((n) => n.id === currentNodeId);
      if (currentNode) {
        const cfg = (currentNode.configJson ?? {}) as Record<string, unknown>;
        const webviewConfig = cfg.webviewConfig as { html?: string; css?: string; js?: string } | undefined;
        if (webviewConfig?.html) {
          webview = { nodeId: currentNodeId, html: webviewConfig.html, css: webviewConfig.css, js: webviewConfig.js };
        }
      }
    }

    return reply.send({ messages, webview });
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
      model: 'gemini-3-pro',
      logger: request.log,
    });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const abortController = new AbortController();
    request.raw.on('close', () => abortController.abort());

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
        if (abortController.signal.aborted) break;
        const ext = (chunk as unknown as Record<string, unknown>).custom as Record<string, unknown> | undefined;
        request.log.info({ chunkType: ext?.extensions ? (ext.extensions as Record<string, unknown>).type : 'text', chunk }, '[Stream] chunk');
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      request.log.error({ err }, '[Message] Engine error');
      if (!abortController.signal.aborted) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'An internal error occurred' })}\n\n`);
      }
    }

    if (!abortController.signal.aborted) {
      reply.raw.write('data: [DONE]\n\n');
    }
    reply.raw.end();
  });
}
