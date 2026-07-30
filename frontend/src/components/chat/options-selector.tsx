import { useState } from 'react';
import type { OptionsConfig, WireOptionItem } from '@/types/stream';
import type { OptionItem } from '@/components/ui/option-item';
import { SingleSelect } from '@/components/ui/single-select';
import { SingleSelectOrCustom } from '@/components/ui/single-select-or-custom';
import { MultiSelect } from '@/components/ui/multi-select';
import { MultiSelectOrCustom } from '@/components/ui/multi-select-or-custom';

interface OptionsSelectorProps {
  options: OptionsConfig;
  onSubmit: (selection: string | string[]) => void;
}

function toOptionItems(items: WireOptionItem[]): OptionItem[] {
  return items
    .filter((i) => i._changeStatus !== 'removed')
    .map((i) => ({
      id: i.id,
      label: i.label,
      value: i.value,
      description: i.description,
      disabled: !!i.disabled,
    }));
}

export function OptionsSelector({ options, onSubmit }: OptionsSelectorProps) {
  const isMulti = options.type === 'multi_select';
  const items = toOptionItems(options.items);

  const initialSelected = options.defaultSelectAll
    ? items.filter((i) => !i.disabled).map((i) => i.value)
    : [];

  const [multiValue, setMultiValue] = useState<string[]>(initialSelected);
  const [singleValue, setSingleValue] = useState<string | null>(null);

  const customProps = {
    customInputLabel: options.customInputLabel,
    customInputPlaceholder: options.customInputPlaceholder,
    customInputFirst: options.customInputFirst,
  };

  if (!isMulti && !options.allowCustomInput) {
    return (
      <div className="px-4 py-3">
        <SingleSelect
          items={items}
          value={singleValue}
          onChange={(v) => {
            setSingleValue(v);
            onSubmit(v);
          }}
        />
      </div>
    );
  }

  if (!isMulti && options.allowCustomInput) {
    return (
      <div className="px-4 py-3">
        <SingleSelectOrCustom
          items={items}
          value={singleValue}
          onChange={(v) => {
            setSingleValue(v);
            onSubmit(v);
          }}
          {...customProps}
        />
      </div>
    );
  }

  if (isMulti && !options.allowCustomInput) {
    return (
      <div className="px-4 py-3">
        <MultiSelect
          items={items}
          value={multiValue}
          onChange={setMultiValue}
          min={options.minSelections}
          max={options.maxSelections}
          defaultSelectAll={options.defaultSelectAll}
          onSubmit={(v) => onSubmit(v)}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <MultiSelectOrCustom
        items={items}
        value={multiValue}
        onChange={setMultiValue}
        min={options.minSelections}
        max={options.maxSelections}
        defaultSelectAll={options.defaultSelectAll}
        onSubmit={(v) => onSubmit(v)}
        {...customProps}
      />
    </div>
  );
}
