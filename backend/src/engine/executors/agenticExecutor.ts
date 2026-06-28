import type {
  AgenticNode,
  AgenticResult,
  IAgenticExecutor,
  AgenticStepOutput,
  ConversationContext,
  ExecutorDependencies,
  ToolDefinition,
  TransitionEvent,
  EngineStreamChunk,
  SemanticAgent,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import { interpolate } from '../interpolate.js';
import { buildInterpolationContext, validateOutputSchema, mergeNodeReasoning } from '../applyActions.js';
import {
  toolCallCacheKey,
  buildToolDescriptions,
  createDefaultToolDispatcher,
  restoreEngineState,
  restoreToolCallCache,
  persistToolCallCache,
} from '../toolCallCache.js';
import {
  buildPhaseStartChunk,
  buildThinkingChunk,
  buildContextUpdateChunk,
} from '../chunkBuilders.js';

const SUBMIT_TOOL = 'submit';

function requireTurnNumber(contextData: Record<string, unknown>, key: string, nodeId: string): number {
  const raw = contextData[key];
  if (typeof raw !== 'number') {
    throw new ApplicationError(
      `[AgenticExecutor] Node "${nodeId}" requires "${key}" (number) in context.data ` +
      `(delta merge or audit trail configured) but it is ${raw === undefined ? 'missing' : `type "${typeof raw}"`}. ` +
      `Ensure the agent sets "${key}" via an increment_context action.`,
      { code: 'AGENT_ERROR', context: { nodeId } }
    );
  }
  return raw;
}

function isNonEmptyDelta(delta: unknown): boolean {
  if (delta == null) return false;
  if (typeof delta === 'object' && !Array.isArray(delta)) {
    return Object.keys(delta as Record<string, unknown>).length > 0;
  }
  return true;
}

interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
}

interface AuditStep {
  type: 'tool_call' | 'tool_result' | 'reasoning';
  toolName?: string;
  input?: unknown;
  output?: unknown;
  text?: string;
  timestamp: string;
}

interface AuditTrailEntry {
  turnNumber: number;
  steps: AuditStep[];
}

export class AgenticExecutorImpl implements IAgenticExecutor {
  async *execute(
    node: AgenticNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, AgenticResult> {
    const { agentFactory, toolDispatcher } = deps;
    const dispatch = toolDispatcher ?? createDefaultToolDispatcher(deps.templateEnv, deps.credentials);

    yield buildPhaseStartChunk(node.phaseLabel, node.name);

    const toolDefMap = new Map<string, ToolDefinition>();
    for (const toolName of node.toolNames) {
      const def = deps.toolDefinitions.get(toolName);
      if (!def) {
        throw new ApplicationError(
          `[AgenticExecutor] node="${node.id}": tool "${toolName}" not found in toolDefinitions.`,
          { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
        );
      }
      toolDefMap.set(def.name, def);
    }

    let flatContext: Record<string, unknown> = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      flatContext = await deps.contextDigester(flatContext, node.contextDigest);
    }
    const toolDispatchContext: Record<string, unknown> = {
      ...flatContext,
      env: deps.templateEnv,
      credentials: buildNodeCredentials(node.id, node.requiredCredentials, deps.credentials),
    };

    const toolResults: ToolCallResult[] = [];
    const auditSteps: AuditStep[] = [];

    const engineState = restoreEngineState(context.data);
    const toolCallCache = restoreToolCallCache(engineState);

    const stepAgent = await agentFactory.createForNode<AgenticStepOutput>(
      node.agentId,
      deps.agentVersion,
      `${node.id}-step`
    );

    const toolDescriptions = buildToolDescriptions(Array.from(toolDefMap.values()));
    yield buildThinkingChunk('Analyzing and planning...');

    let finalOutput: Record<string, unknown> | null = null;

    for (let step = 0; step < node.maxSteps; step++) {
      const stepFlatContext = { ...flatContext, toolResults, toolDescriptions };
      const stepPrompt = interpolate(node.agenticPromptTemplate, stepFlatContext as Record<string, unknown>);

      if (step === 0) deps.loopDetector.checkPrompt(node.id, stepPrompt);

      const stepContext: ConversationContext = {
        ...context,
        data: { ...context.data, toolResults, toolDescriptions },
      };

      const { result: stepOutput, reasoning } = yield* stepAgent.generate(stepPrompt, stepContext);

      if (reasoning || stepOutput.stepReasoning) {
        auditSteps.push({
          type: 'reasoning',
          text: reasoning || stepOutput.stepReasoning,
          timestamp: new Date().toISOString(),
        });
      }

      if (stepOutput.toolName === SUBMIT_TOOL) {
        const validationError = validateOutputSchema(
          stepOutput.parameters,
          node.outputSchema,
          `AgenticExecutor:${node.id}`
        );
        if (validationError) {
          toolResults.push({
            toolName: SUBMIT_TOOL,
            input: stepOutput.parameters,
            output: { error: validationError, instruction: 'Your submit output did not match the required schema. Fix the errors and call submit again.' },
          });
          auditSteps.push({ type: 'tool_result', toolName: SUBMIT_TOOL, output: { validationError }, timestamp: new Date().toISOString() });
          continue;
        }
        finalOutput = stepOutput.parameters;
        break;
      }

      const toolDef = toolDefMap.get(stepOutput.toolName);
      if (toolDef?.parametersSchemaJson) {
        const paramValidationError = validateOutputSchema(
          stepOutput.parameters,
          toolDef.parametersSchemaJson,
          `AgenticExecutor:${node.id}:tool:${stepOutput.toolName}`
        );
        if (paramValidationError) {
          toolResults.push({
            toolName: stepOutput.toolName,
            input: stepOutput.parameters,
            output: { error: paramValidationError, instruction: `Your parameters for "${stepOutput.toolName}" did not match the required schema. Fix the errors and try again.` },
          });
          auditSteps.push({ type: 'tool_result', toolName: stepOutput.toolName, output: { paramValidationError }, timestamp: new Date().toISOString() });
          continue;
        }
      }

      const cacheKey = toolCallCacheKey(stepOutput.toolName, stepOutput.parameters);
      const cachedResult = toolCallCache.get(cacheKey);

      auditSteps.push({ type: 'tool_call', toolName: stepOutput.toolName, input: stepOutput.parameters, timestamp: new Date().toISOString() });

      let result: unknown;
      if (cachedResult !== undefined) {
        result = cachedResult;
        yield buildThinkingChunk(`Using cached result for ${stepOutput.toolName}...`);
      } else {
        yield buildThinkingChunk(`Calling ${stepOutput.toolName}...`);
        result = await dispatch(stepOutput.toolName, stepOutput.parameters, toolDefMap, toolDispatchContext);
        toolCallCache.set(cacheKey, result);
      }

      if (deps.postToolCallHook) yield* deps.postToolCallHook(stepOutput.toolName, result, context);

      auditSteps.push({ type: 'tool_result', toolName: stepOutput.toolName, output: result, timestamp: new Date().toISOString() });
      toolResults.push({ toolName: stepOutput.toolName, input: stepOutput.parameters, output: result });
    }

    if (!finalOutput) {
      const forceResult = yield* this.forceSubmit(
        node, context, stepAgent, toolResults, toolDescriptions, flatContext, auditSteps, deps
      );
      finalOutput = forceResult;
    }

    const contextUpdates: Record<string, unknown> = {
      [node.outputContextKey]: finalOutput,
      _engine: {
        ...engineState,
        toolCallCache: persistToolCallCache(toolCallCache),
      },
    };

    if (node.deltaField && node.deltaTargetKey) {
      if (!node.turnNumberKey) {
        throw new ApplicationError(
          `[AgenticExecutor] node "${node.id}" requires turnNumberKey for delta merge operations`,
          { code: 'AGENT_ERROR', context: { nodeId: node.id } }
        );
      }
      const { deltaMergeHandler } = deps;
      if (!deltaMergeHandler) {
        throw new ApplicationError(
          `[AgenticExecutor] Node "${node.id}" has deltaField + deltaTargetKey configured ` +
          `but no deltaMergeHandler was provided in ExecutorDependencies.`,
          { code: 'AGENT_ERROR', context: { nodeId: node.id } }
        );
      }

      const turnNumber = requireTurnNumber(context.data, node.turnNumberKey, node.id);
      const delta = finalOutput[node.deltaField];
      if (isNonEmptyDelta(delta)) {
        const currentState = context.data[node.deltaTargetKey];
        const mergedState = deltaMergeHandler(currentState, delta, turnNumber, context);
        contextUpdates[node.deltaTargetKey] = mergedState;
        if (node.deltaEmitCardType) {
          yield buildContextUpdateChunk(node.deltaEmitCardType, mergedState as Record<string, unknown>);
        }
      }
    }

    const combinedReasoning = auditSteps
      .filter(s => s.type === 'reasoning' && s.text)
      .map(s => s.text!)
      .join('\n');

    if (combinedReasoning) {
      contextUpdates._reasoning = mergeNodeReasoning(context.data, node.id, combinedReasoning);
    }

    if (node.auditTrailKey) {
      if (!node.turnNumberKey) {
        throw new ApplicationError(
          `[AgenticExecutor] node "${node.id}" requires turnNumberKey for audit trail operations`,
          { code: 'AGENT_ERROR', context: { nodeId: node.id } }
        );
      }
      const turnNumber = requireTurnNumber(context.data, node.turnNumberKey, node.id);
      const auditEntry: AuditTrailEntry = { turnNumber, steps: auditSteps };
      const existingTrail = (context.data[node.auditTrailKey] as AuditTrailEntry[]) ?? [];
      contextUpdates[node.auditTrailKey] = [...existingTrail, auditEntry];
    }

    const event: TransitionEvent = { type: 'TRANSITION', target: node.targetNodeId };
    return { event, contextUpdates };
  }

  private async *forceSubmit(
    node: AgenticNode,
    context: ConversationContext,
    stepAgent: SemanticAgent<AgenticStepOutput>,
    toolResults: ToolCallResult[],
    toolDescriptions: string,
    flatContext: Record<string, unknown>,
    auditSteps: AuditStep[],
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, Record<string, unknown>> {
    deps.logger.warn({ nodeId: node.id, maxSteps: node.maxSteps }, '[AgenticExecutor] maxSteps reached without submit, forcing completion');

    const forceFlatContext = { ...flatContext, toolResults, toolDescriptions };
    const basePrompt = interpolate(node.agenticPromptTemplate, forceFlatContext as Record<string, unknown>);
    const forcePrompt = basePrompt + '\n\n**STEP LIMIT REACHED. You MUST call the `submit` tool NOW with your best assessment based on available information. Do not call any other tool.**';

    const forceContext: ConversationContext = {
      ...context,
      data: { ...context.data, toolResults, toolDescriptions },
    };

    try {
      const { result: forceOutput, reasoning } = yield* stepAgent.generate(forcePrompt, forceContext);

      if (reasoning || forceOutput.stepReasoning) {
        auditSteps.push({ type: 'reasoning', text: reasoning || forceOutput.stepReasoning, timestamp: new Date().toISOString() });
      }

      if (forceOutput.toolName === SUBMIT_TOOL) {
        const validationError = validateOutputSchema(
          forceOutput.parameters,
          node.outputSchema,
          `AgenticExecutor:${node.id}:forceSubmit`
        );
        if (!validationError) return forceOutput.parameters;
        deps.logger.warn({ nodeId: node.id, validationError }, '[AgenticExecutor] Forced submit output failed validation');
      } else {
        deps.logger.warn({ nodeId: node.id, toolName: forceOutput.toolName }, '[AgenticExecutor] Forced submit call returned non-submit tool');
      }
    } catch (err) {
      deps.logger.error({ nodeId: node.id, err }, '[AgenticExecutor] Forced submit failed');
    }

    if (node.forcedSubmitFallback) {
      auditSteps.push({
        type: 'reasoning',
        text: 'Forced completion — agentic loop exhausted maxSteps without producing output. Using configured fallback.',
        timestamp: new Date().toISOString(),
      });
      return node.forcedSubmitFallback;
    }

    throw new ApplicationError(
      `[AgenticExecutor] Node "${node.id}" exhausted ${node.maxSteps} steps without a valid submit. ` +
      `Configure forcedSubmitFallback to handle this case gracefully.`,
      { code: 'AGENT_ERROR', context: { nodeId: node.id } }
    );
  }
}

function buildNodeCredentials(
  nodeId: string,
  requiredCredentials: string[] | undefined,
  credentials: Record<string, string>
): Record<string, string> {
  if (!requiredCredentials || requiredCredentials.length === 0) return {};
  const result: Record<string, string> = {};
  for (const key of requiredCredentials) {
    const value = credentials[key];
    if (!value) {
      throw new ApplicationError(
        `[AgenticExecutor] node="${nodeId}": required credential "${key}" is not configured.`,
        { code: 'AGENT_ERROR', context: { nodeId } }
      );
    }
    result[key] = value;
  }
  return result;
}
