import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ContextCardProps {
  cardType: string;
  data: Record<string, unknown>;
}

export function ContextCard({ cardType, data }: ContextCardProps) {
  const entries = Object.entries(data);
  const isLarge = entries.length > 5;
  const [expanded, setExpanded] = useState(!isLarge);

  return (
    <div className="bg-white border border-border-light rounded-lg shadow-soft overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-ink">{cardType}</span>
        {isLarge && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="text-ink-muted font-medium shrink-0">{key}:</span>
              <span className="text-ink break-all">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
