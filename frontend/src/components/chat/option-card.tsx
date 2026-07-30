import { OptionItemCard } from '@/components/ui/option-item';
import type { OptionItem } from '@/components/ui/option-item';
import type { WireOptionItem } from '@/types/stream';

interface OptionCardProps {
  item: WireOptionItem;
  selected: boolean;
  multiSelect: boolean;
  onToggle: () => void;
}

export function OptionCard({ item, selected, multiSelect, onToggle }: OptionCardProps) {
  const baseItem: OptionItem = {
    id: item.id,
    label: item.label,
    value: item.value,
    description: item.description,
    disabled: !!item.disabled,
  };

  return (
    <div className="relative">
      <OptionItemCard
        item={baseItem}
        selected={selected}
        multiSelect={multiSelect}
        onToggle={onToggle}
      />
      {item._changeStatus === 'new' && (
        <span className="absolute top-2 right-2 text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">NEW</span>
      )}
      {item._changeStatus === 'changed' && (
        <span className="absolute top-2 right-2 text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded font-medium">CHANGED</span>
      )}
      {item._changeStatus === 'removed' && (
        <span className="absolute top-2 right-2 text-[10px] bg-error/10 text-error px-1.5 py-0.5 rounded font-medium">REMOVED</span>
      )}
    </div>
  );
}
