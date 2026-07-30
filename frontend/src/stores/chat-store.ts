import { create } from 'zustand';
import type { ChatEntry, ChatMessage, ThinkingState } from '@/types/chat';
import type { ParsedStreamEvent, OptionsConfig, WebViewContent } from '@/types/stream';
import { apiClient } from '@/lib/api-client';

interface ChatState {
  sessionId: string | null;
  agentId: string | null;
  isComplete: boolean;

  timeline: ChatEntry[];
  streamingContent: string;
  isStreaming: boolean;
  thinkingState: ThinkingState | null;
  currentOptions: OptionsConfig | null;
  pendingOptions: OptionsConfig | null;
  pendingWebview: WebViewContent | null;
  currentPhase: { phase: string; name: string } | null;
  webviewContent: WebViewContent | null;
  error: string | null;

  processStreamEvent: (event: ParsedStreamEvent) => void;
  startStream: () => void;
  endStream: () => void;
  addUserMessage: (content: string) => void;
  setSession: (sessionId: string, agentId: string) => void;
  loadHistory: (sessionId: string) => Promise<void>;
  reset: () => void;
}

function genId() {
  return crypto.randomUUID();
}

function finalizeAssistant(
  content: string,
  pendingOptions: OptionsConfig | null,
): ChatMessage {
  return {
    id: genId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    options: pendingOptions ?? undefined,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: null,
  agentId: null,
  isComplete: false,

  timeline: [],
  streamingContent: '',
  isStreaming: false,
  thinkingState: null,
  currentOptions: null,
  pendingOptions: null,
  pendingWebview: null,
  currentPhase: null,
  webviewContent: null,
  error: null,

  processStreamEvent: (event: ParsedStreamEvent) => {
    const state = get();

    switch (event.type) {
      case 'text-delta':
        set({ streamingContent: state.streamingContent + event.delta });
        break;

      case 'thinking-delta': {
        const ts = state.thinkingState ?? { content: '', thoughts: [], isActive: false };
        set({
          thinkingState: {
            ...ts,
            content: ts.content + event.delta,
            isActive: true,
          },
        });
        break;
      }

      case 'thinking-done': {
        if (state.thinkingState) {
          set({ thinkingState: { ...state.thinkingState, isActive: false } });
        }
        break;
      }

      case 'thought-start': {
        const ts = state.thinkingState ?? { content: '', thoughts: [], isActive: true };
        set({
          thinkingState: {
            ...ts,
            thoughts: [...ts.thoughts, { title: event.title }],
          },
        });
        break;
      }

      case 'thought-done': {
        const ts = state.thinkingState;
        if (ts && ts.thoughts.length > 0) {
          const thoughts = [...ts.thoughts];
          thoughts[thoughts.length - 1] = {
            ...thoughts[thoughts.length - 1],
            description: event.description,
          };
          set({ thinkingState: { ...ts, thoughts } });
        }
        break;
      }

      case 'options': {
        // If streaming, store as pending; otherwise render immediately
        if (state.isStreaming && state.streamingContent) {
          set({ pendingOptions: event.options });
        } else {
          set({ currentOptions: event.options });
        }
        break;
      }

      case 'node-title': {
        set({
          timeline: [
            ...state.timeline,
            {
              type: 'node-title',
              id: genId(),
              nodeId: event.nodeId,
              title: event.title,
              phase: event.phase,
              description: event.description,
              timestamp: Date.now(),
            },
          ],
          currentPhase: { phase: event.phase, name: event.title },
        });
        break;
      }

      case 'phase-start': {
        set({
          timeline: [
            ...state.timeline,
            {
              type: 'phase',
              id: genId(),
              phase: event.phase,
              name: event.name,
              timestamp: Date.now(),
            },
          ],
          currentPhase: { phase: event.phase, name: event.name },
        });
        break;
      }

      case 'context-update': {
        set({
          timeline: [
            ...state.timeline,
            {
              type: 'context-update',
              id: genId(),
              cardType: event.cardType,
              data: event.data,
              timestamp: Date.now(),
            },
          ],
        });
        break;
      }

      case 'webview': {
        set({
          webviewContent: event.content,
          pendingWebview: event.content,
        });
        break;
      }

      case 'turn-complete': {
        // Finalize streaming text into assistant message
        let timeline = state.timeline;
        let pendingOpts = state.pendingOptions;
        const pendingWv = state.pendingWebview;
        if (state.streamingContent) {
          const msg = finalizeAssistant(state.streamingContent, pendingOpts);
          timeline = [...timeline, { type: 'message', message: msg }];
          pendingOpts = null;
        }

        // Append webview AFTER the message bubble so it shows below
        if (pendingWv) {
          timeline = [
            ...timeline,
            { type: 'webview', id: genId(), content: pendingWv, timestamp: Date.now() },
          ];
        }

        // If isComplete, add a completed entry
        if (event.isComplete) {
          timeline = [
            ...timeline,
            { type: 'completed', id: genId(), timestamp: Date.now() },
          ];
        }

        // If there were pendingOptions that weren't attached to a message, show them now
        if (pendingOpts) {
          set({ currentOptions: pendingOpts });
        }

        set({
          timeline,
          streamingContent: '',
          isStreaming: false,
          isComplete: event.isComplete,
          pendingOptions: null,
          pendingWebview: null,
          thinkingState: state.thinkingState
            ? { ...state.thinkingState, isActive: false }
            : null,
        });
        break;
      }

      case 'error': {
        set({ error: event.message, isStreaming: false });
        break;
      }

      case 'done': {
        // Generic stream end — finalize if turn-complete hasn't already
        get().endStream();
        break;
      }

      case 'semantic-agent-result':
        // Store silently — may be used in future
        break;
    }
  },

  startStream: () => {
    set({
      isStreaming: true,
      streamingContent: '',
      thinkingState: null,
      error: null,
    });
  },

  endStream: () => {
    const state = get();
    if (!state.isStreaming) return;

    let timeline = state.timeline;
    let pendingOpts = state.pendingOptions;
    const pendingWv = state.pendingWebview;

    if (state.streamingContent) {
      const msg = finalizeAssistant(state.streamingContent, pendingOpts);
      timeline = [...timeline, { type: 'message', message: msg }];
      pendingOpts = null;
    }

    if (pendingWv) {
      timeline = [
        ...timeline,
        { type: 'webview', id: genId(), content: pendingWv, timestamp: Date.now() },
      ];
    }

    if (pendingOpts) {
      set({ currentOptions: pendingOpts });
    }

    set({
      timeline,
      streamingContent: '',
      isStreaming: false,
      pendingOptions: null,
      pendingWebview: null,
      thinkingState: state.thinkingState
        ? { ...state.thinkingState, isActive: false }
        : null,
    });
  },

  addUserMessage: (content: string) => {
    const state = get();
    const msg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    set({
      timeline: [...state.timeline, { type: 'message', message: msg }],
      currentOptions: null,
    });
  },

  setSession: (sessionId: string, agentId: string) => {
    set({
      sessionId,
      agentId,
      isComplete: false,
      timeline: [],
      streamingContent: '',
      isStreaming: false,
      thinkingState: null,
      currentOptions: null,
      pendingOptions: null,
      pendingWebview: null,
      currentPhase: null,
      webviewContent: null,
      error: null,
    });
  },

  loadHistory: async (sessionId: string) => {
    const { messages, webview } = await apiClient.getSessionHistory(sessionId);
    if (messages.length === 0) return;
    const timeline: ChatEntry[] = messages.map((m) => ({
      type: 'message' as const,
      message: {
        id: genId(),
        role: m.role,
        content: m.content,
        timestamp: Date.now(),
      },
    }));
    if (webview) {
      timeline.push({
        type: 'webview',
        id: genId(),
        content: webview,
        timestamp: Date.now(),
      });
    }
    set({ timeline });
  },

  reset: () => {
    set({
      sessionId: null,
      agentId: null,
      isComplete: false,
      timeline: [],
      streamingContent: '',
      isStreaming: false,
      thinkingState: null,
      currentOptions: null,
      pendingOptions: null,
      pendingWebview: null,
      currentPhase: null,
      webviewContent: null,
      error: null,
    });
  },
}));
