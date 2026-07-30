import type { FastifyInstance } from 'fastify';
import { parseBody } from '../validation.js';
import { authenticate } from '../auth/middleware.js';
import { config } from '../config.js';
import { LiteLLMService } from '../engine/llm/liteLLMService.js';
import { createStructuredLLMClient } from '../engine/llm/client.js';
import { validateAgentGraph } from '../engine/validateAgent.js';
import type { AgentNode } from '../engine/types.js';
import { suggestRequestSchema, llmResponseSchema, applyOperations } from './ai-editor-operations.js';
import { buildEditorSystemPrompt } from './ai-editor-prompt.js';

interface NodeData {
  id: string;
  name: string;
  nodeType: string;
  configJson?: Record<string, unknown>;
}

interface AgentData {
  id: string;
  name: string;
  initialNodeId?: string | null | undefined;
}

function getInitialNodeId(agent: AgentData): string | undefined {
  return agent.initialNodeId ?? undefined;
}

function buildGraphSummary(nodes: NodeData[], agent: AgentData): string {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const lines: string[] = [];

  for (const node of nodes) {
    const cfg = (node.configJson ?? {}) as Record<string, unknown>;
    const isInitial = node.id === getInitialNodeId(agent);
    const targets: string[] = [];

    if (node.nodeType === 'intent_parsing' || node.nodeType === 'review') {
      const transitions = cfg.transitions as Record<string, { target: string }> | undefined;
      if (transitions) {
        for (const [intent, rule] of Object.entries(transitions)) {
          const t = rule.target;
          if (t === 'self') targets.push(`self [intent: ${intent}]`);
          else if (t === 'complete') targets.push(`complete [intent: ${intent}]`);
          else if (nodeIds.has(t)) {
            const targetNode = nodes.find((n) => n.id === t);
            targets.push(`"${t}" (${targetNode?.name ?? '?'}) [intent: ${intent}]`);
          }
        }
      }
    } else if (
      node.nodeType === 'generation' ||
      node.nodeType === 'tool' ||
      node.nodeType === 'agentic' ||
      node.nodeType === 'compute' ||
      node.nodeType === 'conversation'
    ) {
      const targetNodeId = cfg.targetNodeId as string | undefined;
      if (targetNodeId && nodeIds.has(targetNodeId)) {
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        targets.push(`"${targetNodeId}" (${targetNode?.name ?? '?'})`);
      } else if (targetNodeId) {
        targets.push(`"${targetNodeId}" (MISSING)`);
      }
    } else if (node.nodeType === 'routing') {
      const rules = cfg.rules as Array<{ condition: string; target: { type: string; nodeId?: string } }> | undefined;
      if (rules) {
        for (const rule of rules) {
          if (rule.target.type === 'node' && rule.target.nodeId) {
            const targetNode = nodes.find((n) => n.id === rule.target.nodeId);
            targets.push(`"${rule.target.nodeId}" (${targetNode?.name ?? '?'}) [if: ${rule.condition}]`);
          } else if (rule.target.type === 'complete') {
            targets.push(`complete [if: ${rule.condition}]`);
          }
        }
      }
      const defaultTarget = cfg.defaultTarget as { type: string; nodeId?: string } | undefined;
      if (defaultTarget?.type === 'node' && defaultTarget.nodeId) {
        const targetNode = nodes.find((n) => n.id === defaultTarget.nodeId);
        targets.push(`"${defaultTarget.nodeId}" (${targetNode?.name ?? '?'}) [default]`);
      } else if (defaultTarget?.type === 'complete') {
        targets.push('complete [default]');
      }
    }

    const label = `"${node.id}" (${node.name} / ${node.nodeType})${isInitial ? ' [INITIAL]' : ''}`;
    lines.push(`- ${label} → ${targets.length > 0 ? targets.join(', ') : 'nowhere (HANGING — not connected)'}`);
  }

  return lines.join('\n');
}

export default async function aiEditorRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.post('/suggest', async (request, reply) => {
    const body = parseBody(suggestRequestSchema, request.body);

    const provider = new LiteLLMService({
      baseUrl: config.LITELLM_BASE_URL,
      model: 'studio-editor',
      logger: request.log,
    });

    const client = createStructuredLLMClient({ provider, retry: { maxAttempts: 3 } });

    const messages = [
      { role: 'system' as const, content: buildEditorSystemPrompt() },
      ...body.conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: [
          '## Current Pipeline State',
          '',
          JSON.stringify({ agent: body.agent, nodes: body.nodes, saConfigs: body.saConfigs }, null, 2),
          '',
          '## Current Graph Connections',
          '',
          buildGraphSummary(body.nodes, body.agent),
          '',
          '## User Instruction',
          '',
          body.instruction,
        ].join('\n'),
      },
    ];

    const result = await client.generate({
      schema: llmResponseSchema,
      messages,
      options: { temperature: 0.3, maxTokens: 8192 },
      originalInput: body.instruction,
    });

    if (!result.success || !result.data) {
      return reply.code(422).send({
        error: 'AI failed to generate valid operations',
        details: result.error?.message,
      });
    }

    const applied = applyOperations(body.agent, body.nodes, body.saConfigs, result.data.operations);

    let validation: { valid: boolean; violations: string[] };
    try {
      const agentNodes = applied.nodes.map((n) => ({
        id: n.id,
        agentId: body.agent.id,
        name: n.name,
        nodeType: n.nodeType,
        semanticAgentConfigId: n.semanticAgentConfigId ?? '',
        phaseLabel: n.phaseLabel ?? '',
        progressWeight: n.progressWeight ?? 1,
        ...(n.configJson ?? {}),
      })) as AgentNode[];

      validateAgentGraph(
        {
          ...applied.agent,
          version: '',
          inputContract: null,
          metadata: {},
          description: applied.agent.description ?? '',
        },
        agentNodes,
      );

      validation = { valid: true, violations: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      validation = { valid: false, violations: [message] };
    }

    return {
      operations: result.data.operations,
      summary: result.data.summary,
      validation,
      conversationHistory: [
        ...body.conversationHistory,
        { role: 'user', content: body.instruction },
        { role: 'assistant', content: result.data.summary },
      ],
    };
  });
}
