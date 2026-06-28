import type { ToolDefinition } from './types.js';
import { interpolate } from './interpolate.js';
import { extractPath } from './applyActions.js';
import { ApplicationError, TimeoutError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const bare = hostname.replace(/^\[|\]$/g, '');
  return PRIVATE_IP_PATTERNS.some((re) => re.test(bare));
}

export async function executeHttpToolCall(
  toolDef: ToolDefinition,
  interpolationContext: Record<string, unknown>,
  toolName: string
): Promise<unknown> {
  let url = interpolate(toolDef.urlTemplate, interpolationContext);
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ApplicationError(`Disallowed protocol: ${parsed.protocol}`, { code: 'VALIDATION_ERROR', statusCode: 400, context: { toolName, protocol: parsed.protocol } });
    }
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      `Tool "${toolName}" has invalid URL after interpolation`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { toolName }, cause: error instanceof Error ? error : undefined }
    );
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new ApplicationError(
      `Tool "${toolName}" attempted to access a private/internal address`,
      { code: 'VALIDATION_ERROR', statusCode: 400, context: { toolName } }
    );
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (toolDef.headers) {
    for (const [key, value] of Object.entries(toolDef.headers)) {
      const interpolated = interpolate(String(value), interpolationContext).trim();
      if (interpolated) headers[key] = interpolated;
    }
  }

  let body: string | undefined;
  if (toolDef.bodyTemplate && (toolDef.method === 'POST' || toolDef.method === 'PUT')) {
    body = interpolate(toolDef.bodyTemplate, interpolationContext);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: toolDef.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ApplicationError(
        `Tool "${toolName}" HTTP error: ${response.status} ${response.statusText}`,
        { code: 'AGENT_ERROR', context: { toolName, statusCode: response.status } }
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isSSE = contentType.includes('text/event-stream');

    let responseData: unknown;
    if (isSSE) {
      responseData = await consumeSSEResponse(response, toolName);
    } else {
      const responseText = await response.text();
      try {
        responseData = JSON.parse(responseText);
      } catch {
        throw new ApplicationError(
          `Tool "${toolName}" returned non-JSON response. Status: ${response.status}. Body: ${responseText.slice(0, 200)}`,
          { code: 'AGENT_ERROR', context: { toolName, statusCode: response.status } }
        );
      }
    }

    const resolvedPath = toolDef.responsePath
      ? interpolate(toolDef.responsePath, interpolationContext)
      : null;

    const extracted = resolvedPath ? extractPath(responseData, resolvedPath) : responseData;

    if (resolvedPath && extracted === undefined) {
      throw new ApplicationError(
        `Tool "${toolName}" responsePath "${resolvedPath}" extracted no data from response.`,
        { code: 'AGENT_ERROR', context: { toolName, responsePath: resolvedPath } }
      );
    }

    return extracted;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(
        `Tool "${toolName}" timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        { context: { toolName, timeoutMs: DEFAULT_TIMEOUT_MS } }
      );
    }
    throw error;
  }
}

async function consumeSSEResponse(response: Response, toolName: string): Promise<unknown> {
  const body = response.body;
  if (!body) throw new ApplicationError(`Tool "${toolName}" SSE response has no body.`, { code: 'AGENT_ERROR', context: { toolName } });

  let resultData: unknown = null;
  let completeData: unknown = null;
  let errorData: string | null = null;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (line === '') {
        currentEvent = '';
        continue;
      }

      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const dataStr = line.slice(5).trim();
        if (currentEvent === 'result') {
          try { resultData = JSON.parse(dataStr); } catch { resultData = dataStr; }
        } else if (currentEvent === 'complete') {
          try { completeData = JSON.parse(dataStr); } catch { completeData = dataStr; }
        } else if (currentEvent === 'error') {
          errorData = dataStr;
        }
      }
    }
  }

  if (errorData) throw new ApplicationError(`Tool "${toolName}" SSE stream returned error: ${errorData}`, { code: 'AGENT_ERROR', context: { toolName, errorData } });
  if (resultData !== null) return resultData;
  if (completeData !== null) return completeData;
  throw new ApplicationError(`Tool "${toolName}" SSE stream completed without a result or complete event.`, { code: 'AGENT_ERROR', context: { toolName } });
}
