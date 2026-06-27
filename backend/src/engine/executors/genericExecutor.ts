import type {
  AgentNode,
  ConversationContext,
  ExecutorDependencies,
  PresentationResult,
  IntentResult,
  GenerationResult,
  RoutingResult,
  ToolResult,
  AgenticResult,
  ComputeResult,
  ConversationResult,
  EngineStreamChunk,
  RoutingTarget,
  ContextMapping,
} from '../types.js';
import { IntentParsingExecutorImpl } from './intentParsingExecutor.js';
import { GenerationExecutorImpl } from './generationExecutor.js';
import { RoutingExecutorImpl } from './routingExecutor.js';
import { ReviewExecutorImpl } from './reviewExecutor.js';
import { ToolExecutorImpl } from './toolExecutor.js';
import { AgenticExecutorImpl } from './agenticExecutor.js';
import { ComputeExecutorImpl } from './computeExecutor.js';
import { ConversationExecutorImpl } from './conversationExecutor.js';
import { ApplicationError } from '../errors.js';

export type EntryResult =
  | PresentationResult
  | GenerationResult
  | RoutingResult
  | ToolResult
  | AgenticResult
  | ComputeResult
  | ConversationResult;

export type InputResult = IntentResult | ConversationResult;

export class GenericExecutor {
  private readonly intentParsing = new IntentParsingExecutorImpl();
  private readonly generation = new GenerationExecutorImpl();
  private readonly routing = new RoutingExecutorImpl();
  private readonly review = new ReviewExecutorImpl();
  private readonly tool = new ToolExecutorImpl();
  private readonly agentic = new AgenticExecutorImpl();
  private readonly compute = new ComputeExecutorImpl();
  private readonly conversation = new ConversationExecutorImpl();

  async *executeEntry(
    node: AgentNode,
    context: ConversationContext,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, EntryResult> {
    switch (node.nodeType) {
      case 'intent_parsing':
        return yield* this.intentParsing.presentOptions(node, context, deps);
      case 'review':
        return yield* this.review.presentContent(node, context, deps);
      case 'generation':
        return yield* this.generation.generate(node, context, deps);
      case 'tool':
        return yield* this.tool.execute(node, context, {
          ...deps,
          toolDispatcher: deps.toolDispatcherStrict ?? deps.toolDispatcher,
        });
      case 'routing':
        return yield* this.routing.evaluate(node, context, deps);
      case 'agentic':
        return yield* this.agentic.execute(node, context, deps);
      case 'compute':
        return yield* this.compute.execute(node, context, deps);
      case 'conversation':
        return yield* this.conversation.executeEntry(node, context, deps);
    }
  }

  async *executeInput(
    node: AgentNode,
    context: ConversationContext,
    userMessage: string,
    deps: ExecutorDependencies
  ): AsyncGenerator<EngineStreamChunk, InputResult> {
    switch (node.nodeType) {
      case 'intent_parsing':
        return yield* this.intentParsing.parseIntent(node, context, userMessage, deps);
      case 'review':
        return yield* this.review.parseAndModify(node, context, userMessage, deps);
      case 'conversation':
        return yield* this.conversation.executeInput(node, context, userMessage, deps);
      default:
        throw new ApplicationError(
          `[GenericExecutor] executeInput called on node type "${node.nodeType}" which does not accept user input.`,
          { code: 'AGENT_ERROR', context: { nodeId: node.id } }
        );
    }
  }

  acceptsInput(node: AgentNode): boolean {
    return (
      node.nodeType === 'intent_parsing' ||
      node.nodeType === 'review' ||
      node.nodeType === 'conversation'
    );
  }

  isComplete(result: EntryResult): boolean {
    if ('type' in result) {
      const convResult = result as ConversationResult;
      return convResult.type === 'complete';
    }
    if ('event' in result && (result as { event: { type: string } }).event.type === 'COMPLETE') {
      return true;
    }
    return false;
  }

  getRoutingResult(result: EntryResult): RoutingResult | null {
    if ('routingDecision' in result) {
      return result as RoutingResult;
    }
    return null;
  }
}
