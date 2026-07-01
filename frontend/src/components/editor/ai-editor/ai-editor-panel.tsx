import { useRef, useEffect, type KeyboardEvent } from 'react';
import { Sparkles, X, Trash2, Send, Check, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAIEditorStore } from '@/stores/ai-editor-store';
import { OperationList } from './operation-list';
import { cn } from '@/lib/utils';

export function AIEditorPanel() {
  const messages = useAIEditorStore((s) => s.messages);
  const pendingOperations = useAIEditorStore((s) => s.pendingOperations);
  const pendingValidation = useAIEditorStore((s) => s.pendingValidation);
  const isLoading = useAIEditorStore((s) => s.isLoading);
  const error = useAIEditorStore((s) => s.error);
  const close = useAIEditorStore((s) => s.close);
  const sendInstruction = useAIEditorStore((s) => s.sendInstruction);
  const acceptOperations = useAIEditorStore((s) => s.acceptOperations);
  const rejectOperations = useAIEditorStore((s) => s.rejectOperations);
  const clearConversation = useAIEditorStore((s) => s.clearConversation);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  function handleSubmit() {
    const value = inputRef.current?.value.trim();
    if (!value || isLoading) return;
    inputRef.current!.value = '';
    sendInstruction(value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="w-96 border-l border-border-light bg-white flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="h-12 flex items-center gap-2 px-3 border-b border-border-light shrink-0">
        <Sparkles size={14} className="text-primary" />
        <span className="text-sm font-semibold text-ink flex-1">AI Editor</span>
        <button
          onClick={clearConversation}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
          title="Clear conversation"
        >
          <Trash2 size={14} />
        </button>
        <button
          onClick={close}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles size={28} className="text-ink-muted/30 mb-3" />
              <p className="text-sm text-ink-muted mb-1">Describe what you want to change</p>
              <p className="text-xs text-ink-muted/60">
                e.g. "Add a generation node called Summary"
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[85%]',
                msg.role === 'user' && 'ml-auto bg-primary/5 text-ink',
                msg.role === 'assistant' && 'mr-auto bg-bg-card text-ink',
                msg.role === 'system' && 'mx-auto bg-transparent text-ink-muted text-center italic',
              )}
            >
              {msg.content}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-ink-muted mr-auto">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-ink-muted/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-ink-muted/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-ink-muted/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
              Thinking...
            </div>
          )}

          {error && !isLoading && (
            <div className="text-xs text-error bg-error/5 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Pending operations */}
      {pendingOperations && pendingOperations.length > 0 && (
        <div className="border-t border-border-light p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink">
              {pendingOperations.length} operation{pendingOperations.length !== 1 ? 's' : ''}
            </span>
            {pendingValidation && !pendingValidation.valid && (
              <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
                warnings
              </span>
            )}
          </div>
          <OperationList operations={pendingOperations} validation={pendingValidation} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={acceptOperations}
              className="flex-1 bg-success hover:bg-success/90 text-white"
            >
              <Check size={12} className="mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={rejectOperations}
              className="flex-1"
            >
              <XCircle size={12} className="mr-1" />
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border-light p-3 shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            placeholder="Describe a change..."
            className="text-sm min-h-[36px] max-h-[120px] resize-none flex-1"
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-primary hover:bg-primary-dark text-white self-end"
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
