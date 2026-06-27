import type {
  ComputeNode,
  ConversationContext,
  ExecutorDependencies,
  ComputeResult,
  IComputeExecutor,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';

export class ComputeExecutorImpl implements IComputeExecutor {
  async *execute(
    node: ComputeNode,
    context: ConversationContext,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, ComputeResult> {
    const inputs: Record<string, unknown> = {};
    for (const key of node.inputContextKeys) {
      inputs[key] = context.data[key];
    }

    if (!node.computeScript) {
      throw new ApplicationError(
        `[ComputeExecutor] node="${node.id}": computeScript is not set`,
        { code: 'AGENT_ERROR', context: { nodeId: node.id } }
      );
    }

    const fn = new Function(
      ...node.inputContextKeys,
      '_engine',
      node.computeScript
    );
    const engineState = context.data._engine;
    const result = fn(...node.inputContextKeys.map((k) => inputs[k]), engineState);

    return {
      event: { type: 'TRANSITION', target: node.targetNodeId },
      contextUpdates: { [node.outputContextKey]: result },
    };
  }
}
