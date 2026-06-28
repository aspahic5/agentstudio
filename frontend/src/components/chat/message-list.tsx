import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '@/types/chat';
import type { ThinkingState } from '@/types/chat';
import { MessageBubble } from './message-bubble';
import { StreamingText } from './streaming-text';
import { ThinkingIndicator } from './thinking-indicator';
import { PhaseBadge } from './phase-badge';
import { ContextCard } from './context-card';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageListProps {
  timeline: ChatEntry[];
  streamingContent: string;
  thinkingState: ThinkingState | null;
  isStreaming: boolean;
}

export function MessageList({ timeline, streamingContent, thinkingState, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [timeline.length, streamingContent, isAtBottom]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const threshold = 100;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative"
    >
      {timeline.map((entry) => {
        switch (entry.type) {
          case 'message':
            return <MessageBubble key={entry.message.id} message={entry.message} />;
          case 'phase':
            return <PhaseBadge key={entry.id} name={entry.name} />;
          case 'node-title':
            return <PhaseBadge key={entry.id} name={entry.title} />;
          case 'context-update':
            return <ContextCard key={entry.id} cardType={entry.cardType} data={entry.data} />;
          case 'webview':
            return (
              <div key={entry.id} className="text-xs text-ink-muted bg-bg-card rounded-lg p-3">
                [WebView: {entry.content.nodeId}]
              </div>
            );
          case 'completed':
            return (
              <div key={entry.id} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-success/30" />
                <span className="text-xs text-success bg-success/10 px-3 py-1 rounded-md">
                  Completed
                </span>
                <div className="flex-1 h-px bg-success/30" />
              </div>
            );
        }
      })}

      {isStreaming && thinkingState && (
        <ThinkingIndicator thinkingState={thinkingState} />
      )}
      {isStreaming && streamingContent && (
        <StreamingText content={streamingContent} />
      )}

      <div ref={bottomRef} />

      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'fixed bottom-24 right-8 w-8 h-8 rounded-full bg-white shadow-card',
            'flex items-center justify-center text-ink-muted hover:text-ink transition-colors',
            'border border-border-light',
          )}
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}
