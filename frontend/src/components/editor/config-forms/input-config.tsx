import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import { NodeSelector } from './node-selector';

interface InputOptionItem {
  id: string;
  label: string;
  value: string;
  targetNodeId: string;
}

interface InputConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function InputConfig({ nodeId, config, onChange }: InputConfigProps) {
  const prompt = (config.prompt as string) ?? '';
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const options = (config.options as InputOptionItem[]) ?? [];

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateOption(index: number, field: keyof InputOptionItem, value: string) {
    const updated = options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt));
    update('options', updated);
  }

  function addOption() {
    const id = `opt_${Date.now()}`;
    update('options', [...options, { id, label: '', value: '', targetNodeId: '' }]);
  }

  function removeOption(index: number) {
    update('options', options.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Prompt <span className="text-ink-muted font-normal">(optional)</span></Label>
        <Input
          value={prompt}
          onChange={(e) => update('prompt', e.target.value)}
          placeholder="e.g. Please select an option:"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key <span className="text-ink-muted font-normal">(optional)</span></Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. selected_option"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Options</Label>
          <Button size="sm" variant="ghost" onClick={addOption} className="h-6 px-2 text-xs gap-1">
            <Plus size={12} /> Add
          </Button>
        </div>

        {options.length === 0 && (
          <p className="text-xs text-ink-muted py-2 text-center">No options yet. Add one above.</p>
        )}

        {options.map((opt, i) => (
          <div key={opt.id} className="border border-border-light rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-muted">Option {i + 1}</span>
              <button
                onClick={() => removeOption(i)}
                className="p-0.5 rounded text-ink-muted hover:text-error"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Label</Label>
                <Input
                  value={opt.label}
                  onChange={(e) => updateOption(i, 'label', e.target.value)}
                  placeholder="Display text"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Value</Label>
                <Input
                  value={opt.value}
                  onChange={(e) => updateOption(i, 'value', e.target.value)}
                  placeholder="Stored value"
                  className="h-7 text-xs"
                />
              </div>
            </div>

            <NodeSelector
              label="Target Node"
              value={opt.targetNodeId}
              onChange={(v) => updateOption(i, 'targetNodeId', v)}
              excludeNodeId={nodeId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
