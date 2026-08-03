import type { ParsedStreamEvent } from '@/types/stream';

interface EngineChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  custom?: {
    agentId?: string;
    extensions?: Record<string, unknown>;
  };
}

function parseChunk(chunk: EngineChunk): ParsedStreamEvent | null {
  const ext = chunk.custom?.extensions;
  const content = chunk.choices?.[0]?.delta?.content ?? '';
  const finishReason = chunk.choices?.[0]?.finish_reason;

  // turn-complete MUST be checked before generic finish_reason
  if (ext?.type === 'turn-complete') {
    return {
      type: 'turn-complete',
      isComplete: (ext.isComplete as boolean) ?? false,
      currentNodeId: (ext.currentNodeId as string) ?? '',
      contextData: ext.contextData as Record<string, unknown> | undefined,
    };
  }

  if (finishReason === 'stop' || finishReason === 'stop_sequence') {
    return { type: 'done' };
  }

  if (ext?.type === 'thinking-done') {
    return { type: 'thinking-done' };
  }

  if (ext?.type === 'thinking' && content) {
    return { type: 'thinking-delta', delta: content };
  }

  if (ext?.type === 'thought-start') {
    return { type: 'thought-start', title: (ext.title as string) ?? '' };
  }

  if (ext?.type === 'thought-done') {
    return { type: 'thought-done', description: (ext.description as string) ?? '' };
  }

  if (ext?.type === 'node-title') {
    return {
      type: 'node-title',
      nodeId: (ext.nodeId as string) ?? '',
      title: (ext.title as string) ?? '',
      phase: (ext.phase as string) ?? '',
      ...(ext.description !== undefined && { description: ext.description as string }),
    };
  }

  if (ext?.type === 'phase-start') {
    return {
      type: 'phase-start',
      phase: (ext.phase as string) ?? '',
      name: (ext.title as string) ?? '',
      ...(ext.totalSteps !== undefined && { totalSteps: ext.totalSteps as number }),
    };
  }

  if (ext?.type === 'options') {
    return {
      type: 'options',
      nodeId: (ext.nodeId as string) ?? '',
      options: {
        type: (ext.optionsType as 'single_select' | 'multi_select') ?? 'single_select',
        items: (ext.items as Array<{ id: string; label: string; value: string; description?: string; _changeStatus?: string; intent?: string; disabled?: string }>) ?? [],
        minSelections: (ext.minSelections as number) ?? 1,
        maxSelections: (ext.maxSelections as number) ?? 1,
        allowCustomInput: (ext.allowCustomInput as boolean) ?? false,
        customInputLabel: ext.customInputLabel as string | undefined,
        customInputPlaceholder: ext.customInputPlaceholder as string | undefined,
        customInputFirst: ext.customInputFirst as boolean | undefined,
        defaultSelectAll: ext.defaultSelectAll as boolean | undefined,
      },
    };
  }

  if (ext?.type === 'context-update') {
    return {
      type: 'context-update',
      cardType: (ext.cardType as string) ?? 'unknown',
      data: (ext.data as Record<string, unknown>) ?? {},
    };
  }

  if (ext?.type === 'pipeline-event') {
    return {
      type: 'context-update',
      cardType: (ext.eventName as string) ?? 'pipeline-event',
      data: (ext.data as Record<string, unknown>) ?? {},
    };
  }

  if (ext?.type === 'webview') {
    return {
      type: 'webview',
      content: {
        nodeId: (ext.nodeId as string) ?? '',
        html: (ext.html as string) ?? '',
        css: ext.css as string | undefined,
        js: ext.js as string | undefined,
      },
    };
  }

  if (ext?.type === 'screen') {
    return {
      type: 'screen',
      content: (ext.content as string) ?? '',
    };
  }

  if (ext?.type === 'semantic-agent-result') {
    return {
      type: 'semantic-agent-result',
      result: ext.result,
      stateName: (ext.stateName as string) ?? '',
    };
  }

  // Regular text delta
  if (content) {
    return { type: 'text-delta', delta: content };
  }

  return null;
}

export async function* streamSSEEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedStreamEvent> {
  const reader = stream.getReader();
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
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data) as EngineChunk;
          const event = parseChunk(chunk);
          if (event) yield event;
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const chunk = JSON.parse(data) as EngineChunk;
          const event = parseChunk(chunk);
          if (event) yield event;
        } catch {
          // Skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
