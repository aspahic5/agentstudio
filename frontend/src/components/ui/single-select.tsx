import { cn } from '@/lib/utils';
import type { OptionItem } from './option-item';
import { OptionItemCard } from './option-item';

interface SingleSelectProps {
  items: OptionItem[];
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

export function SingleSelect({ items, value, onChange, className }: SingleSelectProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => (
        <OptionItemCard
          key={item.id}
          item={item}
          selected={value === item.value}
          multiSelect={false}
          onToggle={() => !item.disabled && onChange(item.value)}
        />
      ))}
    </div>
  );
}
