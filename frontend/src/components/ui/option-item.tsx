import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OptionItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface OptionItemCardProps {
  item: OptionItem;
  selected: boolean;
  multiSelect: boolean;
  onToggle: () => void;
}

export function OptionItemCard({ item, selected, multiSelect, onToggle }: OptionItemCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={item.disabled}
      className={cn(
        'w-full text-left border rounded-lg p-3 transition-all',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border-light bg-white hover:border-primary/30',
        item.disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 w-5 h-5 border-2 flex items-center justify-center shrink-0 transition-colors',
          multiSelect ? 'rounded-md' : 'rounded-full',
          selected ? 'border-primary bg-primary text-white' : 'border-border',
        )}>
          {selected && (multiSelect
            ? <Check size={12} />
            : <Circle size={8} className="fill-current" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-ink">{item.label}</span>
          {item.description && (
            <p className="text-xs text-ink-muted mt-1">{item.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
