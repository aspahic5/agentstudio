import type {
  ConversationNode,
  ConversationResult,
  ConversationStepOutput,
  ConversationEngineState,
  ConversationContext,
  IConversationExecutor,
  ExecutorDependencies,
  ToolDefinition,
  TransitionEvent,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import {
  buildInterpolationContext,
  validateOutputSchema,
  mergeNodeReasoning,
} from '../applyActions.js';
import {
  toolCallCacheKey,
  buildToolDescriptions,
  createDefaultToolDispatcher,
  restoreEngineState,
  persistToolCallCache,
} from '../toolCallCache.js';
import { applyContextWindow, type WindowedHistory } from '../contextWindow.js';
import {
  buildPhaseStartChunk,
  buildTextChunk,
  buildThinkingChunk,
} from '../chunkBuilders.js';

const RESPOND_TO_USER = 'respond_to_user';
const COMPLETE_CONVERSATION = 'complete_conversation';

function buildPseudoToolDescriptions(node: ConversationNode): string {
  const parts: string[] = [];
  parts.push(
    `### respond_to_user\nSend a message to the user. Use this when you want to communicate, ask a question, or provide information.\n\nParameters:\n\`\`\`json\n{\n  "message": "string (required) — the message to show the user"\n}\n\`\`\``
  );
  parts.push(
    `### complete_conversation\nSignal that the conversation goal has been achieved. The output must conform to the required schema.\n\nParameters:\n\`\`\`json\n${JSON.stringify(node.outputSchema, null, 2)}\n\`\`\``
  );
  return parts.join('\n\n');
}

function buildStepPrompt(
  windowedHistory: WindowedHistory,
  userMessage: string,
  turnToolResults: Array<{ toolName: string; parameters: Record<string, unknown>; result: unknown }>,
  forceDirective: string | null
): string {
  const parts: string[] = [];

  if (windowedHistory.olderTurnsCount > 0) {
    if (windowedHistory.appliedStrategy === 'drop') {
      parts.push('## Conversation Context');
      parts.push(`(${windowedHistory.olderTurnsCount} earlier turns omitted)`);
      parts.push('');
    } else if (windowedHistory.olderTurnsSummary) {
      const label = windowedHistory.appliedStrategy === 'summarize'
        ? 'Summary of earlier conversation'
        : 'Key points from earlier conversation';
      parts.push(`## ${label}`);
      parts.push(windowedHistory.olderTurnsSummary);
      parts.push('');
    }
  }

  if (windowedHistory.pinnedContext.length > 0) {
    parts.push('## Pinned Context');
    for (const { key, value } of windowedHistory.pinnedContext) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      parts.push(`### ${key}`);
      parts.push(serialized);
    }
    parts.push('');
  }

  if (windowedHistory.recentTurns.length > 0) {
    parts.push('## Previous Conversation');
    for (const r of windowedHistory.recentTurns) {
      parts.push(`[Turn ${r.turn}]`);
      parts.push(`User: ${r.userMessage}`);
      parts.push(`Assistant: ${r.assistantMessage}`);
      parts.push('');
    }
  }

  if (turnToolResults.length > 0) {
    parts.push('## Tool Results This Turn');
    for (const tr of turnToolResults) {
      parts.push(`- ${tr.toolName}(${JSON.stringify(tr.parameters)}): ${JSON.stringify(tr.result)}`);
    }
    parts.push('');
  }

  parts.push('## Current User Message');
  parts.push(userMessage);

  if (forceDirective) {
    parts.push('');
    parts.push(forceDirective);
  }

  return parts.join('\n');
}

function restoreConversationState(engineState: Record<string, unknown>): ConversationEngineState {
  const raw = engineState.conversation;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const state = raw as Record<string, unknown>;
    return {
      turnCount: typeof state.turnCount === 'number' ? state.turnCount : 0,
      toolResults: Array.isArray(state.toolResults) ? (state.toolResults as ConversationEngineState['toolResults']) : [],
      responses: Array.isArray(state.responses) ? (state.responses as ConversationEngineState['responses']) : [],
      toolCallCache: (state.toolCallCache && typeof state.toolCallCache === 'object' && !Array.isArray(state.toolCallCache)) ? (state.toolCallCache as Record<string, unknown>) : {},
      extractionState: state.extractionState ?? null,
    };
  }
  return { turnCount: 0, toolResults: [], responses: [], toolCallCache: {}, extractionState: null };
}

function buildEngineUpdate(
  engineState: Record<string, unknown>,
  convState: ConversationEngineState,
  toolCallCache: Map<string, unknown>
): Record<string, unknown> {
  return {
    ...engineState,
    conversation: {
      ...convState,
      toolCallCache: persistToolCallCache(toolCallCache),
    },
  };
}

export class ConversationExecutorImpl implements IConversationExecutor {
  async *executeEntry(
    node: ConversationNode,
    context: ConversationContext,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ConversationResult> {
    yield buildPhaseStartChunk(node.phaseLabel, node.name);

    const reEntryFeedback = node.reEntryContextKey ? context.data[node.reEntryContextKey] : undefined;
    const mode = context.data.mode as string | undefined;
    const chooseModeTransition = mode === 'new' || mode === 'edit' || mode === 'select';

    let goalMessage: string;
    if (reEntryFeedback) {
      goalMessage =
        `Resuming conversation. Feedback from previous step:\n\n` +
        `${typeof reEntryFeedback === 'string' ? reEntryFeedback : JSON.stringify(reEntryFeedback, null, 2)}` +
        `\n\nGoal: ${node.goalDescription}`;
    } else {
      goalMessage = node.goalDescription;
    }

    if (!chooseModeTransition || reEntryFeedback) {
      yield buildTextChunk(goalMessage);
    }

    return { type: 'presentation', response: goalMessage, contextUpdates: {} };
  }

  async *executeInput(
    node: ConversationNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ConversationResult> {
    const { agentFactory, toolDispatcher } = deps;
    const dispatch = toolDispatcher ?? createDefaultToolDispatcher(deps.templateEnv, deps.credentials);

    const engineState = restoreEngineState(context.data);
    const convState = restoreConversationState(engineState);
    const toolCallCache = new Map<string, unknown>(Object.entries(convState.toolCallCache));
    const turnNumber = convState.turnCount + 1;

    const toolDefMap = new Map<string, ToolDefinition>();
    if (node.availableTools && node.availableTools.length > 0) {
      for (const toolName of node.availableTools) {
        const def = deps.toolDefinitions.get(toolName);
        if (!def) {
          throw new ApplicationError(
            `[ConversationExecutor] node="${node.id}": tool "${toolName}" not found in toolDefinitions.`,
            { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
          );
        }
        toolDefMap.set(def.name, def);
      }
    }

    const realToolDescriptions = buildToolDescriptions(Array.from(toolDefMap.values()));
    const pseudoToolDescriptions = buildPseudoToolDescriptions(node);
    const allToolDescriptions = realToolDescriptions
      ? `${realToolDescriptions}\n\n---\n\n## Protocol Tools\n\n${pseudoToolDescriptions}`
      : pseudoToolDescriptions;

    let flatContext: Record<string, unknown> = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      flatContext = await deps.contextDigester(flatContext, node.contextDigest);
    }
    flatContext = {
      ...flatContext,
      env: deps.templateEnv,
      credentials: buildNodeCredentials(node.id, node.requiredCredentials, deps.credentials),
    };

    const stepAgent = await agentFactory.createForNode<ConversationStepOutput>(node.agentId, deps.agentVersion, node.id);

    const turnToolResults: Array<{ toolName: string; parameters: Record<string, unknown>; result: unknown }> = [];

    const windowedHistory: WindowedHistory = node.contextWindowConfig
      ? await applyContextWindow(convState.responses, node.contextWindowConfig, context.data, deps.contextWindowSummarizer)
      : { olderTurnsSummary: '', appliedStrategy: 'none', recentTurns: convState.responses, pinnedContext: [], olderTurnsCount: 0 };

    yield buildThinkingChunk('Thinking...');

    const stepReasonings: string[] = [];
    const buildReasoningUpdates = (): Record<string, unknown> => {
      const combined = stepReasonings.join('\n');
      return combined ? { _reasoning: mergeNodeReasoning(context.data, node.id, combined) } : {};
    };

    for (let step = 0; step < node.maxStepsPerTurn + 1; step++) {
      const isForceStep = step === node.maxStepsPerTurn;

      const forceDirective = isForceStep
        ? '**STEP LIMIT REACHED. You MUST call respond_to_user or complete_conversation NOW. Do not call any other tool.**'
        : null;
      const stepPrompt = buildStepPrompt(windowedHistory, userMessage, turnToolResults, forceDirective);

      if (step === 0) deps.loopDetector.checkPrompt(node.id, stepPrompt);

      const stepContext: ConversationContext = {
        ...context,
        data: {
          ...context.data,
          toolDescriptions: allToolDescriptions,
          conversationHistory: convState.responses,
          goalDescription: node.goalDescription,
        },
      };

      const { result: stepOutput, reasoning: stepReasoning } = yield* stepAgent.generate(stepPrompt, stepContext);
      if (stepReasoning) stepReasonings.push(stepReasoning);

      if (stepOutput.toolName === RESPOND_TO_USER) {
        const message = typeof stepOutput.parameters.message === 'string'
          ? stepOutput.parameters.message
          : JSON.stringify(stepOutput.parameters.message);

        yield buildTextChunk(message);

        convState.responses.push({ turn: turnNumber, userMessage, assistantMessage: message });
        convState.turnCount = turnNumber;
        this.appendTurnToolResults(convState, turnNumber, turnToolResults);

        return {
          type: 'presentation',
          response: message,
          contextUpdates: { _engine: buildEngineUpdate(engineState, convState, toolCallCache), ...buildReasoningUpdates() },
        };
      }

      if (stepOutput.toolName === COMPLETE_CONVERSATION) {
        const outputData = stepOutput.parameters;

        const validationError = validateOutputSchema(outputData, node.outputSchema, `ConversationExecutor:${node.id}`);
        if (validationError && isForceStep) {
          yield buildTextChunk("I've completed our conversation goals.");
          return {
            type: 'presentation',
            response: "I've completed our conversation goals.",
            contextUpdates: { _engine: buildEngineUpdate(engineState, convState, toolCallCache), ...buildReasoningUpdates() },
          };
        } else if (validationError) {
          turnToolResults.push({ toolName: COMPLETE_CONVERSATION, parameters: stepOutput.parameters, result: { error: validationError } });
          continue;
        }

        const completionContextUpdates: Record<string, unknown> = {
          _engine: buildEngineUpdate(engineState, convState, toolCallCache),
          ...buildReasoningUpdates(),
        };

        if (node.outputContextKey && outputData) {
          completionContextUpdates[node.outputContextKey] = outputData;
        }

        const event: TransitionEvent = { type: 'TRANSITION', target: node.targetNodeId };
        return { type: 'transition', event, contextUpdates: completionContextUpdates };
      }

      if (isForceStep) {
        yield buildTextChunk('Let me give you my thoughts based on what we discussed.');
        convState.responses.push({
          turn: turnNumber,
          userMessage,
          assistantMessage: 'Let me give you my thoughts based on what we discussed.',
        });
        convState.turnCount = turnNumber;
        return {
          type: 'presentation',
          response: 'Let me give you my thoughts based on what we discussed.',
          contextUpdates: { _engine: buildEngineUpdate(engineState, convState, toolCallCache), ...buildReasoningUpdates() },
        };
      }

      const toolDef = toolDefMap.get(stepOutput.toolName);
      if (toolDef?.parametersSchemaJson) {
        const paramValidationError = validateOutputSchema(
          stepOutput.parameters,
          toolDef.parametersSchemaJson,
          `ConversationExecutor:${node.id}:tool:${stepOutput.toolName}`
        );
        if (paramValidationError) {
          turnToolResults.push({
            toolName: stepOutput.toolName,
            parameters: stepOutput.parameters,
            result: { error: paramValidationError, instruction: `Your parameters for "${stepOutput.toolName}" did not match the required schema. Fix the errors and try again.` },
          });
          continue;
        }
      }

      const cacheKey = toolCallCacheKey(stepOutput.toolName, stepOutput.parameters);
      const cachedResult = toolCallCache.get(cacheKey);

      let result: unknown;
      if (cachedResult !== undefined) {
        result = cachedResult;
        yield buildThinkingChunk(`Using cached result for ${stepOutput.toolName}...`);
      } else {
        yield buildThinkingChunk(`Calling ${stepOutput.toolName}...`);
        result = await dispatch(stepOutput.toolName, stepOutput.parameters, toolDefMap, flatContext);
        toolCallCache.set(cacheKey, result);
      }

      if (deps.postToolCallHook) yield* deps.postToolCallHook(stepOutput.toolName, result, context);

      turnToolResults.push({
        toolName: stepOutput.toolName,
        parameters: stepOutput.parameters,
        result,
      });
    }

    throw new ApplicationError(
      `[ConversationExecutor] node="${node.id}" loop ended unexpectedly`,
      { code: 'AGENT_ERROR', context: { nodeId: node.id } }
    );
  }

  private appendTurnToolResults(
    convState: ConversationEngineState,
    turnNumber: number,
    turnToolResults: Array<{ toolName: string; parameters: Record<string, unknown>; result: unknown }>
  ): void {
    for (let step = 0; step < turnToolResults.length; step++) {
      const tr = turnToolResults[step];
      convState.toolResults.push({
        turn: turnNumber,
        step,
        toolName: tr.toolName,
        parameters: tr.parameters,
        result: tr.result,
      });
    }
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
        `[ConversationExecutor] node="${nodeId}": required credential "${key}" is not configured.`,
        { code: 'AGENT_ERROR', context: { nodeId } }
      );
    }
    result[key] = value;
  }
  return result;
}
