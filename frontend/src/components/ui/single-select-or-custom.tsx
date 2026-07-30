import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import type { OptionItem } from './option-item';
import { OptionItemCard } from './option-item';

interface SingleSelectOrCustomProps {
  items: OptionItem[];
  value: string | null;
  onChange: (value: string) => void;
  customInputLabel?: string;
  customInputPlaceholder?: string;
  customInputFirst?: boolean;
  className?: string;
}

export function SingleSelectOrCustom({
  items,
  value,
  onChange,
  customInputLabel = 'Or type your own',
  customInputPlaceholder = 'Type your answer...',
  customInputFirst = false,
  className,
}: SingleSelectOrCustomProps) {
  const [customText, setCustomText] = useState('');

  const handleCardSelect = (cardValue: string) => {
    setCustomText('');
    onChange(cardValue);
  };

  const handleCustomChange = (text: string) => {
    setCustomText(text);
    if (text) {
      onChange(text);
    }
  };

  // A card is "selected" only if it matches value and custom text is empty
  const selectedCardValue = customText ? null : value;

  const customInput = (
    <div className="space-y-1.5">
      {customInputLabel && (
        <label className="text-xs font-medium text-ink-muted">{customInputLabel}</label>
      )}
      <Input
        value={customText}
        onChange={(e) => handleCustomChange(e.target.value)}
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
            selected={selectedCardValue === item.value}
            multiSelect={false}
            onToggle={() => !item.disabled && handleCardSelect(item.value)}
          />
        ))}
      </div>

      {!customInputFirst && customInput}
    </div>
  );
}
