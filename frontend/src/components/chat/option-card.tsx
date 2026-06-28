import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WireOptionItem } from '@/types/stream';

interface OptionCardProps {
  item: WireOptionItem;
  selected: boolean;
  multiSelect: boolean;
  onToggle: () => void;
}

export function OptionCard({ item, selected, multiSelect, onToggle }: OptionCardProps) {
  const isDisabled = !!item.disabled;
  const isRemoved = item._changeStatus === 'removed';

  return (
    <button
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        'w-full text-left border rounded-lg p-3 transition-all',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border-light bg-white hover:border-primary/30',
        isDisabled && 'opacity-50 cursor-not-allowed',
        isRemoved && 'line-through opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
          selected ? 'border-primary bg-primary text-white' : 'border-border',
          multiSelect && selected && 'rounded-md',
          multiSelect && !selected && 'rounded-md',
        )}>
          {selected && (multiSelect ? <Check size={12} /> : <Circle size={8} className="fill-current" />)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{item.label}</span>
            {item._changeStatus === 'new' && (
              <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">NEW</span>
            )}
            {item._changeStatus === 'changed' && (
              <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded font-medium">CHANGED</span>
            )}
            {isRemoved && (
              <span className="text-[10px] bg-error/10 text-error px-1.5 py-0.5 rounded font-medium">REMOVED</span>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-ink-muted mt-1">{item.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
