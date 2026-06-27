import type { ContextWindowConfig, ContextWindowSummarizer } from './types.js';
import { ApplicationError } from './errors.js';

export interface WindowedHistory {
  olderTurnsSummary: string;
  appliedStrategy: 'none' | 'drop' | 'summarize' | 'key_points';
  recentTurns: Array<{ turn: number; userMessage: string; assistantMessage: string }>;
  pinnedContext: Array<{ key: string; value: unknown }>;
  olderTurnsCount: number;
}

type ResponseEntry = { turn: number; userMessage: string; assistantMessage: string };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function serializeTurn(r: ResponseEntry): string {
  return `[Turn ${r.turn}]\nUser: ${r.userMessage}\nAssistant: ${r.assistantMessage}`;
}

export function estimateHistoryTokens(responses: ResponseEntry[]): number {
  if (responses.length === 0) return 0;
  let totalChars = 0;
  for (const r of responses) {
    totalChars += serializeTurn(r).length;
    totalChars += 2;
  }
  return Math.ceil(totalChars / 4);
}

export async function applyContextWindow(
  responses: ResponseEntry[],
  config: ContextWindowConfig,
  contextData: Record<string, unknown>,
  summarizer?: ContextWindowSummarizer
): Promise<WindowedHistory> {
  const pinnedContext: Array<{ key: string; value: unknown }> = [];
  if (config.pinnedContextKeys) {
    for (const key of config.pinnedContextKeys) {
      const value = contextData[key];
      if (value !== undefined && value !== null) pinnedContext.push({ key, value });
    }
  }

  if (responses.length === 0) {
    return { olderTurnsSummary: '', appliedStrategy: 'none', recentTurns: [], pinnedContext, olderTurnsCount: 0 };
  }

  const totalTokens = estimateHistoryTokens(responses);
  if (totalTokens <= config.maxHistoryTokens) {
    return { olderTurnsSummary: '', appliedStrategy: 'none', recentTurns: responses, pinnedContext, olderTurnsCount: 0 };
  }

  const recentCount = Math.min(config.maxRecentTurns, responses.length);
  const recentTurns = responses.slice(-recentCount);
  const olderTurns = responses.slice(0, responses.length - recentCount);

  if (olderTurns.length === 0) {
    return { olderTurnsSummary: '', appliedStrategy: 'none', recentTurns, pinnedContext, olderTurnsCount: 0 };
  }

  let olderTurnsSummary = '';
  if (config.olderTurnStrategy === 'drop') {
    // No summary
  } else if (config.olderTurnStrategy === 'summarize' || config.olderTurnStrategy === 'key_points') {
    if (!summarizer) {
      throw new ApplicationError(
        `[contextWindow] olderTurnStrategy "${config.olderTurnStrategy}" requires a ` +
        `contextWindowSummarizer in ExecutorDependencies, but none was provided.`,
        { code: 'AGENT_ERROR', context: { olderTurnStrategy: config.olderTurnStrategy } }
      );
    }
    const olderText = olderTurns.map(serializeTurn).join('\n\n');
    olderTurnsSummary = await summarizer(olderText, config.olderTurnStrategy);
  }

  return {
    olderTurnsSummary,
    appliedStrategy: config.olderTurnStrategy,
    recentTurns,
    pinnedContext,
    olderTurnsCount: olderTurns.length,
  };
}
