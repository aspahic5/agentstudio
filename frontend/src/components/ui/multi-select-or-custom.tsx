import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import type { OptionItem } from './option-item';
import { OptionItemCard } from './option-item';

interface MultiSelectOrCustomProps {
  items: OptionItem[];
  value: string[];
  onChange: (values: string[]) => void;
  customInputLabel?: string;
  customInputPlaceholder?: string;
  customInputFirst?: boolean;
  min?: number;
  max?: number;
  submitLabel?: string;
  onSubmit?: (values: string[]) => void;
  defaultSelectAll?: boolean;
  className?: string;
}

export function MultiSelectOrCustom({
  items,
  value,
  onChange,
  customInputLabel = 'Or type your own',
  customInputPlaceholder = 'Type your answer...',
  customInputFirst = false,
  min = 1,
  max,
  submitLabel = 'Confirm',
  onSubmit,
  defaultSelectAll = false,
  className,
}: MultiSelectOrCustomProps) {
  const effectiveMax = max ?? items.length;
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (defaultSelectAll) {
      const values = items.filter((i) => !i.disabled).map((i) => i.value);
      onChange(values);
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

  const effectiveValues = customText.trim()
    ? [...value, customText.trim()]
    : value;

  const canSubmit = effectiveValues.length >= min && effectiveValues.length <= effectiveMax;

  const customInput = (
    <div className="space-y-1.5">
      {customInputLabel && (
        <label className="text-xs font-medium text-ink-muted">{customInputLabel}</label>
      )}
      <Input
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        placeholder={customInputPlaceholder}
      />
    </div>
  );

  return (
    <div className={cn('space-y-3', className)}>
      {customInputFirst && customInput}

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

      {!customInputFirst && customInput}

      {onSubmit && (
        <Button
          onClick={() => canSubmit && onSubmit(effectiveValues)}
          disabled={!canSubmit}
          className="w-full"
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
