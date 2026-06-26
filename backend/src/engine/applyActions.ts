import type { TransitionAction, ConversationContext, IterationConfig, LoopDetector } from './types.js';
import type { FastifyBaseLogger } from 'fastify';
import { interpolate } from './interpolate.js';
import Ajv, { type ErrorObject } from 'ajv';
import { ApplicationError } from './errors.js';

const ajv = new Ajv({ allErrors: true });

export function buildInterpolationContext(
  context: ConversationContext
): Record<string, unknown> {
  return {
    ...context.data,
    userProfile: context.userProfile,
    userId: context.userId,
    sessionId: context.sessionId,
    conversationHistory: context.conversationHistory,
  };
}

export function applyActions(
  actions: TransitionAction[],
  flatContext: Record<string, unknown>,
  contextData: Record<string, unknown>,
  loopDetector: LoopDetector
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const action of actions) {
    if (action.type === 'set_context') {
      updates[action.key] = typeof action.value === 'string'
        ? interpolate(action.value, flatContext)
        : action.value;
    } else if (action.type === 'increment_context') {
      const increment = Number(action.value);
      if (Number.isNaN(increment)) {
        throw new ApplicationError(
          `[applyActions] increment_context action for key "${action.key}" has non-numeric value: "${action.value}"`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { key: action.key, value: action.value } }
        );
      }
      const rawCurrent = contextData[action.key];
      let current: number;
      if (rawCurrent === undefined || rawCurrent === null) {
        current = 0;
      } else {
        current = Number(rawCurrent);
        if (Number.isNaN(current)) {
          throw new ApplicationError(
            `[applyActions] increment_context: existing context value for "${action.key}" is not numeric: "${rawCurrent}"`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { key: action.key, currentValue: rawCurrent } }
          );
        }
      }
      updates[action.key] = current + increment;
      loopDetector.recordProgress();
    }
  }
  return updates;
}

export function extractPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new ApplicationError(
        `[setPath] Cannot navigate path "${path}": segment "${parts[i]}" ` +
        `is ${current === null ? 'null' : typeof current}, expected object`,
        { code: 'VALIDATION_ERROR', statusCode: 400, context: { path, segment: parts[i] } }
      );
    }
    current = (current as Record<string, unknown>)[parts[i]];
  }
  if (current === null || current === undefined || typeof current !== 'object') {
    throw new ApplicationError(
      `[setPath] Cannot set path "${path}": parent is ${current === null ? 'null' : typeof current}`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { path } }
    );
  }
  (current as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

export async function executeWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
  options?: { retryDelayMs?: number; maxRetryPasses?: number; logger?: FastifyBaseLogger }
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: (R | undefined)[] = new Array(items.length);
  const failedIndices: number[] = [];
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      try {
        results[index] = await fn(items[index], index);
      } catch {
        failedIndices.push(index);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  const retryDelayMs = options?.retryDelayMs ?? 0;
  const maxRetryPasses = options?.maxRetryPasses ?? 5;
  let stillFailed = failedIndices;

  for (let pass = 1; pass <= maxRetryPasses && stillFailed.length > 0; pass++) {
    if (retryDelayMs > 0) {
      const delay = retryDelayMs * pass;
      options?.logger?.info(
        { pass, delayMs: delay, failedCount: stillFailed.length },
        '[executeWithConcurrency] Waiting before retry pass'
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const nextFailed: number[] = [];
    for (const index of stillFailed) {
      try {
        results[index] = await fn(items[index], index);
      } catch {
        nextFailed.push(index);
      }
    }
    stillFailed = nextFailed;
  }

  if (stillFailed.length > 0 && options?.logger) {
    for (const index of stillFailed) {
      options.logger.error(
        { index, item: items[index] },
        '[executeWithConcurrency] Item permanently failed after all retries'
      );
    }
  }

  return results as R[];
}

export function prepareIteration(
  iteration: IterationConfig,
  contextData: Record<string, unknown>,
  logger?: FastifyBaseLogger
): { items: unknown[]; parallelArrays: Record<string, unknown[]> } {
  const primaryRaw = contextData[iteration.arrayKey];
  if (!Array.isArray(primaryRaw)) {
    throw new ApplicationError(
      `[Iteration] arrayKey "${iteration.arrayKey}" does not contain an array in context.data. ` +
      `Got: ${primaryRaw === undefined ? 'undefined' : typeof primaryRaw}`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { arrayKey: iteration.arrayKey } }
    );
  }

  let items: unknown[] = [...primaryRaw];
  const parallelArrays: Record<string, unknown[]> = {};

  if (iteration.parallelKeys) {
    for (const [varName, ctxKey] of Object.entries(iteration.parallelKeys)) {
      const arr = contextData[ctxKey];
      if (!Array.isArray(arr)) {
        throw new ApplicationError(
          `[Iteration] parallelKeys "${varName}" → "${ctxKey}" does not contain an array. ` +
          `Got: ${arr === undefined ? 'undefined' : typeof arr}`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { varName, contextKey: ctxKey } }
        );
      }
      if (arr.length !== items.length) {
        throw new ApplicationError(
          `[Iteration] parallelKeys "${varName}" → "${ctxKey}" has length ${arr.length}, ` +
          `but primary array "${iteration.arrayKey}" has length ${items.length}. Lengths must match.`,
          { code: 'VALIDATION_ERROR', statusCode: 400, context: { varName, contextKey: ctxKey, parallelLength: arr.length, primaryLength: items.length } }
        );
      }
      parallelArrays[ctxKey] = [...arr];
    }
  }

  if (iteration.skipNulls) {
    const keepIndices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i] !== null && items[i] !== undefined) keepIndices.push(i);
    }
    const filtered = items.length - keepIndices.length;
    if (filtered > 0) {
      logger?.info({ filtered, total: items.length, arrayKey: iteration.arrayKey }, '[Iteration] skipNulls: filtered null items');
      items = keepIndices.map((i) => items[i]);
      for (const ctxKey of Object.keys(parallelArrays)) {
        const original = parallelArrays[ctxKey];
        parallelArrays[ctxKey] = keepIndices.map((i) => original[i]);
      }
      if (items.length === 0) {
        logger?.warn({ filtered, arrayKey: iteration.arrayKey }, '[Iteration] skipNulls: all items were null — iteration will produce empty array');
      }
    }
  }

  return { items, parallelArrays };
}

export function buildItemContext(
  baseContext: Record<string, unknown>,
  iteration: IterationConfig,
  item: unknown,
  index: number,
  parallelArrays: Record<string, unknown[]>
): Record<string, unknown> {
  return {
    ...baseContext,
    [iteration.itemKey]: item,
    _index: index,
    ...Object.fromEntries(
      Object.entries(iteration.parallelKeys ?? {}).map(([varName, ctxKey]) => {
        if (index >= parallelArrays[ctxKey].length) {
          throw new ApplicationError(
            `[buildItemContext] Index ${index} out of bounds for parallelKey "${ctxKey}" (length: ${parallelArrays[ctxKey].length})`,
            { code: 'VALIDATION_ERROR', statusCode: 400, context: { index, contextKey: ctxKey, arrayLength: parallelArrays[ctxKey].length } }
          );
        }
        return [varName, parallelArrays[ctxKey][index]];
      })
    ),
  };
}

export function extractItemResult(
  result: unknown,
  itemResultKey: string | undefined,
  nodeId: string,
  index: number
): unknown {
  if (!itemResultKey) return result;
  if (
    result === null ||
    typeof result !== 'object' ||
    !(itemResultKey in result)
  ) {
    throw new ApplicationError(
      `[Iteration] Node "${nodeId}" item ${index}: itemResultKey "${itemResultKey}" ` +
      `not found in result. Got keys: ${result ? Object.keys(result as Record<string, unknown>).join(', ') : 'null'}`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { nodeId, index, itemResultKey } }
    );
  }
  return (result as Record<string, unknown>)[itemResultKey];
}

export function mergeNodeReasoning(
  contextData: Record<string, unknown>,
  nodeId: string,
  reasoning: string
): Record<string, string> {
  return {
    ...(contextData._reasoning as Record<string, string> | undefined),
    [nodeId]: reasoning,
  };
}

export function validateOutputSchema(
  data: unknown,
  jsonSchema: Record<string, unknown>,
  label: string
): string | null {
  const validate = ajv.compile(jsonSchema);
  const valid = validate(data);
  if (valid) return null;

  const errors = validate.errors ?? [];
  const issues = errors.map((e: ErrorObject) => {
    const path = e.instancePath || '/';
    return `${path}: ${e.message}${e.params ? ` (${JSON.stringify(e.params)})` : ''}`;
  });
  return `[${label}] Output schema validation failed:\n${issues.join('\n')}`;
}
