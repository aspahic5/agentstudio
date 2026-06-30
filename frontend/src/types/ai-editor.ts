export interface AITransitionRule {
  target: string;
  actions: Array<{
    type: 'set_context' | 'increment_context';
    key: string;
    value: string | Record<string, unknown>;
  }>;
}

export interface AIRoutingTarget {
  type: 'node' | 'agent' | 'complete';
  nodeId?: string;
  agentId?: string;
}

export interface AIRoutingRule {
  condition: string;
  target: AIRoutingTarget;
  contextMapping?: Array<{ sourceKey: string; targetKey: string }>;
  actions?: Array<{
    type: 'set_context' | 'increment_context';
    key: string;
    value: string | Record<string, unknown>;
  }>;
}

export interface AISaConfig {
  nodeId?: string;
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

export interface AINodeConfig {
  name: string;
  nodeType: string;
  configJson?: Record<string, unknown>;
  phaseLabel?: string;
  progressWeight?: number;
}

export type AIEditOperation =
  | { op: 'add_node'; node: AINodeConfig; saConfig?: AISaConfig; position?: { x: number; y: number } }
  | { op: 'update_node'; nodeId: string; changes: Record<string, unknown> }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'add_sa_config'; saConfig: AISaConfig & { nodeId: string } }
  | { op: 'update_sa_config'; nodeId: string; changes: Record<string, unknown> }
  | { op: 'update_agent'; changes: { name?: string; description?: string; initialNodeId?: string } }
  | { op: 'add_transition'; nodeId: string; intent: string; rule: AITransitionRule }
  | { op: 'update_transition'; nodeId: string; intent: string; rule: AITransitionRule }
  | { op: 'remove_transition'; nodeId: string; intent: string }
  | { op: 'update_routing_rule'; nodeId: string; ruleIndex: number; rule: AIRoutingRule }
  | { op: 'add_routing_rule'; nodeId: string; rule: AIRoutingRule };

export interface AIConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AISuggestRequest {
  agent: { id: string; name: string; initialNodeId: string; description?: string };
  nodes: Array<{
    id: string;
    name: string;
    nodeType: string;
    semanticAgentConfigId?: string | null;
    phaseLabel?: string;
    progressWeight?: number;
    configJson?: Record<string, unknown>;
    positionX?: number;
    positionY?: number;
  }>;
  saConfigs: Array<{
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
  }>;
  instruction: string;
  conversationHistory: AIConversationMessage[];
}

export interface AISuggestResponse {
  operations: AIEditOperation[];
  summary: string;
  validation: { valid: boolean; violations: string[] };
  conversationHistory: AIConversationMessage[];
}
