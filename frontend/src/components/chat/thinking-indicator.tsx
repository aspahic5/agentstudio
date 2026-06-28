import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import type { ThinkingState } from '@/types/chat';
import { cn } from '@/lib/utils';

interface ThinkingIndicatorProps {
  thinkingState: ThinkingState;
}

export function ThinkingIndicator({ thinkingState }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] w-full">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors mb-1"
        >
          <Brain size={14} className={cn(thinkingState.isActive && 'animate-pulse text-primary-light')} />
          <span>
            {thinkingState.isActive ? 'Thinking' : 'Thought process'}
            {thinkingState.isActive && <span className="animate-pulse">...</span>}
          </span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {expanded && (
          <div className="border-l-3 border-primary-light bg-bg-card rounded-r-lg p-3 space-y-2">
            {thinkingState.content && (
              <pre className="text-xs text-ink-muted font-mono whitespace-pre-wrap break-words">
                {thinkingState.content}
              </pre>
            )}
            {thinkingState.thoughts.map((thought, i) => (
              <div key={i} className="bg-white rounded-md p-2">
                <p className="text-xs font-medium text-ink">{thought.title}</p>
                {thought.description && (
                  <p className="text-xs text-ink-muted mt-1">{thought.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
