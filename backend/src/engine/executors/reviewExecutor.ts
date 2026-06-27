import type {
  ReviewNode,
  ConversationContext,
  ExecutorDependencies,
  PresentationResult,
  IntentResult,
  IReviewExecutor,
  TransitionEvent,
  CompleteEvent,
  Intent,
  OptionsConfig,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';
import { interpolate } from '../interpolate.js';
import { buildInterpolationContext, applyActions, mergeNodeReasoning } from '../applyActions.js';
import {
  computeDiff,
  stripAnnotations,
  computeBaselineDiff,
  hasAnnotations,
} from '../diffTracking.js';
import { buildTextChunk, buildOptionsChunk, buildPipelineEventChunk } from '../chunkBuilders.js';

interface IntentParsedResult {
  intent: Intent;
  responseToUser?: string;
  feedback?: string;
  customInput?: string;
  itemsToRemove?: string[];
  selectedItems?: (string | number)[];
  confirmed?: boolean;
  instructionsForNextStep?: string;
}

export class ReviewExecutorImpl implements IReviewExecutor {
  async *presentContent(
    node: ReviewNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult> {
    let flatContext: Record<string, unknown> = buildInterpolationContext(context);
    if (node.contextDigest && deps.contextDigester) {
      flatContext = await deps.contextDigester(flatContext, node.contextDigest);
    }

    if (node.diffTracking?.nestedBaselineKeys) {
      const content = flatContext[node.contentContextKey];
      if (content && typeof content === 'object' && !Array.isArray(content)) {
        const contentObj = content as Record<string, unknown>;
        if (!hasAnnotations(contentObj, node.diffTracking)) {
          const annotated = computeBaselineDiff(contentObj, flatContext, node.diffTracking);
          flatContext = { ...flatContext, [node.contentContextKey]: annotated };
        }
      }
    }

    const prompt = interpolate(node.initialPromptTemplate, flatContext);
    yield buildTextChunk(prompt);

    let optionsConfig: OptionsConfig = node.optionsConfig;
    const currentContent = flatContext[node.contentContextKey] as
      | Array<{ id: string; label?: string; summary?: string; description?: string; _changeStatus?: string }>
      | undefined;

    if (optionsConfig.items.length === 0 && currentContent && currentContent.length > 0) {
      const items = currentContent.map((item) => ({
        id: item.id,
        label: item.label ?? item.summary ?? item.id,
        value: item.id,
        ...(item.description && { description: item.description }),
        ...(item._changeStatus && { _changeStatus: item._changeStatus as import('../types.js').ChangeStatus }),
      }));
      optionsConfig = { ...optionsConfig, items };
    }

    yield buildOptionsChunk(node.id, node.phaseLabel, optionsConfig);

    return { response: prompt };
  }

  async *parseAndModify(
    node: ReviewNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, IntentResult> {
    const { agentFactory } = deps;

    const intentAgent = await agentFactory.createForNode<IntentParsedResult>(node.agentId, deps.agentVersion, node.id);
    const intentAgentResult = yield* intentAgent.generate(userMessage, context);
    const parsed = intentAgentResult.result;
    const intentReasoning = intentAgentResult.reasoning;

    if (!node.validIntents.includes(parsed.intent)) {
      throw new ApplicationError(
        `Invalid intent "${parsed.intent}" for node "${node.id}". ` +
        `Valid intents: ${node.validIntents.join(', ')}`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId: node.id } }
      );
    }

    const transitionRule = node.transitions[parsed.intent];
    if (!transitionRule) {
      throw new ApplicationError(
        `No transition rule for intent "${parsed.intent}" in node "${node.id}"`,
        { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
      );
    }

    const contextUpdates: Record<string, unknown> = {};

    let refinementReasoning: string | undefined;
    if (node.modificationIntents.includes(parsed.intent)) {
      const refinementAgent = await agentFactory.createForNode<Record<string, unknown>>(
        node.agentId,
        deps.agentVersion,
        node.refinementStateName
      );

      const refinementInput = this.buildRefinementInput(parsed, context, node);

      const originalContent = context.data[node.contentContextKey];

      const refinementAgentResult = yield* refinementAgent.generate(refinementInput, context);
      const refined = refinementAgentResult.result;
      refinementReasoning = refinementAgentResult.reasoning;

      let updatedContent = this.extractContent(refined, node.contentContextKey);

      if (updatedContent !== undefined) {
        if (
          updatedContent &&
          typeof updatedContent === 'object' &&
          !Array.isArray(updatedContent) &&
          originalContent &&
          typeof originalContent === 'object' &&
          !Array.isArray(originalContent)
        ) {
          const orig = originalContent as Record<string, unknown>;
          const updated = updatedContent as Record<string, unknown>;
          const origMeta = orig.metadata as Record<string, unknown> | undefined;
          const updatedMeta = updated.metadata as Record<string, unknown> | undefined;

          if (updatedMeta) {
            const origDraftId = origMeta?.draftId ?? orig.draftId;
            if (origDraftId !== undefined) updatedMeta.draftId = origDraftId;
            const origSource = origMeta?.source ?? orig.source;
            if (origSource !== undefined) updatedMeta.source = origSource;
            if (origMeta && 'sourceInterventionId' in origMeta) {
              updatedMeta.sourceInterventionId = origMeta.sourceInterventionId;
            } else if ('sourceInterventionId' in orig) {
              updatedMeta.sourceInterventionId = orig.sourceInterventionId;
            }
          }
        }
        if (node.diffTracking) {
          const oldContent = context.data[node.contentContextKey];
          if (oldContent != null) {
            const cleanOld = stripAnnotations(oldContent, node.diffTracking);
            updatedContent = computeDiff(cleanOld, updatedContent, node.diffTracking, deps.logger);
          }
        }

        contextUpdates[node.contentContextKey] = updatedContent;

        if (node.emitOnModify) {
          yield buildPipelineEventChunk(node.emitOnModify, updatedContent);
        }
      }
    } else {
      if (node.diffTracking && !node.modificationIntents.includes(parsed.intent)) {
        const current = context.data[node.contentContextKey];
        if (current != null) {
          contextUpdates[node.contentContextKey] = stripAnnotations(current, node.diffTracking);
        }
      }
    }

    const responseContext = {
      ...buildInterpolationContext(context),
      feedback: parsed.feedback,
      customInput: parsed.customInput,
      selectedItems: parsed.selectedItems,
      instructionsForNextStep: parsed.instructionsForNextStep,
    };

    const responseTemplate = node.responseTemplates[parsed.intent];
    if (!responseTemplate) {
      throw new ApplicationError(
        `[ReviewExecutor] No responseTemplate for intent "${parsed.intent}" in node "${node.id}".`,
        { code: 'NOT_FOUND', statusCode: 404, context: { nodeId: node.id } }
      );
    }
    const response = interpolate(responseTemplate, responseContext);

    const actionUpdates = applyActions(transitionRule.actions, responseContext, context.data, deps.loopDetector);
    Object.assign(contextUpdates, actionUpdates);

    const reasoningParts = [intentReasoning, refinementReasoning].filter(Boolean);
    if (reasoningParts.length > 0) {
      contextUpdates._reasoning = mergeNodeReasoning(context.data, node.id, reasoningParts.join('\n'));
    }

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

  private buildRefinementInput(
    parsed: IntentParsedResult,
    context: ConversationContext,
    node: ReviewNode
  ): string {
    const currentContent = context.data[node.contentContextKey];
    const interpolationContext: Record<string, unknown> = {
      ...buildInterpolationContext(context),
      intent: parsed.intent,
      feedback: parsed.feedback ?? '',
      customInput: parsed.customInput ?? '',
      itemsToRemove: parsed.itemsToRemove ?? [],
      selectedItems: parsed.selectedItems ?? [],
      [node.contentContextKey]: currentContent,
      currentContent,
    };
    return interpolate(node.refinementInputTemplate, interpolationContext);
  }

  private extractContent(
    refined: Record<string, unknown>,
    contentContextKey: string
  ): unknown {
    if (refined[contentContextKey] !== undefined) return refined[contentContextKey];
    if (Array.isArray(refined)) return refined;
    throw new ApplicationError(
      `Could not extract content for key "${contentContextKey}" from refinement result. ` +
      `Expected the result to contain a "${contentContextKey}" key or be an array. ` +
      `Available keys: [${Object.keys(refined).join(', ')}]`,
      { code: 'VALIDATION_ERROR', statusCode: 400 }
    );
  }
}
