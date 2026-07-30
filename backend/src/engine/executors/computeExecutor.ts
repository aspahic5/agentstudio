import type {
  ComputeNode,
  ConversationContext,
  ExecutorDependencies,
  ComputeResult,
  IComputeExecutor,
  EngineStreamChunk,
} from '../types.js';
import { ApplicationError } from '../errors.js';

// Allowlist of pure expression operators and built-ins that cannot reach the
// host environment. Any attempt to access global state, require modules, spawn
// processes, or reference Function/eval is rejected before execution.
const FORBIDDEN_PATTERNS = [
  /\bprocess\b/,
  /\brequire\b/,
  /\bimport\b/,
  /\beval\b/,
  /\bFunction\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\b__proto__\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
  /\bObject\s*\.\s*assign\b/,
  /\bObject\s*\.\s*defineProperty\b/,
  /\bObject\s*\.\s*setPrototypeOf\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
];

function assertSafeScript(script: string, nodeId: string): void {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(script)) {
      throw new ApplicationError(
        `[ComputeExecutor] node="${nodeId}": computeScript contains forbidden identifier matching ${pattern}. ` +
        `Compute scripts must be pure data-transformation expressions with no access to I/O, modules, or host globals.`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId } }
      );
    }
  }
}

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

    assertSafeScript(node.computeScript, node.id);

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
