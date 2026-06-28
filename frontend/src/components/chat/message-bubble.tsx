import type { ChatMessage } from '@/types/chat';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] px-4 py-3 text-sm',
          isUser
            ? 'bg-primary text-white rounded-2xl rounded-br-md'
            : 'bg-bg-card text-ink rounded-2xl rounded-bl-md',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div
            className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_code]:bg-white/50 [&_code]:px-1 [&_code]:rounded"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
        <p className={cn(
          'text-[11px] mt-1.5',
          isUser ? 'text-white/70' : 'text-ink-muted',
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
