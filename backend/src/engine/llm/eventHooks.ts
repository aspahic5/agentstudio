import type { Message, GenerateOptions, TokenUsage } from './types.js';
import type { PipelineError } from './errors.js';

export type HookEvent =
  | 'completion:kwargs'
  | 'completion:response'
  | 'completion:error'
  | 'completion:last_attempt'
  | 'reasoning:delta'
  | 'reasoning:complete'
  | 'parse:error'
  | 'validation:success'
  | 'validation:error';

export interface HookPayloads {
  'completion:kwargs': {
    messages: Message[];
    options: GenerateOptions;
    attempt: number;
  };
  'completion:response': {
    content: string;
    reasoning: string;
    usage: TokenUsage;
    attempt: number;
  };
  'completion:error': {
    error: Error;
    attempt: number;
    willRetry: boolean;
  };
  'completion:last_attempt': {
    attempt: number;
    previousErrors: Error[];
  };
  'reasoning:delta': {
    delta: string;
    accumulated: string;
  };
  'reasoning:complete': {
    content: string;
  };
  'parse:error': {
    error: PipelineError;
    attempt: number;
  };
  'validation:success': {
    data: unknown;
  };
  'validation:error': {
    error: PipelineError;
    data: unknown;
  };
}

export type HookHandler<E extends HookEvent> = (payload: HookPayloads[E]) => void;

export type HookConfig = {
  [E in HookEvent]?: HookHandler<E>;
};

export class EventHooks {
  private handlers = new Map<string, Set<Function>>();

  constructor(config?: HookConfig) {
    if (config) {
      for (const [event, handler] of Object.entries(config)) {
        if (handler) {
          this.on(event as HookEvent, handler as HookHandler<HookEvent>);
        }
      }
    }
  }

  on<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<E extends HookEvent>(event: E, payload: HookPayloads[E]): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    for (const handler of eventHandlers) {
      try {
        handler(payload);
      } catch (e) {
        console.warn(`[EventHooks] Handler for "${event}" threw:`, e);
      }
    }
  }

  hasListeners(event: HookEvent): boolean {
    const eventHandlers = this.handlers.get(event);
    return eventHandlers !== undefined && eventHandlers.size > 0;
  }
}
