import type {
  IntentParsingNode,
  ConversationContext,
  ExecutorDependencies,
  PresentationResult,
  IntentResult,
  IIntentParsingExecutor,
  TransitionEvent,
  CompleteEvent,
  Intent,
  OptionItem,
  OptionsConfig,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import { interpolate } from '../interpolate.js';
import {
  buildInterpolationContext,
  applyActions,
  mergeNodeReasoning,
} from '../applyActions.js';
import { buildTextChunk, buildOptionsChunk } from '../chunkBuilders.js';

interface ParsedIntent {
  intent: Intent;
  responseToUser?: string;
  [key: string]: unknown;
}

export class IntentParsingExecutorImpl implements IIntentParsingExecutor {
  async *presentOptions(
    node: IntentParsingNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult> {
    let flatContext = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      flatContext = await deps.contextDigester(flatContext, node.contextDigest);
    }
    const prompt = interpolate(node.initialPromptTemplate, flatContext);

    yield buildTextChunk(prompt);

    let optionsConfig: OptionsConfig = node.optionsConfig;
    if (optionsConfig.items.length === 0 && node.dynamicOptionsContextKey) {
      const raw = context.data[node.dynamicOptionsContextKey];
      if (raw !== undefined && raw !== null) {
        if (!Array.isArray(raw)) {
          throw new ApplicationError(
            `[IntentParsingExecutor] node="${node.id}": dynamicOptionsContextKey ` +
            `"${node.dynamicOptionsContextKey}" must be an array, got ${typeof raw}`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
          );
        }
        if (raw.length > 0) {
          const items: OptionItem[] = raw.map((item: unknown, index: number) => {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) {
              throw new ApplicationError(
                `[IntentParsingExecutor] node="${node.id}": dynamicOptionsContextKey ` +
                `"${node.dynamicOptionsContextKey}"[${index}] must be an object`,
                { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
              );
            }
            const obj = item as Record<string, unknown>;
            if (obj.id === undefined || obj.id === null) {
              throw new ApplicationError(
                `[IntentParsingExecutor] node="${node.id}": dynamicOptionsContextKey ` +
                `"${node.dynamicOptionsContextKey}"[${index}] is missing required "id" field. ` +
                `Available keys: [${Object.keys(obj).join(', ')}]`,
                { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
              );
            }
            return {
              id: String(obj.id),
              label: typeof obj.label === 'string' ? obj.label : typeof obj.summary === 'string' ? obj.summary : String(obj.id),
              value: String(obj.id),
              ...(typeof obj.description === 'string' && { description: obj.description }),
              ...(typeof obj.intent === 'string' && { intent: obj.intent }),
            };
          });
          optionsConfig = { ...optionsConfig, items };
        }
      }
    }

    const interpolatedOptionsConfig: OptionsConfig = {
      ...optionsConfig,
      items: optionsConfig.items
        .filter((item) => !item.condition || interpolate(item.condition, flatContext).trim() !== '')
        .map((item) => ({
          ...item,
          ...(item.description ? { description: interpolate(item.description, flatContext) } : {}),
          ...(item.disabled ? { disabled: interpolate(item.disabled, flatContext).trim() } : {}),
        })),
    };

    yield buildOptionsChunk(node.id, node.phaseLabel, interpolatedOptionsConfig);

    return { response: prompt };
  }

  async *parseIntent(
    node: IntentParsingNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, IntentResult> {
    const deterministicResult = this.tryDeterministicResolve(node, context, userMessage);
    if (deterministicResult) {
      return this.buildIntentResult(node, context, deterministicResult, deps);
    }

    const agent = await deps.agentFactory.createForNode<ParsedIntent>(node.agentId, deps.agentVersion, node.id);
    const agentResult = yield* agent.generate(userMessage, context);
    const parsedIntent = agentResult.result;

    if (!node.validIntents.includes(parsedIntent.intent)) {
      throw new ApplicationError(
        `Invalid intent "${parsedIntent.intent}" for node "${node.id}". ` +
        `Valid intents: ${node.validIntents.join(', ')}`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
      );
    }

    const intentResult = this.buildIntentResult(node, context, parsedIntent.intent, deps, parsedIntent);

    if (agentResult.reasoning) {
      intentResult.contextUpdates._reasoning = mergeNodeReasoning(context.data, node.id, agentResult.reasoning);
    }

    return intentResult;
  }

  private tryDeterministicResolve(
    node: IntentParsingNode,
    context: ConversationContext,
    userMessage: string
  ): string | null {
    const options = this.resolveOptions(node, context);
    const matched = options.find((opt) => opt.value === userMessage && opt.intent);
    if (!matched || !matched.intent) return null;
    if (!node.validIntents.includes(matched.intent)) return null;
    if (!node.transitions[matched.intent]) return null;
    return matched.intent;
  }

  private resolveOptions(node: IntentParsingNode, context: ConversationContext): OptionItem[] {
    if (node.optionsConfig.items.length > 0) return node.optionsConfig.items;
    if (node.dynamicOptionsContextKey) {
      const raw = context.data[node.dynamicOptionsContextKey];
      if (Array.isArray(raw)) return raw as OptionItem[];
    }
    return [];
  }

  private buildIntentResult(
    node: IntentParsingNode,
    context: ConversationContext,
    intent: string,
    deps: ExecutorDependencies,
    parsedFields?: Record<string, unknown>
  ): IntentResult {
    const transitionRule = node.transitions[intent];
    if (!transitionRule) {
      throw new ApplicationError(
        `No transition rule for intent "${intent}" in node "${node.id}"`,
        { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
      );
    }

    const flatContext = {
      ...buildInterpolationContext(context),
      ...(parsedFields ?? {}),
    };

    const responseTemplate = node.responseTemplates[intent];
    const response = responseTemplate
      ? interpolate(responseTemplate, flatContext)
      : ((parsedFields as ParsedIntent | undefined)?.responseToUser ?? 'Got it.');

    const contextUpdates = applyActions(transitionRule.actions, flatContext, context.data, deps.loopDetector);

    let event: TransitionEvent | CompleteEvent;
    if (transitionRule.target === 'complete') {
      event = { type: 'COMPLETE' };
    } else if (transitionRule.target === 'self') {
      event = { type: 'TRANSITION', target: node.id };
    } else {
      event = { type: 'TRANSITION', target: transitionRule.target };
    }

    return { response, event, contextUpdates };
  }
}
