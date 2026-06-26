import pRetry, { AbortError } from 'p-retry';
import type {
  LLMProviderStrategy,
  Message,
  GenerateOptions,
  GenerateResult,
} from './types.js';
import type { PipelineError } from './errors.js';
import type { EventHooks } from './eventHooks.js';

export interface RetryConfig {
  maxAttempts: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  randomize?: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  reasoning?: string;
  error?: Error;
  attempts: number;
}

export function generateFeedback(
  error: PipelineError,
  originalInput: string
): { assistant: string; user: string } {
  switch (error.errorType) {
    case 'extraction':
      return {
        assistant: '(Previous response was not valid JSON)',
        user: `Your response could not be parsed as JSON. Respond with ONLY a valid JSON object, no markdown or explanation.\n\nOriginal task: ${originalInput}`,
      };

    case 'parse':
      return {
        assistant: '(Previous response had malformed JSON)',
        user: `Your JSON was malformed: ${error.message}\n\nRespond with valid JSON.\n\nOriginal task: ${originalInput}`,
      };

    case 'validation':
      return {
        assistant: '(Previous response failed schema validation)',
        user: `Your response had wrong structure: ${error.message}\n\nIMPORTANT: Return actual DATA matching the schema, NOT the schema definition itself.\n\nOriginal task: ${originalInput}`,
      };
  }
}

export function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('408') ||
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('econnaborted') ||
    msg.includes('epipe') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('timeout') ||
    msg.includes('premature close') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('high traffic') ||
    msg.includes('rate limit')
  );
}

export function createRetryHandler<T>(config: {
  provider: LLMProviderStrategy;
  pipeline: (response: string | unknown) => T;
  retryConfig: RetryConfig;
  hooks: EventHooks;
}): {
  execute: (
    messages: Message[],
    options: GenerateOptions,
    originalInput: string
  ) => Promise<RetryResult<T>>;
} {
  const { provider, pipeline, retryConfig, hooks } = config;

  const minTimeout = retryConfig.minTimeout ?? 1000;
  const maxTimeout = retryConfig.maxTimeout ?? 30000;
  const factor = retryConfig.factor ?? 2;
  const randomize = retryConfig.randomize ?? true;

  return {
    async execute(messages, options, originalInput) {
      let currentMessages = [...messages];
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
              options,
              attempt: attemptNumber,
            });

            let response: GenerateResult;

            try {
              response = await provider.generate(currentMessages, options);
              lastReasoning = response.reasoning ?? '';

              hooks.emit('completion:response', {
                content: response.content,
                reasoning: response.reasoning ?? '',
                usage: response.usage,
                attempt: attemptNumber,
              });
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              previousErrors.push(err);
              lastError = err;

              const willRetry = attemptNumber < retryConfig.maxAttempts;
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
              const data = pipeline(response.content);
              hooks.emit('validation:success', { data });
              return data;
            } catch (error) {
              const parseError = error as PipelineError;
              lastError = parseError;
              previousErrors.push(parseError);
              hooks.emit('parse:error', { error: parseError, attempt: attemptNumber });

              const feedback = generateFeedback(parseError, originalInput);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: response.content },
                { role: 'user', content: feedback.user },
              ];

              throw error;
            }
          },
          {
            retries: retryConfig.maxAttempts - 1,
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
          error: lastError ?? new Error('Unknown error'),
          attempts: attemptCount,
        };
      }
    },
  };
}
