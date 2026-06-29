import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';

// Node type union — matches backend NodeType
export type EditorNodeType =
  | 'intent_parsing'
  | 'generation'
  | 'routing'
  | 'review'
  | 'tool'
  | 'agentic'
  | 'compute'
  | 'conversation';

// Editor node — flat shape matching what the backend version API expects
export interface EditorAgentNode {
  id: string;
  name: string;
  nodeType: EditorNodeType;
  semanticAgentConfigId?: string | null;
  phaseLabel?: string;
  progressWeight?: number;
  configJson?: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
}

// SA config — matches backend SA config shape
export interface EditorSaConfig {
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

// React Flow node data
export interface FlowNodeData {
  agentNode: EditorAgentNode;
  isSelected: boolean;
  isHighlighted?: 'added' | 'modified' | 'removed';
  [key: string]: unknown;
}

// React Flow typed aliases
export type FlowNode = RFNode<FlowNodeData, EditorNodeType>;
export type FlowEdge = RFEdge;

// Version data from GET /api/agents/:id/versions/:ver/data
export interface VersionData {
  version: string;
  label?: string;
  nodes: EditorAgentNode[];
  saConfigs: EditorSaConfig[];
}

// Save payloads
export interface NodePayload {
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

export interface SaConfigPayload {
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

export interface SaveVersionPayload {
  version: string;
  label?: string;
  nodes: NodePayload[];
  saConfigs: SaConfigPayload[];
}

export interface OverwriteVersionPayload {
  nodes: NodePayload[];
  saConfigs: SaConfigPayload[];
}

// Config sub-types mirroring backend types.ts

export interface TransitionAction {
  type: 'set_context' | 'increment_context';
  key: string;
  value: string | Record<string, unknown>;
}

export interface TransitionRule {
  target: string;
  actions: TransitionAction[];
}

export interface OptionItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  intent?: string;
  condition?: string;
  disabled?: string;
}

export interface CustomInputConfig {
  enabled: boolean;
  label: string;
  placeholder: string;
  inputFirst?: boolean;
}

export interface OptionsConfig {
  type: 'single_select' | 'multi_select';
  items: OptionItem[];
  customInput: CustomInputConfig;
  minSelections: number;
  maxSelections: number;
  defaultSelectAll?: boolean;
}

export type RoutingTarget =
  | { type: 'node'; nodeId: string }
  | { type: 'agent'; agentId: string; nodeId?: string }
  | { type: 'complete' };

export interface ContextMapping {
  sourceKey: string;
  targetKey: string;
}

export interface RoutingRule {
  condition: string;
  target: RoutingTarget;
  contextMapping?: ContextMapping[];
  actions?: TransitionAction[];
}

export interface IterationConfig {
  arrayKey: string;
  itemKey: string;
  concurrency: number;
  parallelKeys?: Record<string, string>;
  skipNulls?: boolean;
  itemResultKey?: string;
  maxRetryPasses?: number;
}

export interface ContextWindowConfig {
  maxRecentTurns: number;
  olderTurnStrategy: 'drop' | 'summarize' | 'key_points';
  maxHistoryTokens: number;
  pinnedContextKeys?: string[];
}

export interface ContextDigestEntry {
  key: string;
  instruction: string;
  maxTokens?: number;
  minChars?: number;
}

export interface ContextDigestConfig {
  entries: ContextDigestEntry[];
  model: string;
}

export interface DiffTrackingConfig {
  identityField: string;
  includeRemoved: boolean;
  modifiedFields?: string[];
  nestedArrayKeys?: string[];
  nestedBaselineKeys?: Record<string, string>;
}

export interface IdMappingRule {
  contextKey: string;
  idField: string;
  aliasPrefix: string;
  crossReferenceFields?: string[];
}

export interface IdMappingConfig {
  inputRules: IdMappingRule[];
  outputIdFields: string[];
  unknownIdStrategy: 'generate' | 'error';
}

// Phase 7 prep: editor operations for programmatic graph modification
export type EditorOperation =
  | { type: 'add_node'; nodeType: EditorNodeType; position: { x: number; y: number }; name?: string }
  | { type: 'update_node'; nodeId: string; updates: Partial<EditorAgentNode> }
  | { type: 'remove_node'; nodeId: string }
  | { type: 'update_positions'; positions: Array<{ nodeId: string; x: number; y: number }> };
