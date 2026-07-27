import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useFlowStore } from '@/stores/flow-store';
import { NODE_TYPE_META } from '@/lib/node-type-meta';

interface NodeSelectorProps {
  label: string;
  value: string;
  onChange: (nodeId: string) => void;
  excludeNodeId?: string;
}

export function NodeSelector({ label, value, onChange, excludeNodeId }: NodeSelectorProps) {
  const agentNodes = useFlowStore((s) => s.agentNodes);

  const options = Array.from(agentNodes.values())
    .filter((n) => n.id !== excludeNodeId)
    .map((n) => ({
      id: n.id,
      name: n.name,
      typeLabel: NODE_TYPE_META[n.nodeType].label,
    }));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select a node..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <span className="truncate">{opt.name}</span>
              <span className="ml-1.5 text-ink-muted text-[10px]">{opt.typeLabel}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
