import { useState, useEffect, useCallback } from 'react';
import type { OptionsConfig } from '@/types/stream';
import { OptionCard } from './option-card';
import { cn } from '@/lib/utils';

interface OptionsSelectorProps {
  options: OptionsConfig;
  onSubmit: (selection: string | string[]) => void;
}

export function OptionsSelector({ options, onSubmit }: OptionsSelectorProps) {
  const isMulti = options.type === 'multi_select';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState('');

  // Default select all
  useEffect(() => {
    if (options.defaultSelectAll) {
      const ids = options.items
        .filter((item) => !item.disabled && item._changeStatus !== 'removed')
        .map((item) => item.id);
      setSelected(new Set(ids));
    }
  }, [options.defaultSelectAll, options.items]);

  const toggleItem = useCallback((id: string) => {
    setCustomText('');
    if (isMulti) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else if (next.size < options.maxSelections) {
          next.add(id);
        }
        return next;
      });
    } else {
      setSelected(new Set([id]));
    }
  }, [isMulti, options.maxSelections]);

  const handleSubmit = () => {
    if (customText.trim()) {
      onSubmit(customText.trim());
      return;
    }

    const selectedItems = options.items.filter((item) => selected.has(item.id));
    if (isMulti) {
      onSubmit(selectedItems.map((item) => item.value));
    } else {
      onSubmit(selectedItems[0]?.value ?? '');
    }
  };

  const canSubmit =
    customText.trim() ||
    (selected.size >= options.minSelections && selected.size <= options.maxSelections);

  const customInputEl = options.allowCustomInput && (
    <div className="space-y-1.5">
      {options.customInputLabel && (
        <label className="text-xs font-medium text-ink-muted">
          {options.customInputLabel}
        </label>
      )}
      <input
        type="text"
        value={customText}
        onChange={(e) => {
          setCustomText(e.target.value);
          if (e.target.value) setSelected(new Set());
        }}
        placeholder={options.customInputPlaceholder ?? 'Type your answer...'}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </div>
  );

  return (
    <div className="px-4 py-3 space-y-3">
      {options.customInputFirst && customInputEl}

      <div className="space-y-2">
        {options.items.map((item) => (
          <OptionCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            multiSelect={isMulti}
            onToggle={() => toggleItem(item.id)}
          />
        ))}
      </div>

      {!options.customInputFirst && customInputEl}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          'w-full py-2.5 rounded-lg text-sm font-medium transition-colors',
          canSubmit
            ? 'bg-primary text-white hover:bg-primary-dark'
            : 'bg-bg-card text-ink-muted cursor-not-allowed',
        )}
      >
        {isMulti
          ? `Submit (${selected.size} selected)`
          : 'Submit'}
      </button>
    </div>
  );
}
