import type { LLMProviderStrategy, Message, StreamChunk } from './llm/types.js';
import type { RetryResult } from './llm/retryHandler.js';
import { createStructuredLLMClient } from './llm/client.js';
import { injectSchema, hasSchemaPlaceholder } from './llm/schemaInjector.js';
import type {
  SemanticAgent,
  SemanticAgentConfig,
  SemanticAgentResult,
  ConversationContext,
  ConversationTurn,
  EngineStreamChunk,
} from './types.js';
import {
  buildThinkingChunk,
  buildThinkingDeltaChunk,
  buildThinkingDoneChunk,
  buildThoughtStartChunk,
  buildThoughtDoneChunk,
} from './chunkBuilders.js';
import { ThinkingParser } from './thinkingParser.js';
import { ApplicationError } from './errors.js';

const OUTPUT_FORMATTING_DIRECTIVES: Record<string, string> = {
  plain: 'Respond in plain text. No markdown, no formatting.',
  markdown:
    'Format your output using markdown. Use headers, lists, and emphasis where appropriate.',
};

const OUTPUT_DENSITY_DIRECTIVES: Record<string, string> = {
  compact: 'Be concise and direct. Minimize verbose explanations.',
  spacious: 'Provide detailed explanations with context and examples.',
};

const REASONING_FORMATTING_DIRECTIVES: Record<string, string> = {
  concise: '',
  structured:
    'Structure your reasoning step-by-step. Number each step. Show your work clearly.',
  thinking_markers: `Use thinking markers to structure your reasoning process. Output your reasoning using this exact format:

[Step Title]
thinking_end
[Detailed reasoning for this step]

[Next Step Title]
thinking_end
[Detailed reasoning for next step]

Rules:
- Each section starts with a short title (3-150 chars) on its own line
- Followed by "thinking_end" on the next line
- Then the detailed reasoning for that section
- Continue this pattern for each logical step
- Titles should be descriptive of what you're analyzing
- Do NOT use numbered lists as titles
- Keep titles concise but meaningful`,
};

export class SemanticAgentImpl<TOutput> implements SemanticAgent<TOutput> {
  private readonly processedSystemPrompt: string;
  private readonly client: ReturnType<typeof createStructuredLLMClient>;

  constructor(
    readonly config: SemanticAgentConfig<TOutput>,
    provider: LLMProviderStrategy,
  ) {
    let prompt = config.systemPrompt;

    const outputFormatDirective =
      OUTPUT_FORMATTING_DIRECTIVES[config.outputFormatting] ??
      OUTPUT_FORMATTING_DIRECTIVES['markdown'];
    const densityDirective =
      OUTPUT_DENSITY_DIRECTIVES[config.outputDensity] ??
      OUTPUT_DENSITY_DIRECTIVES['compact'];
    const reasoningDirective =
      REASONING_FORMATTING_DIRECTIVES[config.reasoningFormatting] ??
      REASONING_FORMATTING_DIRECTIVES['concise'];

    prompt = prompt
      .replace('{{outputBlock}}', `${outputFormatDirective}\n${densityDirective}`)
      .replace('{{outputBlockSchemaOnly}}', '')
      .replace('{{outputFormatting}}', outputFormatDirective)
      .replace('{{reasoningFormatting}}', reasoningDirective);

    if (reasoningDirective) {
      prompt += `\n\n${reasoningDirective}`;
    }

    if (config.thinkingGuidance) {
      prompt += `\n\n${config.thinkingGuidance}`;
    }

    prompt += `\n\n${outputFormatDirective}\n${densityDirective}`;

    if (hasSchemaPlaceholder(prompt)) {
      prompt = injectSchema(prompt, config.outputSchemaJson);
    }

    this.processedSystemPrompt = prompt;

    this.client = createStructuredLLMClient({
      provider,
      retry: {
        maxAttempts: config.maxRetries,
        minTimeout: 1000,
        maxTimeout: 30000,
      },
    });
  }

  async *generate(
    input: string,
    context: ConversationContext,
  ): AsyncGenerator<EngineStreamChunk, SemanticAgentResult<TOutput>> {
    let systemPrompt = this.processedSystemPrompt;
    systemPrompt = systemPrompt.replace(
      /\{\{context:(\w+)\}\}/g,
      (_, key: string) => {
        const val = context.data[key];
        if (val === undefined || val === null) return '';
        return typeof val === 'string' ? val : JSON.stringify(val);
      },
    );

    const engineData = context.data._engine as Record<string, unknown> | undefined;
    const temporal = engineData?.temporal as Record<string, unknown> | undefined;
    if (temporal?.dateFormatted) {
      systemPrompt += `\n\nCurrent date: ${temporal.dateFormatted}`;
    }

    const messages = this.buildMessages(
      context.conversationHistory,
      [{ role: 'user', content: input }],
    );

    const queue: EngineStreamChunk[] = [];
    let waiters: Array<(chunk: EngineStreamChunk | null) => void> = [];
    let done = false;
    let bgError: Error | null = null;

    function push(chunk: EngineStreamChunk): void {
      if (waiters.length > 0) {
        const waiter = waiters.shift()!;
        waiter(chunk);
      } else {
        queue.push(chunk);
      }
    }

    function waitForItem(): Promise<EngineStreamChunk | null> {
      if (queue.length > 0) return Promise.resolve(queue.shift()!);
      if (done) return Promise.resolve(null);
      return new Promise<EngineStreamChunk | null>((resolve) => {
        waiters.push(resolve);
      });
    }

    function signalDone(): void {
      done = true;
      for (const w of waiters) w(null);
      waiters = [];
    }

    let thinkingStarted = false;
    const state: { result: RetryResult<TOutput> | null } = { result: null };

    const useMarkers = this.config.reasoningFormatting === 'thinking_markers';
    const parser = useMarkers
      ? new ThinkingParser(
          async (title) => {
            if (!thinkingStarted) {
              push(buildThinkingChunk());
              thinkingStarted = true;
            }
            push(buildThoughtStartChunk(title));
          },
          async (description) => {
            push(buildThoughtDoneChunk(description));
          },
        )
      : null;

    const streamPromise = this.client
      .streamWithRetry<TOutput>(
        {
          schema: this.config.outputSchema,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          options: {
            temperature: this.config.temperature,
            maxTokens: this.config.maxOutputTokens ?? undefined,
            ...(this.config.modelAlias && {
              providerOptions: {
                litellm: { model: this.config.modelAlias },
              },
            }),
          },
          originalInput: input,
          enumFieldsToLowercase: ['intent', 'status'],
        },
        async (chunk: StreamChunk) => {
          if (chunk.type === 'reasoning-delta') {
            if (parser) {
              await parser.feed(chunk.delta);
            } else {
              if (!thinkingStarted) {
                push(buildThinkingChunk());
                thinkingStarted = true;
              }
              push(buildThinkingDeltaChunk(chunk.delta));
            }
          }
        },
      )
      .then(async (r) => {
        if (parser) await parser.finish();
        if (thinkingStarted) push(buildThinkingDoneChunk());
        state.result = r;
        signalDone();
      })
      .catch(async (err) => {
        if (parser) await parser.finish().catch(() => {});
        if (thinkingStarted) push(buildThinkingDoneChunk());
        bgError = err instanceof Error ? err : new Error(String(err));
        signalDone();
      });

    while (true) {
      const chunk = await waitForItem();
      if (chunk === null) break;
      yield chunk;
    }

    await streamPromise;

    if (bgError) throw bgError;

    const result = state.result;
    if (!result || !result.success || result.data === undefined) {
      throw new ApplicationError(
        `[SemanticAgent] LLM call failed after ${result?.attempts ?? 0} attempts: ${result?.error?.message ?? 'unknown error'}`,
        {
          code: 'AGENT_ERROR',
          context: {
            agentConfigId: this.config.id,
            attempts: result?.attempts,
          },
          cause: result?.error,
        },
      );
    }

    return {
      result: result.data,
      reasoning: result.reasoning ?? '',
    };
  }

  private buildMessages(
    history: ConversationTurn[],
    current: Array<{ role: string; content: string }>,
  ): Message[] {
    const messages: Message[] = [];

    for (const turn of history) {
      const content = turn.content.startsWith('__screen__:')
        ? turn.content.slice('__screen__:'.length)
        : turn.content;
      messages.push({
        role: turn.role as 'user' | 'assistant' | 'system',
        content,
        ...(turn.reasoning_content && { reasoning: turn.reasoning_content }),
      });
    }

    for (const msg of current) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      });
    }

    return messages;
  }
}
