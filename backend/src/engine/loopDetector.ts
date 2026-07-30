import type { LoopDetector } from './types.js';
import type { FastifyBaseLogger } from 'fastify';
import { ApplicationError } from './errors.js';

export type JudgeGenerateFn = (
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  options: { temperature: number; maxTokens: number }
) => Promise<{ content: string }>;

export interface LoopDetectorConfig {
  maxNodeExecutions: number;
  identicalPromptThreshold: number;
  judgeActivationThreshold: number;
  minJudgeCheckInterval: number;
  maxJudgeCheckInterval: number;
  judgeConfidenceThreshold: number;
  judgeGenerateFn?: JudgeGenerateFn;
  judgeHistoryWindow: number;
  judgeTimeoutMs: number;
}

export const DEFAULT_LOOP_DETECTOR_CONFIG: LoopDetectorConfig = {
  // Hard cap: a single processMessage() call may not execute more than this
  // many nodes total. 0 disabled the cap; 200 is generous for any realistic
  // pipeline while bounding worst-case runaway execution.
  maxNodeExecutions: 200,
  identicalPromptThreshold: 2,
  judgeActivationThreshold: 20,
  minJudgeCheckInterval: 5,
  maxJudgeCheckInterval: 15,
  judgeConfidenceThreshold: 0.9,
  judgeHistoryWindow: 20,
  judgeTimeoutMs: 15_000,
};

const JUDGE_SYSTEM_PROMPT = `You are a workflow loop detector. You analyze node execution history to detect unproductive loops.

Each entry shows: node ID, node type, and which context keys were modified.

UNPRODUCTIVE PATTERNS (high confidence):
1. Same node sequence repeating with no new context changes
2. Nodes executing but context keys not changing (stagnation)
3. Context alternating between states without converging (oscillation)

PRODUCTIVE PATTERNS (low confidence):
1. Iteration with progress: accumulation arrays growing, index incrementing
2. Different context changes each cycle: different work being done
3. User interaction nodes (intent_parsing, review) appearing idle is normal

Respond with ONLY a JSON object:
{"analysis": "Brief description", "confidence": 0.0}

confidence: 0.0 (productive) to 1.0 (stuck in unproductive loop).`;

interface NodeExecutionRecord {
  nodeId: string;
  nodeType: string;
  changedKeys: string[];
}

interface JudgeVerdict {
  analysis: string;
  confidence: number;
}

export class LoopDetectorImpl implements LoopDetector {
  private readonly config: LoopDetectorConfig;
  private readonly logger?: FastifyBaseLogger;
  private executionCount = 0;
  private executionsSinceProgress = 0;
  private promptFingerprints = new Map<string, number>();
  private recentNodes: string[] = [];

  private executionHistory: NodeExecutionRecord[] = [];
  private lastJudgeCheckAt = 0;
  private currentJudgeInterval: number;

  constructor(config?: Partial<LoopDetectorConfig>, logger?: FastifyBaseLogger) {
    this.config = { ...DEFAULT_LOOP_DETECTOR_CONFIG, ...config };
    this.logger = logger;
    this.currentJudgeInterval = this.config.maxJudgeCheckInterval;

    if (this.config.judgeActivationThreshold > 0 && !this.config.judgeGenerateFn) {
      throw new Error(
        '[LoopDetector] judgeActivationThreshold > 0 requires a judgeGenerateFn. ' +
        'Either provide a judgeGenerateFn or set judgeActivationThreshold to 0 to disable Layer 3.'
      );
    }
  }

  recordProgress(): void {
    this.executionsSinceProgress = 0;
  }

  checkNodeEntry(nodeId: string): void {
    this.executionCount++;
    this.executionsSinceProgress++;
    this.recentNodes.push(nodeId);
    if (this.recentNodes.length > this.config.judgeHistoryWindow) {
      this.recentNodes = this.recentNodes.slice(-this.config.judgeHistoryWindow);
    }
    if (this.config.maxNodeExecutions > 0 && this.executionCount > this.config.maxNodeExecutions) {
      const recentPath = this.recentNodes.join(' → ');
      throw new ApplicationError(
        `[LoopDetector] Execution cap exceeded: ${this.executionCount} node executions ` +
        `in a single processMessage() call (limit: ${this.config.maxNodeExecutions}). ` +
        `Recent node path: ${recentPath}`,
        { code: 'AGENT_ERROR', context: { executionCount: this.executionCount, maxNodeExecutions: this.config.maxNodeExecutions, nodeId } }
      );
    }
  }

  checkPrompt(nodeId: string, interpolatedPrompt: string, iterationIndex?: number): void {
    if (this.config.identicalPromptThreshold <= 0) return;

    const key = iterationIndex !== undefined
      ? `${nodeId}[${iterationIndex}]`
      : nodeId;
    const fingerprint = `${key}::${fnv1aHash(interpolatedPrompt)}`;
    const count = (this.promptFingerprints.get(fingerprint) ?? 0) + 1;
    this.promptFingerprints.set(fingerprint, count);
    if (count >= this.config.identicalPromptThreshold) {
      const recentPath = this.recentNodes.join(' → ');
      throw new ApplicationError(
        `[LoopDetector] Identical prompt detected: node "${nodeId}" received the same ` +
        `interpolated prompt ${count} times. The pipeline is not making progress — ` +
        `check that loop counters (e.g., increment_context actions) are configured. ` +
        `Recent node path: ${recentPath}`,
        { code: 'AGENT_ERROR', context: { nodeId, identicalPromptCount: count } }
      );
    }
  }

  recordExecution(nodeId: string, nodeType: string, changedKeys: string[]): void {
    this.executionHistory.push({ nodeId, nodeType, changedKeys });
    if (this.executionHistory.length > this.config.judgeHistoryWindow) {
      this.executionHistory = this.executionHistory.slice(-this.config.judgeHistoryWindow);
    }
  }

  async checkWithJudge(): Promise<void> {
    if (this.config.judgeActivationThreshold <= 0) return;
    if (this.executionsSinceProgress < this.config.judgeActivationThreshold) return;
    if (this.executionCount - this.lastJudgeCheckAt < this.currentJudgeInterval) return;
    if (this.executionHistory.length < 5) return;

    this.lastJudgeCheckAt = this.executionCount;

    try {
      const messages = this.buildJudgeMessages();

      const result = await Promise.race([
        this.config.judgeGenerateFn!(messages, { temperature: 0, maxTokens: 500 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Judge timeout')), this.config.judgeTimeoutMs)
        ),
      ]);

      const parsed = this.parseJudgeResponse(result.content);

      this.logger?.info(
        { executionCount: this.executionCount, confidence: parsed.confidence, analysis: parsed.analysis },
        '[LoopDetector] Layer 3 judge check result'
      );

      if (parsed.confidence >= this.config.judgeConfidenceThreshold) {
        const recentPath = this.recentNodes.join(' → ');
        throw new ApplicationError(
          `[LoopDetector] LLM judge detected unproductive loop ` +
          `(confidence: ${parsed.confidence.toFixed(2)}): ${parsed.analysis}. ` +
          `Recent node path: ${recentPath}`,
          { code: 'AGENT_ERROR', context: { confidence: parsed.confidence, analysis: parsed.analysis } }
        );
      }

      this.currentJudgeInterval = Math.round(
        this.config.maxJudgeCheckInterval -
        (this.config.maxJudgeCheckInterval - this.config.minJudgeCheckInterval) * parsed.confidence
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[LoopDetector]')) {
        throw error;
      }
      this.logger?.warn({ err: error }, '[LoopDetector] Layer 3 judge check failed, continuing');
    }
  }

  private buildJudgeMessages(): Array<{ role: 'system' | 'user'; content: string }> {
    return [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: this.buildJudgeUserPrompt() },
    ];
  }

  private buildJudgeUserPrompt(): string {
    const lines = this.executionHistory.map((rec, i) => {
      const keys = rec.changedKeys.length > 0
        ? `[${rec.changedKeys.join(', ')}]`
        : '(none)';
      return `${i + 1}. ${rec.nodeId} (${rec.nodeType}) — changed: ${keys}`;
    });

    return (
      `Execution count: ${this.executionCount}\n\n` +
      `Recent node executions (last ${this.executionHistory.length}):\n` +
      lines.join('\n')
    );
  }

  private parseJudgeResponse(content: string): JudgeVerdict {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.confidence === 'number' && typeof parsed.analysis === 'string') {
        return { analysis: parsed.analysis, confidence: this.clampConfidence(parsed.confidence) };
      }
    } catch {
      // fall through
    }

    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (typeof parsed.confidence === 'number' && typeof parsed.analysis === 'string') {
          return { analysis: parsed.analysis, confidence: this.clampConfidence(parsed.confidence) };
        }
      } catch {
        // fall through
      }
    }

    this.logger?.warn({ responseSnippet: content.slice(0, 200) }, '[LoopDetector] Could not parse judge response');
    return { analysis: 'unparseable', confidence: 0 };
  }

  private clampConfidence(value: number): number {
    if (value < 0 || value > 1) {
      this.logger?.warn({ confidence: value }, '[LoopDetector] Judge returned confidence outside [0, 1], clamping');
    }
    return Math.max(0, Math.min(1, value));
  }
}

function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
