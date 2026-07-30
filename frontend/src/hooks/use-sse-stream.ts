import { useRef, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { streamSSEEvents } from '@/lib/sse-parser';
import { useChatStore } from '@/stores/chat-store';

export function useSSEStream(sessionId: string | null) {
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const { processStreamEvent, startStream, isStreaming } = useChatStore();

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(
    async (message: string | null, initialContext?: Record<string, unknown>) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      // For auto-start (null message), don't interrupt an already-running stream.
      if (message === null && abortRef.current) return;

      abort();
      startStream();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await apiClient.sendMessage(
          sessionId,
          message,
          initialContext,
          controller.signal,
        );

        if (!response.body) {
          throw new Error('No response body');
        }

        for await (const event of streamSSEEvents(response.body)) {
          if (controller.signal.aborted) break;
          processStreamEvent(event);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        processStreamEvent({
          type: 'error',
          message: err instanceof Error ? err.message : 'Stream failed',
        });
      }
    },
    [sessionId, processStreamEvent, startStream, abort],
  );

  // Abort on unmount
  useEffect(() => {
    return () => abort();
  }, [abort]);

  return { sendMessage, isStreaming, abort };
}
