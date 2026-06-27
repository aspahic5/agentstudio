import type {
  ToolNode,
  ConversationContext,
  ExecutorDependencies,
  ToolResult,
  IToolExecutor,
  TransitionEvent,
  EngineStreamChunk,
  ToolDispatcher,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import {
  extractPath,
  buildInterpolationContext,
  executeWithConcurrency,
  prepareIteration,
  buildItemContext,
  extractItemResult,
} from '../applyActions.js';
import { createDefaultToolDispatcher } from '../toolCallCache.js';

function applyOutputMapping(
  mapping: Record<string, string>,
  result: unknown,
  nodeId: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [responsePath, contextKey] of Object.entries(mapping)) {
    const value = extractPath(result, responsePath);
    if (value === undefined) {
      throw new ApplicationError(
        `[ToolExecutor] outputContextKeyMapping: response path "${responsePath}" ` +
        `not found in tool response for node "${nodeId}". ` +
        `Available top-level keys: ${result && typeof result === 'object' ? Object.keys(result as Record<string, unknown>).join(', ') : '(non-object response)'}`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId } }
      );
    }
    updates[contextKey] = value;
  }
  return updates;
}

export class ToolExecutorImpl implements IToolExecutor {
  async *execute(
    node: ToolNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ToolResult> {
    if (node.skipWhenEmpty && !node.iteration) {
      const value = extractPath(context.data, node.skipWhenEmpty);
      const isEmpty =
        (Array.isArray(value) && value.length === 0) ||
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value === '');
      if (isEmpty) {
        const skipUpdates = node.outputContextKeyMapping
          ? Object.fromEntries(Object.values(node.outputContextKeyMapping).map((k) => [k, null]))
          : { [node.outputContextKey]: null };
        return {
          event: { type: 'TRANSITION', target: node.targetNodeId },
          contextUpdates: skipUpdates,
        };
      }
    }

    const toolDef = deps.toolDefinitions.get(node.toolName);
    if (!toolDef) {
      throw new ApplicationError(
        `[ToolExecutor] node="${node.id}": tool "${node.toolName}" not found in toolDefinitions. ` +
        `Available: [${Array.from(deps.toolDefinitions.keys()).join(', ')}]`,
        { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
      );
    }

    const dispatch: ToolDispatcher = deps.toolDispatcher
      ?? createDefaultToolDispatcher(deps.templateEnv, deps.credentials);

    const baseContext = {
      ...buildInterpolationContext(context),
      env: deps.templateEnv,
      credentials: buildNodeCredentials(node.id, node.requiredCredentials, deps.credentials),
    };

    let result: unknown;

    if (node.iteration) {
      const { items, parallelArrays } = prepareIteration(node.iteration, context.data, deps.logger);
      const pendingHookChunks: EngineStreamChunk[] = [];

      result = await executeWithConcurrency(
        items,
        async (item, index) => {
          const itemContext = buildItemContext(baseContext, node.iteration!, item, index, parallelArrays);

          if (node.skipWhenEmpty) {
            const value = extractPath(itemContext, node.skipWhenEmpty);
            const empty =
              (Array.isArray(value) && value.length === 0) ||
              value === null ||
              value === undefined ||
              (typeof value === 'string' && value === '');
            if (empty) return null;
          }

          const dispatchResult = await dispatch(node.toolName, itemContext, deps.toolDefinitions, itemContext);
          if (deps.postToolCallHook) {
            for await (const chunk of deps.postToolCallHook(node.toolName, dispatchResult, context)) {
              pendingHookChunks.push(chunk);
            }
          }
          return extractItemResult(dispatchResult, node.iteration!.itemResultKey, node.id, index);
        },
        node.iteration.concurrency,
        { retryDelayMs: 2000, maxRetryPasses: 4, logger: deps.logger }
      );

      for (const chunk of pendingHookChunks) {
        yield chunk;
      }

      deps.loopDetector.recordProgress();
    } else {
      result = await dispatch(node.toolName, baseContext, deps.toolDefinitions, baseContext);
      if (deps.postToolCallHook) yield* deps.postToolCallHook(node.toolName, result, context);
    }

    const event: TransitionEvent = { type: 'TRANSITION', target: node.targetNodeId };
    const contextUpdates = node.outputContextKeyMapping
      ? applyOutputMapping(node.outputContextKeyMapping, result, node.id)
      : { [node.outputContextKey]: result };

    return { event, contextUpdates };
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
        `[ToolExecutor] node="${nodeId}": required credential "${key}" is not configured. ` +
        `Available credentials: [${Object.keys(credentials).join(', ')}]`,
        { code: 'AGENT_ERROR', context: { nodeId } }
      );
    }
    result[key] = value;
  }
  return result;
}
