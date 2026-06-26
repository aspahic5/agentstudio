// Ported from CE types.ts with agent-studio adaptations

import type { EngineStreamChunk } from './stream.js';
import type { FastifyBaseLogger } from 'fastify';

export type { EngineStreamChunk };

// ============================================================================
// Event Types
// ============================================================================

export interface TransitionEvent {
  type: 'TRANSITION';
  target: string;
}

export interface CompleteEvent {
  type: 'COMPLETE';
}

export type NodeEvent = TransitionEvent | CompleteEvent;

// ============================================================================
// Option Types
// ============================================================================

export type ChangeStatus = 'added' | 'modified' | 'removed' | 'unchanged';

export interface OptionItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  _changeStatus?: ChangeStatus;
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

// ============================================================================
// Transition Types
// ============================================================================

export interface TransitionAction {
  type: 'set_context' | 'increment_context';
  key: string;
  value: string | Record<string, unknown>;
}

export interface TransitionRule {
  target: string;
  actions: TransitionAction[];
}

// ============================================================================
// Intent Types
// ============================================================================

export type Intent = string;

// ============================================================================
// Node Type Enum
// ============================================================================

export type NodeType =
  | 'intent_parsing'
  | 'generation'
  | 'routing'
  | 'review'
  | 'tool'
  | 'agentic'
  | 'compute'
  | 'conversation';

// ============================================================================
// Agent Definition (renamed from Pipeline)
// ============================================================================

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  initialNodeId: string;
  version: string;
  inputContract: unknown;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Node Types — Discriminated Union
// ============================================================================

interface NodeBase {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  thinkingDescription?: string;
  semanticAgentConfigId: string;
  phaseLabel: string;
  progressWeight: number;
}

export interface IntentParsingNode extends NodeBase {
  nodeType: 'intent_parsing';
  validIntents: Intent[];
  transitions: Record<Intent, TransitionRule>;
  initialPromptTemplate: string;
  responseTemplates: Record<Intent, string>;
  optionsConfig: OptionsConfig;
  dynamicOptionsContextKey?: string;
  contextDigest?: ContextDigestConfig;
}

export interface GenerationNode extends NodeBase {
  nodeType: 'generation';
  generationPromptTemplate: string;
  outputContextKey: string;
  targetNodeId: string;
  thinkingGuidelines?: string;
  postGeneration?: {
    accumulateKey?: string;
    emitType?: string;
  };
  iteration?: IterationConfig;
  idMapping?: IdMappingConfig;
  contextDigest?: ContextDigestConfig;
}

// ============================================================================
// Routing Types
// ============================================================================

export interface ContextMapping {
  sourceKey: string;
  targetKey: string;
}

export type RoutingTarget =
  | { type: 'node'; nodeId: string }
  | { type: 'agent'; agentId: string; nodeId?: string }
  | { type: 'complete' };

export interface RoutingRule {
  condition: string;
  target: RoutingTarget;
  contextMapping?: ContextMapping[];
  actions?: TransitionAction[];
}

export interface RoutingNode extends NodeBase {
  nodeType: 'routing';
  rules: RoutingRule[];
  defaultTarget: RoutingTarget;
  contextMapping?: ContextMapping[];
  message?: string;
  defaultActions?: TransitionAction[];
  emitContextKey?: string;
  emitType?: string;
  waitForContinue?: boolean;
}

export interface DiffTrackingConfig {
  identityField: string;
  includeRemoved: boolean;
  modifiedFields?: string[];
  nestedArrayKeys?: string[];
  nestedBaselineKeys?: Record<string, string>;
}

export interface ReviewNode extends NodeBase {
  nodeType: 'review';
  contentContextKey: string;
  emitOnModify?: string;
  refinementStateName: string;
  modificationIntents: Intent[];
  refinementInputTemplate: string;
  validIntents: Intent[];
  transitions: Record<Intent, TransitionRule>;
  initialPromptTemplate: string;
  responseTemplates: Record<Intent, string>;
  optionsConfig: OptionsConfig;
  diffTracking?: DiffTrackingConfig;
  contextDigest?: ContextDigestConfig;
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

export interface ToolNode extends NodeBase {
  nodeType: 'tool';
  toolName: string;
  inputContextKeys: string[];
  outputContextKey: string;
  targetNodeId: string;
  iteration?: IterationConfig;
  skipWhenEmpty?: string;
  requiredCredentials?: string[];
  outputContextKeyMapping?: Record<string, string>;
}

export interface AgenticNode extends NodeBase {
  nodeType: 'agentic';
  toolNames: string[];
  maxSteps: number;
  systemPromptTemplate: string;
  agenticPromptTemplate: string;
  outputContextKey: string;
  targetNodeId: string;
  deltaField?: string;
  deltaTargetKey?: string;
  auditTrailKey?: string;
  forcedSubmitFallback?: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  deltaEmitCardType?: string;
  turnNumberKey?: string;
  requiredCredentials?: string[];
  contextWindowConfig?: ContextWindowConfig;
  contextDigest?: ContextDigestConfig;
}

export interface ComputeNode extends NodeBase {
  nodeType: 'compute';
  computeScript: string;
  inputContextKeys: string[];
  outputContextKey: string;
  targetNodeId: string;
}

export interface WebViewConfig {
  html: string;
  css?: string;
  js?: string;
}

export interface ConversationNode extends NodeBase {
  nodeType: 'conversation';
  goalDescription: string;
  completionStrategy: 'llm_decided' | 'user_explicit' | 'either';
  targetNodeId: string;
  maxStepsPerTurn: number;
  outputSchema: Record<string, unknown>;
  outputContextKey?: string;
  availableTools?: string[];
  reEntryContextKey?: string;
  incrementalExtraction?: {
    schema: Record<string, unknown>;
    contextKey: string;
    extractEveryNTurns: number;
    model: string;
  };
  requiredCredentials?: string[];
  contextWindowConfig?: ContextWindowConfig;
  contextDigest?: ContextDigestConfig;
  webviewConfig?: WebViewConfig;
}

export type AgentNode =
  | IntentParsingNode
  | GenerationNode
  | RoutingNode
  | ReviewNode
  | ToolNode
  | AgenticNode
  | ComputeNode
  | ConversationNode;

// ============================================================================
// Context Types
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string;
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

export type ContextDigester = (
  flatContext: Record<string, unknown>,
  config: ContextDigestConfig
) => Promise<Record<string, unknown>>;

export type UserProfile = Record<string, unknown>;

export interface ConversationContext {
  sessionId: string;
  userId: string;
  currentNodeId: string;
  conversationHistory: ConversationTurn[];
  userProfile: UserProfile | null;
  data: Record<string, unknown>;
}

// ============================================================================
// Credential Types
// ============================================================================

export type CredentialResolver = (
  nodeId: string,
  requiredCredentials: string[]
) => Record<string, string>;

// ============================================================================
// Tool Types
// ============================================================================

export type ToolDispatcher = (
  toolName: string,
  parameters: Record<string, unknown>,
  toolDefMap: Map<string, ToolDefinition>,
  flatContext: Record<string, unknown>
) => Promise<unknown>;

export type ComputeFn = (inputs: Record<string, unknown>) => unknown;

export type DeltaMergeHandler = (
  currentState: unknown | undefined,
  delta: unknown,
  turnNumber: number,
  context: ConversationContext
) => unknown;

// ============================================================================
// Loop Detector (interface — implementation in separate file)
// ============================================================================

export interface LoopDetector {
  checkNodeEntry(nodeId: string): void;
  checkPrompt(nodeId: string, interpolatedPrompt: string, iterationIndex?: number): void;
  recordProgress(): void;
  recordExecution(nodeId: string, nodeType: string, changedKeys: string[]): void;
  checkWithJudge(): Promise<void>;
}

// ============================================================================
// Context Window Summarizer (interface — implementation in separate file)
// ============================================================================

export type ContextWindowSummarizer = (
  turns: ConversationTurn[],
  strategy: 'summarize' | 'key_points'
) => Promise<string>;

// ============================================================================
// Executor Dependencies
// ============================================================================

export interface ExecutorDependencies {
  agentFactory: SemanticAgentFactory;
  logger: FastifyBaseLogger;
  templateEnv: Record<string, string>;
  credentials: Record<string, string>;
  toolDefinitions: Map<string, ToolDefinition>;
  toolDispatcher?: ToolDispatcher;
  toolDispatcherStrict?: ToolDispatcher;
  deltaMergeHandler?: DeltaMergeHandler;
  createId?: () => string;
  loopDetector: LoopDetector;
  onAgentComplete?: (contextData: Record<string, unknown>) => AsyncGenerator<EngineStreamChunk>;
  postToolCallHook?: (
    toolName: string,
    response: unknown,
    context: ConversationContext
  ) => AsyncGenerator<EngineStreamChunk>;
  contextWindowSummarizer?: ContextWindowSummarizer;
  contextDigester?: ContextDigester;
}

// ============================================================================
// Result Types
// ============================================================================

export interface PresentationResult {
  response: string;
}

export interface IntentResult {
  response: string;
  event: NodeEvent;
  contextUpdates: Record<string, unknown>;
}

export interface GenerationResult {
  event: TransitionEvent;
  contextUpdates: Record<string, unknown>;
}

export interface RoutingResult {
  response?: string;
  event: CompleteEvent | TransitionEvent;
  routingDecision: RoutingTarget;
  contextMapping?: ContextMapping[];
  contextUpdates?: Record<string, unknown>;
}

export interface ToolResult {
  event: TransitionEvent;
  contextUpdates: Record<string, unknown>;
}

export interface AgenticResult {
  event: TransitionEvent;
  contextUpdates: Record<string, unknown>;
}

export interface ComputeResult {
  event: TransitionEvent;
  contextUpdates: Record<string, unknown>;
}

export type ConversationResult =
  | { type: 'presentation'; response: string; contextUpdates: Record<string, unknown> }
  | { type: 'transition'; event: TransitionEvent; contextUpdates: Record<string, unknown> }
  | { type: 'complete'; event: CompleteEvent; contextUpdates: Record<string, unknown> };

export interface AgenticStepOutput {
  toolName: string;
  parameters: Record<string, unknown>;
  stepReasoning: string;
}

export interface ConversationStepOutput {
  toolName: string;
  parameters: Record<string, unknown>;
  stepReasoning?: string;
}

export interface ConversationEngineState {
  turnCount: number;
  toolResults: Array<{
    turn: number;
    step: number;
    toolName: string;
    parameters: Record<string, unknown>;
    result: unknown;
  }>;
  responses: Array<{
    turn: number;
    userMessage: string;
    assistantMessage: string;
  }>;
  toolCallCache: Record<string, unknown>;
  extractionState: unknown;
}

// ============================================================================
// Semantic Agent Types
// ============================================================================

export interface SemanticAgent<TOutput> {
  readonly config: SemanticAgentConfig<TOutput>;
  generate(
    input: string,
    context: ConversationContext
  ): AsyncGenerator<EngineStreamChunk, SemanticAgentResult<TOutput>>;
}

export interface SemanticAgentResult<TOutput> {
  result: TOutput;
  reasoning: string;
}

export interface SemanticAgentConfig<TOutput> {
  id: string;
  name: string;
  systemPrompt: string;
  outputSchema: { parse(data: unknown): TOutput };
  outputSchemaJson: Record<string, unknown>;
  maxRetries: number;
  temperature: number;
  maxOutputTokens: number | null;
  outputFormatting: 'plain' | 'markdown';
  outputDensity: 'compact' | 'spacious';
  reasoningFormatting: 'concise' | 'structured' | 'thinking_markers';
  thinkingGuidance?: string;
  modelAlias?: string | null;
}

export interface SemanticAgentFactory {
  createForNode<TOutput>(
    agentId: string,
    version: string,
    nodeId: string,
    thinkingGuidelines?: string
  ): Promise<SemanticAgent<TOutput>>;
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  urlTemplate: string;
  method: string;
  headers: Record<string, string> | null;
  bodyTemplate: string | null;
  responsePath: string | null;
  authType: string | null;
  parametersSchemaJson: Record<string, unknown> | null;
}

// ============================================================================
// Executor Interfaces
// ============================================================================

export interface IIntentParsingExecutor {
  presentOptions(
    node: IntentParsingNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult>;
  parseIntent(
    node: IntentParsingNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, IntentResult>;
}

export interface IGenerationExecutor {
  generate(
    node: GenerationNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, GenerationResult>;
}

export interface IRoutingExecutor {
  evaluate(
    node: RoutingNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, RoutingResult>;
}

export interface IReviewExecutor {
  presentContent(
    node: ReviewNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult>;
  parseAndModify(
    node: ReviewNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, IntentResult>;
}

export interface IToolExecutor {
  execute(
    node: ToolNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ToolResult>;
}

export interface IAgenticExecutor {
  execute(
    node: AgenticNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, AgenticResult>;
}

export interface IComputeExecutor {
  execute(
    node: ComputeNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ComputeResult>;
}

export interface IConversationExecutor {
  executeEntry(
    node: ConversationNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ConversationResult>;
  executeInput(
    node: ConversationNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ConversationResult>;
}
