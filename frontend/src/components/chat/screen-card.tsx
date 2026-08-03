import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';

interface ScreenCardProps {
  content: string;
  done: boolean;
  isStreaming: boolean;
  onContinue: () => void;
}

export function ScreenCard({ content, done, isStreaming, onContinue }: ScreenCardProps) {
  const disabled = !done || isStreaming;

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      <div
        className="px-5 py-4 prose prose-sm max-w-none text-ink [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
      <div className="border-t border-border px-5 py-3 flex justify-end">
        <button
          onClick={onContinue}
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-primary text-white hover:bg-primary-dark',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          Dalje
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
