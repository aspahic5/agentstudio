import { useState, useRef, type KeyboardEvent } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';

interface WebviewAIAssistantProps {
  currentHtml?: string;
  currentCss?: string;
  currentJs?: string;
  onApply: (html: string, css: string, js: string) => void;
}

export function WebviewAIAssistant({ currentHtml, currentCss, currentJs, onApply }: WebviewAIAssistantProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleGenerate() {
    const instruction = inputRef.current?.value.trim();
    if (!instruction || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.suggestWebview({
        instruction,
        currentHtml,
        currentCss,
        currentJs,
      });
      onApply(result.html, result.css, result.js);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate form');
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-primary" />
        <span className="text-xs font-medium text-ink-muted">AI Form Builder</span>
      </div>

      <div className="flex gap-2">
        <Textarea
          ref={inputRef}
          placeholder="Describe the form, e.g. 'ask for name and email'"
          className="text-sm min-h-[36px] max-h-[100px] resize-none flex-1"
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={isLoading}
          className="bg-primary hover:bg-primary-dark text-white self-end"
        >
          {isLoading ? (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          ) : (
            <Send size={12} />
          )}
        </Button>
      </div>

      {error && (
        <div className="text-xs text-error bg-error/5 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
