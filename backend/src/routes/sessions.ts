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
import { interpolate } from '../engine/interpolate.js';
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

const draftNodeSchema = z.object({
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

const draftSaConfigSchema = z.object({
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

const createDraftSessionSchema = z.object({
  nodes: z.array(draftNodeSchema).max(500),
  saConfigs: z.array(draftSaConfigSchema).max(500),
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

  app.post('/agents/:agentId/sessions/draft', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await agentRepository.findById(agentId);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    if (agent.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const body = parseBody(createDraftSessionSchema, request.body);
    const draftVersion = `draft-${Date.now()}`;

    await versionRepository.saveDraftVersion(agentId, draftVersion, body.nodes, body.saConfigs);

    const session = await sessionRepository.create({
      agentId,
      version: draftVersion,
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
    if (!snapshot) return reply.send({ entries: [] });

    // context.conversationHistory has ALL messages across all nodes in order.
    const convHistory = (snapshot.context.conversationHistory ?? []) as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;

    // Load all nodes for this agent version to find webviewConfigs.
    const nodeRows = await nodeRepository.findByAgentVersion(session.agentId, session.version);

    // Build a map of outputContextKey → node for nodes that have a webviewConfig.
    // When the engine transitions out of a conversation node, it stores the submitted
    // data in context.data[node.outputContextKey]. We use this to find submittedData
    // for past nodes.
    type WebviewNodeInfo = {
      nodeId: string;
      html: string;
      css?: string;
      js?: string;
      outputContextKey?: string;
    };
    const flatCtx: Record<string, unknown> = {
      ...(snapshot.context.data ?? {}),
      userId: snapshot.context.userId,
      sessionId: snapshot.context.sessionId,
    };

    const webviewNodes: WebviewNodeInfo[] = [];
    for (const n of nodeRows) {
      const cfg = (n.configJson ?? {}) as Record<string, unknown>;
      const wv = cfg.webviewConfig as { html?: string; css?: string; js?: string } | undefined;
      if (wv?.html) {
        const interpolatedHtml = interpolate(wv.html, flatCtx);
        const interpolatedCss = wv.css ? interpolate(wv.css, flatCtx) : undefined;
        const interpolatedJs = wv.js ? interpolate(wv.js, flatCtx) : undefined;
        const contextScript = `window.__context__=${JSON.stringify(flatCtx)};`;
        webviewNodes.push({
          nodeId: n.id,
          html: interpolatedHtml,
          css: interpolatedCss,
          js: contextScript + (interpolatedJs ?? ''),
          outputContextKey: typeof cfg.outputContextKey === 'string' ? cfg.outputContextKey : undefined,
        });
      }
    }

    // Build the timeline entries. We walk conversationHistory and after each
    // assistant message we check if the immediately following user message is a
    // JSON webview submission. If so, we insert a webview entry between the
    // assistant message and the (silent) user submission, with submittedData set.
    // For the current node (no following user message yet), we show the webview
    // without submittedData if the node still has a webviewConfig.
    type HistoryEntry =
      | { type: 'message'; role: 'user' | 'assistant'; content: string }
      | { type: 'webview'; nodeId: string; html: string; css?: string; js?: string; submittedData: Record<string, unknown> | null }
      | { type: 'screen'; content: string };

    const entries: HistoryEntry[] = [];
    const currentNodeId = snapshot.context.currentNodeId;

    // Track which webview nodes have been "consumed" (matched to a submission)
    // so we assign each webview entry to the right node in order.
    let webviewNodeIndex = 0;

    for (let i = 0; i < convHistory.length; i++) {
      const msg = convHistory[i];

      if (msg.role === 'assistant') {
        // Screen entries are stored with a '__screen__:' prefix — emit as screen type.
        if (msg.content.startsWith('__screen__:')) {
          entries.push({ type: 'screen', content: msg.content.slice('__screen__:'.length) });
        } else {
          entries.push({ type: 'message', role: 'assistant', content: msg.content });
        }

        // Peek at the next message — if it's a JSON user submission from a webview,
        // inject the webview entry here (after the assistant message, before next turn).
        const next = convHistory[i + 1];
        if (next?.role === 'user') {
          let submittedData: Record<string, unknown> | null = null;
          try {
            const parsed = JSON.parse(next.content);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              submittedData = parsed as Record<string, unknown>;
            }
          } catch {
            // plain text user message — not a webview submission
          }

          if (submittedData !== null && webviewNodeIndex < webviewNodes.length) {
            const wvNode = webviewNodes[webviewNodeIndex];
            entries.push({ type: 'webview', ...wvNode, submittedData });
            webviewNodeIndex++;
            // Skip the user message — it's a silent webview submission, don't show it as a bubble
            i++;
          } else {
            // Regular user text message — will be pushed on next iteration
          }
        }
      } else {
        // Regular (non-webview) user message — skip silent screen-continue sentinel
        if (msg.content !== '\u200B') {
          entries.push({ type: 'message', role: 'user', content: msg.content });
        }
      }
    }

    // If the current node has a webviewConfig and hasn't been submitted yet,
    // append it at the end so the user can still interact with it.
    if (currentNodeId && webviewNodeIndex < webviewNodes.length) {
      const currentNode = webviewNodes.find((n) => n.nodeId === currentNodeId);
      if (currentNode) {
        // Check if this node's output is already in context (submitted in a previous session load)
        const alreadySubmitted = currentNode.outputContextKey
          ? (flatCtx[currentNode.outputContextKey] as Record<string, unknown> | undefined) ?? null
          : null;
        entries.push({ type: 'webview', ...currentNode, submittedData: alreadySubmitted });
      }
    }

    return reply.send({ entries });
  });

  app.get('/sessions/:sessionId/context', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    const snapshot = await snapshotRepository.load(sessionId);
    if (!snapshot) return reply.code(404).send({ error: 'No snapshot yet' });

    const { _engine, _agentId, _reasoning, ...publicData } = (snapshot.context.data ?? {}) as Record<string, unknown>;
    return reply.send({
      currentNodeId: snapshot.context.currentNodeId,
      data: publicData,
      internals: { _engine, _agentId, _reasoning },
    });
  });

  app.patch('/sessions/:sessionId/label', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    const body = parseBody(z.object({ label: z.string().max(80) }), request.body);
    const updated = await sessionRepository.updateLabel(sessionId, body.label);
    return reply.send(updated);
  });

  app.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await sessionRepository.findById(sessionId);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }
    const draftVersion = session.version.startsWith('draft-') ? session.version : null;
    await sessionRepository.delete(sessionId);
    if (draftVersion) {
      await versionRepository.deleteDraft(session.agentId, draftVersion).catch(() => {});
    }
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

    const [versionRecord, nodeRows] = await Promise.all([
      versionRepository.findByAgentVersion(session.agentId, session.version),
      nodeRepository.findByAgentVersion(session.agentId, session.version),
    ]);
    const parsedNodes = nodeRows.map(parseNodeRow);

    const toolNames = collectToolNames(parsedNodes);
    const toolRows = await toolDefinitionRepository.findByNames(toolNames);
    const toolDefs = new Map(toolRows.map((r) => [r.name, parseToolRow(r)]));

    // Use version-scoped initialNodeId — agent.initialNodeId always points to the
    // latest version's node UUID which differs from older versions' node UUIDs.
    const initialNodeId = versionRecord?.initialNodeId ?? agent.initialNodeId ?? parsedNodes[0]?.id ?? '';

    const agentDef: AgentDefinition = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      initialNodeId,
      version: session.version,
      inputContract: agent.inputContract,
      metadata: (agent.metadata ?? {}) as Record<string, unknown>,
    };

    const provider = new LiteLLMService({
      baseUrl: config.LITELLM_BASE_URL,
      model: 'gemini-3-flash',
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
