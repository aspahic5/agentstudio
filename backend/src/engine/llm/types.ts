export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  providerOptions?: Record<string, Record<string, unknown>>;
}

export type StreamChunk =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'finish'; finishReason: string; usage: TokenUsage };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  content: string;
  reasoning: string;
  finishReason: string;
  usage: TokenUsage;
}

export interface LLMProviderStrategy {
  readonly name: string;
  readonly supportsReasoningStream: boolean;
  stream(messages: Message[], options: GenerateOptions): AsyncGenerator<StreamChunk>;
  generate(messages: Message[], options: GenerateOptions): Promise<GenerateResult>;
}
