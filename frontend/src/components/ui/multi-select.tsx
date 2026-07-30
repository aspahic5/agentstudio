import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import type { OptionItem } from './option-item';
import { OptionItemCard } from './option-item';

interface MultiSelectProps {
  items: OptionItem[];
  value: string[];
  onChange: (values: string[]) => void;
  min?: number;
  max?: number;
  submitLabel?: string;
  onSubmit?: (values: string[]) => void;
  defaultSelectAll?: boolean;
  className?: string;
}

export function MultiSelect({
  items,
  value,
  onChange,
  min = 1,
  max,
  submitLabel = 'Confirm',
  onSubmit,
  defaultSelectAll = false,
  className,
}: MultiSelectProps) {
  const effectiveMax = max ?? items.length;

  useEffect(() => {
    if (defaultSelectAll) {
      const ids = items.filter((i) => !i.disabled).map((i) => i.value);
      onChange(ids);
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (itemValue: string) => {
    if (value.includes(itemValue)) {
      onChange(value.filter((v) => v !== itemValue));
    } else if (value.length < effectiveMax) {
      onChange([...value, itemValue]);
    }
  };

  const canSubmit = value.length >= min && value.length <= effectiveMax;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        {items.map((item) => (
          <OptionItemCard
            key={item.id}
            item={item}
            selected={value.includes(item.value)}
            multiSelect
            onToggle={() => toggle(item.value)}
          />
        ))}
      </div>

      {onSubmit && (
        <Button
          onClick={() => canSubmit && onSubmit(value)}
          disabled={!canSubmit}
          className="w-full"
        >
          {submitLabel} ({value.length} selected)
        </Button>
      )}
    </div>
  );
}
