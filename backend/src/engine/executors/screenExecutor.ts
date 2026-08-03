import type {
  ScreenNode,
  ConversationContext,
  ExecutorDependencies,
  PresentationResult,
  RoutingResult,
  EngineStreamChunk,
} from '../types.js';
import { buildScreenChunk } from '../chunkBuilders.js';

export class ScreenExecutorImpl {
  // Called on entry — emit content and pause waiting for any user message
  async *execute(
    node: ScreenNode,
    _context: ConversationContext,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, PresentationResult> {
    yield buildScreenChunk(node.content);
    // Store content in conversationHistory so it survives reload.
    // The '\x00screen:' prefix lets the history endpoint distinguish screens from text.
    return { response: `__screen__:${node.content}` };
  }

  // Called when user sends any message (e.g. "Continue") — transition to next node
  async *advance(
    node: ScreenNode,
    _context: ConversationContext,
    _deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, RoutingResult> {
    return {
      event: { type: 'TRANSITION', target: node.targetNodeId || '__complete' },
      routingDecision: { type: 'node', nodeId: node.targetNodeId || '__complete' },
    };
  }
}
