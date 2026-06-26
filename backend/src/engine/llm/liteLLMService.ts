import type { FastifyBaseLogger } from 'fastify';
import type {
  LLMProviderStrategy,
  Message,
  GenerateOptions,
  StreamChunk,
  GenerateResult,
  TokenUsage,
} from './types.js';

export interface LiteLLMConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  logger?: FastifyBaseLogger;
}

export class LiteLLMService implements LLMProviderStrategy {
  readonly name = 'litellm';
  readonly supportsReasoningStream = true;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly logger?: FastifyBaseLogger;

  constructor(config: LiteLLMConfig) {
    if (!config.baseUrl) throw new Error('[LiteLLMService] config.baseUrl is required');
    if (!config.model) throw new Error('[LiteLLMService] config.model is required');
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 120000;
    this.logger = config.logger;
  }

  async *stream(messages: Message[], options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const model =
      (options.providerOptions?.['litellm']?.['model'] as string | undefined) ?? this.model;
    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (options.maxTokens !== undefined) body['max_tokens'] = options.maxTokens;
    if (options.temperature !== undefined) body['temperature'] = options.temperature;

    const url = `${this.baseUrl}/v1/chat/completions`;
    this.logger?.info(
      { url, model, messageCount: messages.length },
      '[LiteLLMService] Initiating LLM request',
    );

    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error({ message, url, model }, '[LiteLLMService] Fetch failed');
      throw new Error(`[LiteLLMService] Fetch failed: ${message} (URL: ${url})`);
    }

    if (!response.ok) {
      const error = await response.text();
      this.logger?.error({ status: response.status, error }, '[LiteLLMService] API error');
      throw new Error(`[LiteLLMService] API error ${response.status}: ${error}`);
    }

    if (!response.body) {
      throw new Error('[LiteLLMService] Response body is null');
    }

    let finishReason = 'unknown';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    const apiBase = response.headers.get('x-litellm-model-api-base') ?? '';
    let inThinking = apiBase.includes('cerebras');
    let nativeReasoning = false;
    let tagBuf = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          let chunk: Record<string, unknown>;
          try {
            chunk = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (chunk['usage']) {
            const u = chunk['usage'] as Record<string, number>;
            usage = {
              inputTokens: u['prompt_tokens'] ?? 0,
              outputTokens: u['completion_tokens'] ?? 0,
            };
          }

          const choices = chunk['choices'] as Array<Record<string, unknown>> | undefined;
          const choice = choices?.[0];
          if (!choice) continue;

          if (choice['finish_reason']) {
            finishReason = choice['finish_reason'] as string;
          }

          const delta = choice['delta'] as Record<string, string> | undefined;
          if (!delta) continue;

          const reasoningDelta = (delta['reasoning_content'] ?? delta['reasoning']) as
            | string
            | undefined;
          if (reasoningDelta) {
            if (!nativeReasoning) {
              nativeReasoning = true;
              inThinking = false;
            }
            yield { type: 'reasoning-delta', delta: reasoningDelta };
          }

          if (typeof delta['content'] === 'string' && delta['content']) {
            tagBuf += delta['content'];

            while (tagBuf.length > 0) {
              const tag = inThinking ? '</think>' : '<think>';
              const idx = tagBuf.indexOf(tag);

              if (idx === -1) {
                const holdBack = tag.length - 1;
                const safe = tagBuf.length > holdBack ? tagBuf.length - holdBack : 0;
                if (safe > 0) {
                  const text = tagBuf.slice(0, safe);
                  yield inThinking
                    ? { type: 'reasoning-delta', delta: text }
                    : { type: 'text-delta', delta: text };
                  tagBuf = tagBuf.slice(safe);
                }
                break;
              }

              if (idx > 0) {
                const text = tagBuf.slice(0, idx);
                yield inThinking
                  ? { type: 'reasoning-delta', delta: text }
                  : { type: 'text-delta', delta: text };
              }
              inThinking = !inThinking;
              tagBuf = tagBuf.slice(idx + tag.length);
            }
          }
        }
      }

      while (tagBuf.length > 0) {
        const tag = inThinking ? '</think>' : '<think>';
        const idx = tagBuf.indexOf(tag);

        if (idx === -1) {
          yield inThinking
            ? { type: 'reasoning-delta', delta: tagBuf }
            : { type: 'text-delta', delta: tagBuf };
          break;
        }

        if (idx > 0) {
          const text = tagBuf.slice(0, idx);
          yield inThinking
            ? { type: 'reasoning-delta', delta: text }
            : { type: 'text-delta', delta: text };
        }
        inThinking = !inThinking;
        tagBuf = tagBuf.slice(idx + tag.length);
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'finish', finishReason, usage };
  }

  async generate(messages: Message[], options: GenerateOptions): Promise<GenerateResult> {
    const model =
      (options.providerOptions?.['litellm']?.['model'] as string | undefined) ?? this.model;
    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(messages),
      stream: false,
    };
    if (options.maxTokens !== undefined) body['max_tokens'] = options.maxTokens;
    if (options.temperature !== undefined) body['temperature'] = options.temperature;

    const url = `${this.baseUrl}/v1/chat/completions`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[LiteLLMService] Fetch failed: ${message} (URL: ${url})`);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[LiteLLMService] API error ${response.status}: ${error}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];

    if (!choice) {
      throw new Error('[LiteLLMService] No choices in response');
    }

    const message = choice['message'] as Record<string, string> | undefined;
    const usageRaw = json['usage'] as Record<string, number> | undefined;

    return {
      content: message?.['content'] ?? '',
      reasoning: message?.['reasoning_content'] ?? message?.['reasoning'] ?? '',
      finishReason: (choice['finish_reason'] as string) ?? 'stop',
      usage: {
        inputTokens: usageRaw?.['prompt_tokens'] ?? 0,
        outputTokens: usageRaw?.['completion_tokens'] ?? 0,
      },
    };
  }

  private convertMessages(messages: Message[]): Array<Record<string, string>> {
    return messages.map((msg) => {
      const result: Record<string, string> = { role: msg.role, content: msg.content };
      return result;
    });
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
