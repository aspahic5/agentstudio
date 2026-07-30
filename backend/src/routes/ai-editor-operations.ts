import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const saConfigInputSchema = z.object({
  name: z.string().min(1).max(200),
  systemPrompt: z.string().max(100_000),
  outputSchemaJson: z.record(z.string(), z.unknown()).optional(),
  maxRetries: z.number().int().optional(),
  temperature: z.number().optional(),
  maxOutputTokens: z.number().int().nullable().optional(),
  outputFormatting: z.string().max(50).optional(),
  outputDensity: z.string().max(50).optional(),
  reasoningFormatting: z.string().max(50).optional(),
  thinkingGuidance: z.string().max(10_000).nullable().optional(),
  modelAlias: z.string().max(100).nullable().optional(),
});

const actionSchema = z.object({
  type: z.enum(['set_context', 'increment_context']),
  key: z.string(),
  value: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

const transitionRuleSchema = z.object({
  target: z.string(),
  actions: z.array(actionSchema).default([]),
});

const routingTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('node'), nodeId: z.string() }),
  z.object({ type: z.literal('agent'), agentId: z.string(), nodeId: z.string().optional() }),
  z.object({ type: z.literal('complete') }),
]);

const contextMappingSchema = z.object({
  sourceKey: z.string(),
  targetKey: z.string(),
});

const routingRuleSchema = z.object({
  condition: z.string(),
  target: routingTargetSchema,
  contextMapping: z.array(contextMappingSchema).optional(),
  actions: z.array(actionSchema).optional(),
});

// ---------------------------------------------------------------------------
// Operation schemas (discriminated union on `op`)
// ---------------------------------------------------------------------------

const addNodeOpSchema = z.object({
  op: z.literal('add_node'),
  node: z.object({
    name: z.string().min(1).max(200),
    nodeType: z.string().min(1).max(100),
    configJson: z.record(z.string(), z.unknown()).optional(),
  }),
  saConfig: saConfigInputSchema.optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const updateNodeOpSchema = z.object({
  op: z.literal('update_node'),
  nodeId: z.string(),
  changes: z.record(z.string(), z.unknown()),
});

const removeNodeOpSchema = z.object({
  op: z.literal('remove_node'),
  nodeId: z.string(),
});

const addSaConfigOpSchema = z.object({
  op: z.literal('add_sa_config'),
  saConfig: saConfigInputSchema.extend({
    nodeId: z.string(),
  }),
});

const updateSaConfigOpSchema = z.object({
  op: z.literal('update_sa_config'),
  nodeId: z.string(),
  changes: z.record(z.string(), z.unknown()),
});

const updateAgentOpSchema = z.object({
  op: z.literal('update_agent'),
  changes: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    initialNodeId: z.string().optional(),
  }),
});

const addTransitionOpSchema = z.object({
  op: z.literal('add_transition'),
  nodeId: z.string(),
  intent: z.string(),
  rule: transitionRuleSchema,
});

const updateTransitionOpSchema = z.object({
  op: z.literal('update_transition'),
  nodeId: z.string(),
  intent: z.string(),
  rule: transitionRuleSchema,
});

const removeTransitionOpSchema = z.object({
  op: z.literal('remove_transition'),
  nodeId: z.string(),
  intent: z.string(),
});

const addRoutingRuleOpSchema = z.object({
  op: z.literal('add_routing_rule'),
  nodeId: z.string(),
  rule: routingRuleSchema,
});

const updateRoutingRuleOpSchema = z.object({
  op: z.literal('update_routing_rule'),
  nodeId: z.string(),
  ruleIndex: z.number().int().min(0),
  rule: routingRuleSchema,
});

export const aiEditOperationSchema = z.discriminatedUnion('op', [
  addNodeOpSchema,
  updateNodeOpSchema,
  removeNodeOpSchema,
  addSaConfigOpSchema,
  updateSaConfigOpSchema,
  updateAgentOpSchema,
  addTransitionOpSchema,
  updateTransitionOpSchema,
  removeTransitionOpSchema,
  addRoutingRuleOpSchema,
  updateRoutingRuleOpSchema,
]);

export type AIEditOperation = z.infer<typeof aiEditOperationSchema>;

// ---------------------------------------------------------------------------
// Request / response schemas
// ---------------------------------------------------------------------------

export const suggestRequestSchema = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    initialNodeId: z.string().nullable().optional(),
    description: z.string().optional(),
  }),
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      nodeType: z.string(),
      semanticAgentConfigId: z.string().nullable().optional(),
      phaseLabel: z.string().optional(),
      progressWeight: z.number().optional(),
      configJson: z.record(z.string(), z.unknown()).optional(),
      positionX: z.number().optional(),
      positionY: z.number().optional(),
    }),
  ),
  saConfigs: z.array(
    z.object({
      id: z.string(),
      nodeId: z.string(),
      name: z.string(),
      systemPrompt: z.string(),
      outputSchemaJson: z.record(z.string(), z.unknown()).optional(),
      maxRetries: z.number().int().optional(),
      temperature: z.number().optional(),
      maxOutputTokens: z.number().int().nullable().optional(),
      outputFormatting: z.string().optional(),
      outputDensity: z.string().optional(),
      reasoningFormatting: z.string().optional(),
      thinkingGuidance: z.string().nullable().optional(),
      modelAlias: z.string().nullable().optional(),
    }),
  ),
  instruction: z.string().min(1).max(10_000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .default([]),
});

export const llmResponseSchema = z.object({
  operations: z.array(aiEditOperationSchema),
  summary: z.string(),
});

export type LLMResponse = z.infer<typeof llmResponseSchema>;

// ---------------------------------------------------------------------------
// Local interfaces for applyOperations
// ---------------------------------------------------------------------------

interface NodeData {
  id: string;
  name: string;
  nodeType: string;
  semanticAgentConfigId?: string | null;
  phaseLabel?: string;
  progressWeight?: number;
  configJson?: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
}

interface SaConfigData {
  id: string;
  nodeId: string;
  name: string;
  systemPrompt: string;
  [key: string]: unknown;
}

interface AgentData {
  id: string;
  name: string;
  initialNodeId: string;
  description?: string;
}

interface ApplyResult {
  agent: AgentData;
  nodes: NodeData[];
  saConfigs: SaConfigData[];
}

// ---------------------------------------------------------------------------
// applyOperations
// ---------------------------------------------------------------------------

export function applyOperations(
  agent: AgentData,
  nodes: NodeData[],
  saConfigs: SaConfigData[],
  operations: AIEditOperation[],
): ApplyResult {
  const result: ApplyResult = structuredClone({ agent, nodes, saConfigs });

  for (const op of operations) {
    switch (op.op) {
      case 'add_node': {
        const nodeId = crypto.randomUUID();
        const newNode: NodeData = {
          id: nodeId,
          name: op.node.name,
          nodeType: op.node.nodeType,
          configJson: op.node.configJson ?? {},
          positionX: op.position?.x,
          positionY: op.position?.y,
        };

        if (op.saConfig) {
          const saId = crypto.randomUUID();
          newNode.semanticAgentConfigId = saId;
          result.saConfigs.push({
            id: saId,
            nodeId,
            ...op.saConfig,
          });
        }

        result.nodes.push(newNode);
        break;
      }

      case 'update_node': {
        const idx = result.nodes.findIndex((n) => n.id === op.nodeId);
        if (idx === -1) break;

        // Destructure out identity fields that must never be overwritten, plus configJson
        // which gets special merge treatment below.
        const { id: _id, agentId: _agentId, configJson: incomingConfigJson, ...rest } = op.changes as {
          id?: unknown;
          agentId?: unknown;
          configJson?: Record<string, unknown>;
          [key: string]: unknown;
        };

        Object.assign(result.nodes[idx], rest);

        if (incomingConfigJson !== undefined) {
          result.nodes[idx].configJson = {
            ...(result.nodes[idx].configJson ?? {}),
            ...incomingConfigJson,
          };
        }
        break;
      }

      case 'remove_node': {
        result.nodes = result.nodes.filter((n) => n.id !== op.nodeId);
        result.saConfigs = result.saConfigs.filter((s) => s.nodeId !== op.nodeId);
        break;
      }

      case 'add_sa_config': {
        const saId = crypto.randomUUID();
        result.saConfigs.push({
          id: saId,
          ...op.saConfig,
        });

        const nodeIdx = result.nodes.findIndex((n) => n.id === op.saConfig.nodeId);
        if (nodeIdx !== -1) {
          result.nodes[nodeIdx].semanticAgentConfigId = saId;
        }
        break;
      }

      case 'update_sa_config': {
        const idx = result.saConfigs.findIndex((s) => s.nodeId === op.nodeId);
        if (idx === -1) break;
        // Strip identity fields that must never be overwritten via an update operation.
        const { id: _id, nodeId: _nodeId, agentId: _agentId, ...saChanges } = op.changes as {
          id?: unknown;
          nodeId?: unknown;
          agentId?: unknown;
          [key: string]: unknown;
        };
        Object.assign(result.saConfigs[idx], saChanges);
        break;
      }

      case 'update_agent': {
        Object.assign(result.agent, op.changes);
        break;
      }

      case 'add_transition':
      case 'update_transition': {
        const nodeIdx = result.nodes.findIndex((n) => n.id === op.nodeId);
        if (nodeIdx === -1) break;

        const node = result.nodes[nodeIdx];
        if (!node.configJson) node.configJson = {};

        const transitions = (node.configJson.transitions ?? {}) as Record<string, unknown>;
        transitions[op.intent] = op.rule;
        node.configJson.transitions = transitions;

        const validIntents = (node.configJson.validIntents ?? []) as string[];
        if (!validIntents.includes(op.intent)) {
          validIntents.push(op.intent);
        }
        node.configJson.validIntents = validIntents;
        break;
      }

      case 'remove_transition': {
        const nodeIdx = result.nodes.findIndex((n) => n.id === op.nodeId);
        if (nodeIdx === -1) break;

        const node = result.nodes[nodeIdx];
        if (!node.configJson) break;

        const transitions = (node.configJson.transitions ?? {}) as Record<string, unknown>;
        delete transitions[op.intent];
        node.configJson.transitions = transitions;

        const validIntents = (node.configJson.validIntents ?? []) as string[];
        node.configJson.validIntents = validIntents.filter((i) => i !== op.intent);
        break;
      }

      case 'add_routing_rule': {
        const nodeIdx = result.nodes.findIndex((n) => n.id === op.nodeId);
        if (nodeIdx === -1) break;

        const node = result.nodes[nodeIdx];
        if (!node.configJson) node.configJson = {};

        const rules = (node.configJson.rules ?? []) as unknown[];
        rules.push(op.rule);
        node.configJson.rules = rules;
        break;
      }

      case 'update_routing_rule': {
        const nodeIdx = result.nodes.findIndex((n) => n.id === op.nodeId);
        if (nodeIdx === -1) break;

        const node = result.nodes[nodeIdx];
        if (!node.configJson) node.configJson = {};

        const rules = (node.configJson.rules ?? []) as unknown[];
        if (op.ruleIndex >= 0 && op.ruleIndex < rules.length) {
          rules[op.ruleIndex] = op.rule;
        }
        node.configJson.rules = rules;
        break;
      }
    }
  }

  return result;
}
