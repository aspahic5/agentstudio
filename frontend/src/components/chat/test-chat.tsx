import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useChatStore } from '@/stores/chat-store';
import { useSSEStream } from '@/hooks/use-sse-stream';
import { SessionControls } from './session-controls';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { OptionsSelector } from './options-selector';

interface TestChatProps {
  agentId: string;
}

export function TestChat({ agentId }: TestChatProps) {
  const {
    sessions,
    activeSessionId,
    fetchSessions,
    createSession,
    deleteSession,
    setActiveSession,
  } = useSessionStore();

  const {
    timeline,
    streamingContent,
    isStreaming,
    thinkingState,
    currentOptions,
    setSession,
    addUserMessage,
    reset,
  } = useChatStore();

  const { sendMessage } = useSSEStream(activeSessionId);
  const initializedRef = useRef(false);

  // Load sessions and auto-create if none exist
  useEffect(() => {
    let cancelled = false;

    async function init() {
      await fetchSessions(agentId);
      const store = useSessionStore.getState();

      if (store.sessions.length === 0) {
        const session = await createSession(agentId);
        if (!cancelled) {
          setSession(session.id, agentId);
        }
      } else if (!store.activeSessionId) {
        const firstId = store.sessions[0].id;
        setActiveSession(firstId);
        if (!cancelled) {
          setSession(firstId, agentId);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [agentId, fetchSessions, createSession, setActiveSession, setSession]);

  // Auto-start pipeline when session changes
  useEffect(() => {
    if (!activeSessionId) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    setSession(activeSessionId, agentId);
    sendMessage(null);
  }, [activeSessionId, agentId, setSession, sendMessage]);

  const handleNewSession = useCallback(async () => {
    initializedRef.current = false;
    reset();
    const session = await createSession(agentId);
    setSession(session.id, agentId);
    sendMessage(null);
    initializedRef.current = true;
  }, [agentId, createSession, setSession, reset, sendMessage]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    initializedRef.current = false;
    reset();
    await deleteSession(sessionId);

    const store = useSessionStore.getState();
    if (store.sessions.length === 0) {
      const session = await createSession(agentId);
      setSession(session.id, agentId);
      sendMessage(null);
      initializedRef.current = true;
    } else if (store.activeSessionId) {
      setSession(store.activeSessionId, agentId);
      sendMessage(null);
      initializedRef.current = true;
    }
  }, [agentId, deleteSession, createSession, setSession, reset, sendMessage]);

  const handleSelectSession = useCallback((sessionId: string) => {
    initializedRef.current = false;
    reset();
    setActiveSession(sessionId);
    setSession(sessionId, agentId);
    initializedRef.current = true;
  }, [setActiveSession, setSession, agentId, reset]);

  const handleSendMessage = useCallback((text: string) => {
    addUserMessage(text);
    sendMessage(text);
  }, [addUserMessage, sendMessage]);

  const handleOptionSubmit = useCallback((selection: string | string[]) => {
    const message = Array.isArray(selection) ? selection.join(', ') : selection;
    addUserMessage(message);
    sendMessage(message);
  }, [addUserMessage, sendMessage]);

  return (
    <div className="flex flex-col h-full">
      <SessionControls
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
      />

      <MessageList
        timeline={timeline}
        streamingContent={streamingContent}
        thinkingState={thinkingState}
        isStreaming={isStreaming}
      />

      {currentOptions && (
        <OptionsSelector
          options={currentOptions}
          onSubmit={handleOptionSubmit}
        />
      )}

      <ChatInput
        onSend={handleSendMessage}
        disabled={isStreaming || !!currentOptions}
      />
    </div>
  );
}
