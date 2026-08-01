import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useChatStore } from '@/stores/chat-store';
import { useSSEStream } from '@/hooks/use-sse-stream';
import { SessionControls } from './session-controls';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { OptionsSelector } from './options-selector';
import { ContextInspector } from './context-inspector';

// Prevents StrictMode double-invocation from creating two sessions.
const initializingAgents = new Set<string>();

interface TestChatProps {
  agentId: string;
  draftPayload?: { nodes: unknown[]; saConfigs: unknown[] } | null;
}

export function TestChat({ agentId, draftPayload }: TestChatProps) {
  const [contextRefreshTrigger, setContextRefreshTrigger] = useState(0);

  const {
    sessions,
    activeSessionId,
    fetchSessions,
    createSession,
    createDraftSession,
    deleteSession,
    updateSessionLabel,
    setActiveSession,
  } = useSessionStore();

  const {
    timeline,
    streamingContent,
    isStreaming,
    thinkingState,
    currentOptions,
    setSession,
    loadHistory,
    addUserMessage,
    markWebviewSubmitted,
    reset,
  } = useChatStore();

  const { sendMessage } = useSSEStream(activeSessionId);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Load sessions on mount — no auto-start.
  useEffect(() => {
    if (initializingAgents.has(agentId)) return;
    initializingAgents.add(agentId);

    async function init() {
      // When opened with unsaved changes, always create a fresh draft session.
      if (draftPayload) {
        const session = await createDraftSession(agentId, draftPayload);
        setSession(session.id, agentId);
        return;
      }

      await fetchSessions(agentId);
      const store = useSessionStore.getState();

      if (store.sessions.length === 0) {
        const session = await createSession(agentId);
        setSession(session.id, agentId);
      } else if (!store.activeSessionId) {
        const first = store.sessions[0];
        setActiveSession(first.id);
        setSession(first.id, agentId);
        if (first.hasSnapshot) {
          await loadHistory(first.id);
        }
      }
    }

    init().finally(() => initializingAgents.delete(agentId));
  }, [agentId, fetchSessions, createSession, createDraftSession, draftPayload, setActiveSession, setSession, loadHistory]);

  // Refresh session list and context inspector after stream ends.
  const prevIsStreamingRef = useRef(false);
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      fetchSessions(agentId);
      setContextRefreshTrigger((n) => n + 1);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming, agentId, fetchSessions]);

  const handleStart = useCallback(() => {
    sendMessageRef.current(null);
  }, []);

  const handleNewSession = useCallback(async () => {
    reset();
    const session = draftPayload
      ? await createDraftSession(agentId, draftPayload)
      : await createSession(agentId);
    setSession(session.id, agentId);
  }, [agentId, createSession, createDraftSession, draftPayload, setSession, reset]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    reset();
    await deleteSession(sessionId);

    const store = useSessionStore.getState();
    if (store.sessions.length === 0) {
      const session = await createSession(agentId);
      setSession(session.id, agentId);
    } else if (store.activeSessionId) {
      setSession(store.activeSessionId, agentId);
    }
  }, [agentId, deleteSession, createSession, setSession, reset]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    reset();
    setActiveSession(sessionId);
    setSession(sessionId, agentId);
    const store = useSessionStore.getState();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session?.hasSnapshot) {
      await loadHistory(sessionId);
    }
  }, [setActiveSession, setSession, agentId, reset, loadHistory]);

  const handleSendMessage = useCallback((text: string) => {
    addUserMessage(text);
    sendMessage(text);
  }, [addUserMessage, sendMessage]);

  const handleOptionSubmit = useCallback((selection: string | string[]) => {
    const message = Array.isArray(selection) ? selection.join(', ') : selection;
    addUserMessage(message);
    sendMessage(message);
  }, [addUserMessage, sendMessage]);

  const handleWebViewSubmit = useCallback((data: Record<string, unknown>) => {
    // Mark the webview as submitted immediately so it disables in the UI.
    // Don't add a user bubble — submissions are silent.
    markWebviewSubmitted(data);
    sendMessage(JSON.stringify(data));
  }, [markWebviewSubmitted, sendMessage]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const conversationActive = isStreaming || timeline.length > 0;
  const showStartButton = !!activeSession && !activeSession.hasSnapshot && !conversationActive;
  const showContinueNotice = !!activeSession && activeSession.hasSnapshot && !conversationActive;


  return (
    <div className="flex flex-col h-full">
      <SessionControls
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
        onRename={updateSessionLabel}
      />

      <MessageList
        timeline={timeline}
        streamingContent={streamingContent}
        thinkingState={thinkingState}
        isStreaming={isStreaming}
        onWebViewSubmit={handleWebViewSubmit}
      />

      {showStartButton && (
        <div className="flex items-center justify-center p-8">
          <button
            onClick={handleStart}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Start Conversation
          </button>
        </div>
      )}

      {showContinueNotice && (
        <div className="flex items-center justify-center p-8">
          <button
            onClick={handleStart}
            className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            Continue Conversation
          </button>
        </div>
      )}

      {currentOptions && (
        <OptionsSelector
          options={currentOptions}
          onSubmit={handleOptionSubmit}
        />
      )}

      <ContextInspector sessionId={activeSessionId} refreshTrigger={contextRefreshTrigger} />

      <ChatInput
        onSend={handleSendMessage}
        disabled={isStreaming || !!currentOptions || showStartButton || showContinueNotice}
      />
    </div>
  );
}
