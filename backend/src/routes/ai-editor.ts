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
        content: `## Current Pipeline State\n\n${JSON.stringify({ agent: body.agent, nodes: body.nodes, saConfigs: body.saConfigs }, null, 2)}\n\n## User Instruction\n\n${body.instruction}`,
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
