/**
 * Self-contained OpenAI-compatible stream chunk types for the engine.
 *
 * Replaces @egs/client-core's OpenAIStreamChunk. No dependency on the `openai`
 * npm package — only the subset of fields the engine actually uses.
 */

// ============================================================================
// OpenAI-compatible chunk (subset used by the engine)
// ============================================================================

export interface EngineStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string; role?: string };
    finish_reason: string | null;
    logprobs: null;
  }>;
  custom?: {
    agentId: string;
    extensions?: EngineStreamExtensions;
  };
}

// ============================================================================
// Engine stream extensions (replaces CEStreamExtensions)
// ============================================================================

export interface EngineStreamExtensions {
  type:
    | 'thinking'
    | 'thinking-done'
    | 'thought-start'
    | 'thought-done'
    | 'node-title'
    | 'phase-start'
    | 'options'
    | 'context-update'
    | 'pipeline-event'
    | 'turn-complete'
    | 'semantic-agent-result'
    | 'webview'
    | 'screen';

  nodeId?: string;

  // type: 'node-title' | 'thought-start' | 'phase-start'
  title?: string;
  description?: string;
  phase?: string;

  // type: 'options'
  items?: WireOptionItem[];
  minSelections?: number;
  maxSelections?: number;
  allowCustomInput?: boolean;
  customInputLabel?: string;
  customInputPlaceholder?: string;
  customInputFirst?: boolean;
  defaultSelectAll?: boolean;
  optionsType?: 'single_select' | 'multi_select';

  // type: 'pipeline-event'
  eventName?: string;

  // type: 'context-update'
  data?: Record<string, unknown>;
  cardType?: string;

  // type: 'turn-complete'
  isComplete?: boolean;
  currentNodeId?: string;
  contextData?: Record<string, unknown>;

  // type: 'semantic-agent-result'
  result?: unknown;
  stateName?: string;

  // type: 'screen'
  content?: string;

  // type: 'webview'
  html?: string;
  css?: string;
  js?: string;

  // type: 'phase-start'
  totalSteps?: number;
}

/** Shape of a single option item on the wire. */
export interface WireOptionItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  _changeStatus?: string;
  intent?: string;
  disabled?: string;
}
