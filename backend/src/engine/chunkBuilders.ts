import type { EngineStreamChunk, EngineStreamExtensions } from './stream.js';
import type { OptionsConfig } from './types.js';

const ENGINE_ID = 'engine';

function makeChunk(
  content: string,
  finishReason: null | 'stop',
  extensions?: EngineStreamExtensions
): EngineStreamChunk {
  return {
    id: `eng-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: ENGINE_ID,
    choices: [{
      index: 0,
      delta: { content: content || undefined },
      finish_reason: finishReason,
      logprobs: null,
    }],
    ...(extensions && {
      custom: {
        agentId: ENGINE_ID,
        extensions,
      },
    }),
  };
}

/** Thinking start indicator */
export function buildThinkingChunk(message: string = 'Thinking...'): EngineStreamChunk {
  return makeChunk(message, null, { type: 'thinking' });
}

/** Incremental thinking text delta */
export function buildThinkingDeltaChunk(delta: string): EngineStreamChunk {
  return makeChunk(delta, null, { type: 'thinking' });
}

/** Structured thought start */
export function buildThoughtStartChunk(title: string): EngineStreamChunk {
  return makeChunk('', null, { type: 'thought-start', title });
}

/** Structured thought done */
export function buildThoughtDoneChunk(description: string): EngineStreamChunk {
  return makeChunk('', null, { type: 'thought-done', description });
}

/** Closes the thinking section */
export function buildThinkingDoneChunk(): EngineStreamChunk {
  return makeChunk('', null, { type: 'thinking-done' });
}

/** Text content chunk */
export function buildTextChunk(content: string): EngineStreamChunk {
  return makeChunk(content, null);
}

/** Node title event */
export function buildNodeTitleChunk(
  nodeId: string,
  title: string,
  phase: string,
  description?: string
): EngineStreamChunk {
  return makeChunk('', null, { type: 'node-title', nodeId, title, phase, description });
}

/** Phase start event */
export function buildPhaseStartChunk(
  phase: string,
  name: string,
  totalSteps?: number
): EngineStreamChunk {
  return makeChunk('', null, { type: 'phase-start', phase, title: name, totalSteps });
}

/** Options selection UI event */
export function buildOptionsChunk(
  nodeId: string,
  phase: string,
  optionsConfig: OptionsConfig
): EngineStreamChunk {
  return makeChunk('', null, {
    type: 'options',
    nodeId,
    phase,
    items: optionsConfig.items.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      description: item.description,
      _changeStatus: item._changeStatus,
      intent: item.intent,
      disabled: item.disabled,
    })),
    optionsType: optionsConfig.type,
    minSelections: optionsConfig.minSelections,
    maxSelections: optionsConfig.maxSelections,
    allowCustomInput: optionsConfig.customInput.enabled,
    customInputLabel: optionsConfig.customInput.label,
    customInputPlaceholder: optionsConfig.customInput.placeholder,
    customInputFirst: optionsConfig.customInput.inputFirst ?? false,
    defaultSelectAll: optionsConfig.defaultSelectAll,
  });
}

/** Context update (structured data card) */
export function buildContextUpdateChunk(
  cardType: string,
  data: Record<string, unknown>
): EngineStreamChunk {
  return makeChunk('', null, { type: 'context-update', cardType, data });
}

/** Pipeline event (config-driven domain event) */
export function buildPipelineEventChunk(eventName: string, data: unknown): EngineStreamChunk {
  return makeChunk('', null, { type: 'pipeline-event', eventName, data: data as Record<string, unknown> });
}

/** Turn complete (final chunk from processMessage) */
export function buildTurnCompleteChunk(
  isComplete: boolean,
  currentNodeId: string,
  contextData?: Record<string, unknown>
): EngineStreamChunk {
  return makeChunk('', 'stop', {
    type: 'turn-complete',
    isComplete,
    currentNodeId,
    contextData,
  });
}

/** Semantic agent result */
export function buildSemanticAgentResultChunk(
  result: unknown,
  stateName: string
): EngineStreamChunk {
  return makeChunk('', 'stop', {
    type: 'semantic-agent-result',
    result,
    stateName,
  });
}

/** Screen content chunk (auto-advance node with "Dalje" button) */
export function buildScreenChunk(content: string): EngineStreamChunk {
  return makeChunk('', null, { type: 'screen', content });
}

/** WebView content chunk */
export function buildWebViewChunk(
  nodeId: string,
  html: string,
  css?: string,
  js?: string
): EngineStreamChunk {
  return makeChunk('', null, {
    type: 'webview',
    nodeId,
    html,
    css,
    js,
  });
}
