import { renderMarkdown } from '@/lib/markdown';

interface StreamingTextProps {
  content: string;
}

export function StreamingText({ content }: StreamingTextProps) {
  if (!content) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] px-4 py-3 text-sm bg-bg-card text-ink rounded-2xl rounded-bl-md">
        <div
          className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_code]:bg-white/50 [&_code]:px-1 [&_code]:rounded"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
        <span className="inline-block w-0.5 h-4 bg-ink animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </div>
  );
}
