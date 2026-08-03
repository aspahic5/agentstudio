import type {
  InputNode,
  ConversationContext,
  ExecutorDependencies,
  PresentationResult,
  RoutingResult,
  EngineStreamChunk,
} from '../types.js';
import { buildTextChunk, buildOptionsChunk } from '../chunkBuilders.js';

export class InputExecutorImpl {
  async *executeEntry(
    node: InputNode,
    _context: ConversationContext,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult> {
    if (node.prompt) yield buildTextChunk(node.prompt);
    yield buildOptionsChunk(node.id, node.phaseLabel, {
      type: 'single_select',
      items: node.options.map((o) => ({ id: o.id, label: o.label, value: o.value })),
      customInput: { enabled: false, label: '', placeholder: '' },
      minSelections: 1,
      maxSelections: 1,
    });
    // Pause and wait for user to pick an option
    return { response: '' };
  }

  async *executeInput(
    node: InputNode,
    _context: ConversationContext,
    userMessage: string,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, RoutingResult> {
    const matched = node.options.find(
      (o) => o.value === userMessage || o.label === userMessage
    ) ?? node.options[0];

    const contextUpdates: Record<string, unknown> | undefined = node.outputContextKey
      ? { [node.outputContextKey]: matched?.value ?? userMessage }
      : undefined;

    return {
      event: { type: 'TRANSITION', target: matched.targetNodeId },
      routingDecision: { type: 'node', nodeId: matched.targetNodeId },
      contextUpdates,
    };
  }
}
