import type { ToolDefinition, ToolDispatcher } from './types.js';
import { executeHttpToolCall } from './httpToolCall.js';
import { ApplicationError } from './errors.js';

export function toolCallCacheKey(
  toolName: string,
  parameters: Record<string, unknown>
): string {
  return `${toolName}::${stableStringify(parameters)}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  const entries = sorted.map(
    (k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])
  );
  return '{' + entries.join(',') + '}';
}

export function restoreEngineState(
  contextData: Record<string, unknown>
): Record<string, unknown> {
  const raw = contextData._engine;
  if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function restoreToolCallCache(
  engineState: Record<string, unknown>,
  cacheKey: string = 'toolCallCache'
): Map<string, unknown> {
  const rawCache = engineState[cacheKey];
  const persistedCache: Record<string, unknown> =
    rawCache !== null && rawCache !== undefined && typeof rawCache === 'object' && !Array.isArray(rawCache)
      ? (rawCache as Record<string, unknown>)
      : {};
  return new Map<string, unknown>(Object.entries(persistedCache));
}

export function persistToolCallCache(cache: Map<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(cache);
}

export function buildToolDescriptions(toolDefinitions: ToolDefinition[]): string {
  const descriptions = toolDefinitions.map((def) => {
    const schemaStr = def.parametersSchemaJson
      ? JSON.stringify(def.parametersSchemaJson, null, 2)
      : 'No parameters';
    return `### ${def.name}\n${def.description}\n\nParameters:\n\`\`\`json\n${schemaStr}\n\`\`\``;
  });
  return descriptions.join('\n\n');
}

export function createDefaultToolDispatcher(
  templateEnv: Record<string, string>,
  credentials: Record<string, string>
): ToolDispatcher {
  return async (toolName, parameters, toolDefMap, flatContext) => {
    const toolDef = toolDefMap.get(toolName);
    if (!toolDef) {
      throw new ApplicationError(
        `[DefaultToolDispatcher] Unknown tool: "${toolName}"`,
        { code: 'CONFIGURATION_ERROR', context: { toolName } }
      );
    }
    const interpolationContext = { ...flatContext, ...parameters, env: templateEnv, credentials };
    return executeHttpToolCall(toolDef, interpolationContext, toolName);
  };
}
