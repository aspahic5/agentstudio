import type {
  RoutingNode,
  ConversationContext,
  ExecutorDependencies,
  RoutingResult,
  RoutingTarget,
  IRoutingExecutor,
  EngineStreamChunk,
} from '../types.js';
import { interpolate } from '../interpolate.js';
import {
  buildInterpolationContext,
  applyActions,
  extractPath,
} from '../applyActions.js';
import { buildTextChunk, buildPipelineEventChunk } from '../chunkBuilders.js';

function evaluateCondition(condition: string, flatContext: Record<string, unknown>): boolean {
  const result = interpolate(condition, flatContext);
  const trimmed = result.trim();
  return trimmed !== '' && trimmed !== 'false' && trimmed !== '0' && trimmed !== 'undefined';
}

export class RoutingExecutorImpl implements IRoutingExecutor {
  async *evaluate(
    node: RoutingNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, RoutingResult> {
    const flatContext = buildInterpolationContext(context);

    let target: RoutingTarget = node.defaultTarget;
    let matchedRule: (typeof node.rules)[0] | null = null;

    for (const rule of node.rules) {
      if (evaluateCondition(rule.condition, flatContext)) {
        target = rule.target;
        matchedRule = rule;
        break;
      }
    }

    let contextUpdates: Record<string, unknown> | undefined;
    const actionsToApply = matchedRule ? (matchedRule.actions ?? []) : (node.defaultActions ?? []);
    if (actionsToApply.length > 0) {
      contextUpdates = applyActions(actionsToApply, flatContext, context.data, deps.loopDetector);
    }

    const ruleContextMapping = matchedRule?.contextMapping ?? node.contextMapping;
    if (ruleContextMapping && ruleContextMapping.length > 0) {
      if (!contextUpdates) contextUpdates = {};
      for (const mapping of ruleContextMapping) {
        const value = extractPath(context.data, mapping.sourceKey);
        if (value !== undefined) contextUpdates[mapping.targetKey] = value;
      }
    }

    const interpolatedMessage = node.message ? interpolate(node.message, flatContext) : undefined;

    if (node.emitContextKey && node.emitType) {
      const dataToEmit = context.data[node.emitContextKey];
      if (dataToEmit) yield buildPipelineEventChunk(node.emitType, dataToEmit);
    }

    if (target.type === 'complete' && deps.onAgentComplete) {
      yield* deps.onAgentComplete(context.data);
    }

    const waitedFlagKey = `_waitedAt_${node.id}`;
    const isSecondEntry = node.waitForContinue && !!context.data[waitedFlagKey];
    if (interpolatedMessage && !isSecondEntry) yield buildTextChunk(interpolatedMessage);

    if (node.waitForContinue && !context.data[waitedFlagKey]) {
      if (deps.onAgentComplete && target.type !== 'complete') {
        yield* deps.onAgentComplete(context.data);
      }
      contextUpdates = { ...context.data, ...(contextUpdates ?? {}), [waitedFlagKey]: true };
      return {
        response: interpolatedMessage,
        routingDecision: { type: 'node', nodeId: node.id },
        contextUpdates,
        _waiting: true,
      } as unknown as RoutingResult;
    }

    switch (target.type) {
      case 'complete':
        return {
          response: interpolatedMessage,
          event: { type: 'COMPLETE' },
          routingDecision: target,
          contextUpdates: {
            ...(interpolatedMessage ? { _completionMessage: interpolatedMessage } : {}),
            _completionNodeId: node.id,
            _completionNodeName: node.name,
            _completionNodePhase: node.phaseLabel ?? '',
            _completionNodeDescription: node.description ?? '',
          },
        };

      case 'node':
        return {
          response: interpolatedMessage,
          event: { type: 'TRANSITION', target: target.nodeId },
          routingDecision: target,
          contextUpdates,
        };

      case 'agent':
        return {
          response: interpolatedMessage,
          event: { type: 'COMPLETE' },
          routingDecision: target,
          contextMapping: matchedRule?.contextMapping ?? node.contextMapping,
        };
    }
  }
}
