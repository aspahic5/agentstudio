import pRetry, { AbortError } from 'p-retry';
import type {
  LLMProviderStrategy,
  Message,
  GenerateOptions,
  StreamChunk,
} from './types.js';
import type { ArrayNormalizer } from './steps.js';
import {
  EventHooks,
  type HookEvent,
  type HookHandler,
  type HookConfig,
} from './eventHooks.js';
import { createResponsePipeline } from './responsePipeline.js';
import {
  createRetryHandler,
  generateFeedback,
  isNetworkError,
  type RetryResult,
  type RetryConfig,
} from './retryHandler.js';
import type { PipelineError } from './errors.js';

export interface ClientConfig {
  provider: LLMProviderStrategy;
  retry: RetryConfig;
  hooks?: HookConfig;
}

export interface GenerateRequest<T> {
  schema: { parse(data: unknown): T };
  messages: Message[];
  options: GenerateOptions;
  originalInput: string;
  enumFieldsToLowercase?: string[];
  arrayFieldsToObjectify?: ArrayNormalizer[];
}

export type StreamChunkCallback = (chunk: StreamChunk) => Promise<void>;

export function createStructuredLLMClient(config: ClientConfig) {
  const hooks = new EventHooks(config.hooks);

  const minTimeout = config.retry.minTimeout ?? 1000;
  const maxTimeout = config.retry.maxTimeout ?? 30000;
  const factor = config.retry.factor ?? 2;
  const randomize = config.retry.randomize ?? true;

  return {
    on<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
      hooks.on(event, handler);
    },

    off<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
      hooks.off(event, handler);
    },

    async generate<T>(
      request: GenerateRequest<T>,
    ): Promise<RetryResult<T>> {
      const pipeline = createResponsePipeline({
        schema: request.schema,
        enumFieldsToLowercase: request.enumFieldsToLowercase,
        arrayFieldsToObjectify: request.arrayFieldsToObjectify,
      });

      const retryHandler = createRetryHandler({
        provider: config.provider,
        pipeline,
        retryConfig: config.retry,
        hooks,
      });

      return retryHandler.execute(request.messages, request.options, request.originalInput);
    },

    async streamWithRetry<T>(
      request: GenerateRequest<T>,
      onChunk: StreamChunkCallback,
    ): Promise<RetryResult<T>> {
      const pipeline = createResponsePipeline({
        schema: request.schema,
        enumFieldsToLowercase: request.enumFieldsToLowercase,
        arrayFieldsToObjectify: request.arrayFieldsToObjectify,
      });

      let currentMessages = [...request.messages];
      let lastError: Error | null = null;
      let lastReasoning = '';
      let attemptCount = 0;
      const previousErrors: Error[] = [];

      try {
        const data = await pRetry(
          async (attemptNumber) => {
            attemptCount = attemptNumber;

            hooks.emit('completion:kwargs', {
              messages: currentMessages,
              options: request.options,
              attempt: attemptNumber,
            });

            let content = '';
            let reasoning = '';

            try {
              for await (const chunk of config.provider.stream(currentMessages, request.options)) {
                await onChunk(chunk);

                if (chunk.type === 'reasoning-delta') {
                  reasoning += chunk.delta;
                  hooks.emit('reasoning:delta', {
                    delta: chunk.delta,
                    accumulated: reasoning,
                  });
                } else if (chunk.type === 'text-delta') {
                  content += chunk.delta;
                } else if (chunk.type === 'finish') {
                  hooks.emit('completion:response', {
                    content,
                    reasoning,
                    usage: chunk.usage,
                    attempt: attemptNumber,
                  });
                  hooks.emit('reasoning:complete', { content: reasoning });
                }
              }

              lastReasoning = reasoning;
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              previousErrors.push(err);
              lastError = err;

              const willRetry = attemptNumber < config.retry.maxAttempts;
              hooks.emit('completion:error', {
                error: err,
                attempt: attemptNumber,
                willRetry,
              });

              if (isNetworkError(err)) {
                throw err;
              }

              throw new AbortError(err.message);
            }

            try {
              const data = pipeline(content);
              hooks.emit('validation:success', { data });
              return data;
            } catch (error) {
              const parseError = error as PipelineError;
              lastError = parseError;
              previousErrors.push(parseError);
              hooks.emit('parse:error', { error: parseError, attempt: attemptNumber });

              const feedback = generateFeedback(parseError, request.originalInput);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content },
                { role: 'user', content: feedback.user },
              ];

              throw error;
            }
          },
          {
            retries: config.retry.maxAttempts - 1,
            minTimeout,
            maxTimeout,
            factor,
            randomize,
          },
        );

        return {
          success: true,
          data,
          reasoning: lastReasoning,
          attempts: attemptCount,
        };
      } catch {
        hooks.emit('completion:last_attempt', {
          attempt: attemptCount,
          previousErrors,
        });

        return {
          success: false,
          error: lastError ?? new Error('Unknown streaming error'),
          attempts: attemptCount,
        };
      }
    },
  };
}
