import type {
  GenerationNode,
  ConversationContext,
  ExecutorDependencies,
  GenerationResult,
  IGenerationExecutor,
  TransitionEvent,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import { interpolate } from '../interpolate.js';
import {
  buildInterpolationContext,
  executeWithConcurrency,
  prepareIteration,
  buildItemContext,
  extractItemResult,
  mergeNodeReasoning,
} from '../applyActions.js';
import {
  buildNodeTitleChunk,
  buildPipelineEventChunk,
  buildThinkingChunk,
  buildThinkingDoneChunk,
  buildThoughtStartChunk,
  buildThoughtDoneChunk,
} from '../chunkBuilders.js';
import {
  buildIdRegistry,
  simplifyContextIds,
  reverseMapOutput,
  type IdRegistry,
} from '../idMapping.js';

export class GenerationExecutorImpl implements IGenerationExecutor {
  async *generate(
    node: GenerationNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, GenerationResult> {
    if (node.idMapping?.unknownIdStrategy === 'generate' && !deps.createId) {
      throw new ApplicationError(
        `[GenerationExecutor] node="${node.id}" has idMapping.unknownIdStrategy "generate" ` +
        `but no createId function provided in ExecutorDependencies`,
        { code: 'AGENT_ERROR', context: { nodeId: node.id } }
      );
    }

    if (node.iteration) {
      return yield* this.generateWithIteration(node, context, deps);
    }

    const { agentFactory } = deps;
    const agent = await agentFactory.createForNode<unknown>(node.agentId, deps.agentVersion, node.id, node.thinkingGuidelines);

    let flatContext: Record<string, unknown> = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      flatContext = await deps.contextDigester(flatContext, node.contextDigest);
    }
    let idRegistry: IdRegistry | null = null;
    if (node.idMapping) {
      idRegistry = buildIdRegistry(node.idMapping.inputRules, flatContext, deps.logger);
      flatContext = simplifyContextIds(flatContext, node.idMapping.inputRules, idRegistry);
    }

    const prompt = interpolate(node.generationPromptTemplate, flatContext);
    deps.loopDetector.checkPrompt(node.id, prompt);

    const { result: generatedContent, reasoning } = yield* agent.generate(prompt, context);

    if (node.idMapping && idRegistry && generatedContent !== null && typeof generatedContent === 'object') {
      reverseMapOutput(
        generatedContent as Record<string, unknown>,
        node.idMapping,
        idRegistry,
        deps.createId!
      );
    }

    let contentToStore = generatedContent;
    if (
      generatedContent !== null &&
      typeof generatedContent === 'object' &&
      !Array.isArray(generatedContent) &&
      node.outputContextKey in (generatedContent as Record<string, unknown>)
    ) {
      contentToStore = (generatedContent as Record<string, unknown>)[node.outputContextKey];
    }

    const contextUpdates: Record<string, unknown> = { [node.outputContextKey]: contentToStore };

    if (node.postGeneration) {
      const pg = node.postGeneration;
      if (pg.emitType && contentToStore) {
        yield buildPipelineEventChunk(pg.emitType, contentToStore);
      }
      if (pg.accumulateKey && contentToStore) {
        const rawAccumulated = context.data[pg.accumulateKey];
        if (rawAccumulated !== undefined && rawAccumulated !== null && !Array.isArray(rawAccumulated)) {
          throw new ApplicationError(
            `[GenerationExecutor] node="${node.id}": postGeneration.accumulateKey "${pg.accumulateKey}" ` +
            `contains a non-array value (${typeof rawAccumulated}). Expected array or undefined.`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
          );
        }
        const currentArray = (rawAccumulated as unknown[]) ?? [];
        let itemToAccumulate: unknown = contentToStore;
        if (typeof contentToStore === 'object' && contentToStore !== null && !Array.isArray(contentToStore)) {
          const keys = Object.keys(contentToStore as Record<string, unknown>);
          if (keys.length === 1) itemToAccumulate = (contentToStore as Record<string, unknown>)[keys[0]];
        }
        contextUpdates[pg.accumulateKey] = [...currentArray, itemToAccumulate];
      }
    }

    if (reasoning) {
      contextUpdates._reasoning = mergeNodeReasoning(context.data, node.id, reasoning);
    }

    const event: TransitionEvent = { type: 'TRANSITION', target: node.targetNodeId };
    return { event, contextUpdates };
  }

  private async *generateWithIteration(
    node: GenerationNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, GenerationResult> {
    const iteration = node.iteration!;
    const { agentFactory } = deps;

    let baseContext = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      baseContext = await deps.contextDigester(baseContext, node.contextDigest);
    }
    let idRegistry: IdRegistry | null = null;
    if (node.idMapping) {
      idRegistry = buildIdRegistry(node.idMapping.inputRules, baseContext, deps.logger);
      baseContext = simplifyContextIds(baseContext, node.idMapping.inputRules, idRegistry);
    }

    const contextForIteration = idRegistry ? baseContext : context.data;
    const { items, parallelArrays } = prepareIteration(iteration, contextForIteration, deps.logger);

    const agent = await agentFactory.createForNode<unknown>(node.agentId, deps.agentVersion, node.id, node.thinkingGuidelines);

    yield buildNodeTitleChunk(node.id, node.name, node.phaseLabel, node.description);

    if (node.thinkingDescription) {
      yield buildThinkingChunk();
      yield buildThoughtStartChunk(node.thinkingDescription);
    }

    const itemEvents: Array<{ emitType: string; data: unknown } | null> = [];
    const itemReasonings: string[] = [];

    const results = await executeWithConcurrency(
      items,
      async (item, index) => {
        const itemContext = buildItemContext(baseContext, iteration, item, index, parallelArrays);
        const prompt = interpolate(node.generationPromptTemplate, itemContext);
        deps.loopDetector.checkPrompt(node.id, prompt, index);

        const genResult = await drainAndGetResult(agent.generate(prompt, context));
        const generatedContent: unknown = genResult.result;
        itemReasonings[index] = genResult.reasoning ?? '';

        if (node.idMapping && idRegistry && generatedContent !== null && typeof generatedContent === 'object') {
          reverseMapOutput(
            generatedContent as Record<string, unknown>,
            node.idMapping,
            idRegistry,
            deps.createId!
          );
        }

        const extracted = extractItemResult(generatedContent, iteration.itemResultKey, node.id, index);

        if (extracted && typeof extracted === 'object' && 'draftId' in (extracted as Record<string, unknown>)) {
          if (!deps.createId) {
            throw new Error(
              '[GenerationExecutor] draftId replacement requires deps.createId.',
            );
          }
          (extracted as Record<string, unknown>).draftId = deps.createId();
        }

        if (node.postGeneration?.emitType && extracted) {
          itemEvents[index] = { emitType: node.postGeneration.emitType, data: extracted };
        } else {
          itemEvents[index] = null;
        }

        return extracted;
      },
      iteration.concurrency,
      { logger: deps.logger, maxRetryPasses: iteration.maxRetryPasses }
    );

    if (node.thinkingDescription) {
      yield buildThoughtDoneChunk(node.description ?? '');
      yield buildThinkingDoneChunk();
    }

    for (const event of itemEvents) {
      if (event) yield buildPipelineEventChunk(event.emitType, event.data);
    }

    deps.loopDetector.recordProgress();

    const combinedReasoning = itemReasonings
      .map((r, i) => r ? `[Item ${i}] ${r}` : '')
      .filter(Boolean).join('\n');

    const contextUpdates: Record<string, unknown> = { [node.outputContextKey]: results };
    if (combinedReasoning) {
      contextUpdates._reasoning = mergeNodeReasoning(context.data, node.id, combinedReasoning);
    }

    const transitionEvent: TransitionEvent = { type: 'TRANSITION', target: node.targetNodeId };
    return { event: transitionEvent, contextUpdates };
  }
}

async function drainAndGetResult<T>(
  gen: AsyncGenerator<EngineStreamChunk, T>
): Promise<T> {
  while (true) {
    const { done, value } = await gen.next();
    if (done) return value as T;
  }
}
