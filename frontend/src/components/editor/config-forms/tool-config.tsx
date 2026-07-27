import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NodeSelector } from './node-selector';
import type { IterationConfig } from '@/types/editor';

interface ToolConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ToolConfig({ nodeId, config, onChange }: ToolConfigProps) {
  const toolName = (config.toolName as string) ?? '';
  const inputContextKeys = (config.inputContextKeys as string[]) ?? [];
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const targetNodeId = (config.targetNodeId as string) ?? '';
  const skipWhenEmpty = (config.skipWhenEmpty as string) ?? '';
  const iteration = config.iteration as IterationConfig | undefined;
  const hasIteration = !!iteration;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateIteration(key: keyof IterationConfig, value: unknown) {
    const current = (config.iteration ?? { arrayKey: '', itemKey: '', concurrency: 1 }) as IterationConfig;
    update('iteration', { ...current, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Tool Name</Label>
        <Input
          value={toolName}
          onChange={(e) => update('toolName', e.target.value)}
          placeholder="e.g. recipe_search"
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-ink-muted">Must match a tool definition name exactly</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Input Context Keys (comma-separated)</Label>
        <Input
          value={inputContextKeys.join(', ')}
          onChange={(e) => update('inputContextKeys', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="e.g. dietary_profile, preferences"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. recipes"
          className="h-8 text-sm"
        />
      </div>

      <NodeSelector
        label="Next Node"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />

      <div className="space-y-1.5">
        <Label className="text-xs">Skip When Empty (context path)</Label>
        <Input
          value={skipWhenEmpty}
          onChange={(e) => update('skipWhenEmpty', e.target.value)}
          placeholder="Optional. e.g. allergies"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Iteration</Label>
        <Switch
          checked={hasIteration}
          onCheckedChange={(checked) => {
            if (checked) {
              update('iteration', { arrayKey: '', itemKey: 'item', concurrency: 1 });
            } else {
              const { iteration: _, ...rest } = config;
              onChange(rest);
            }
          }}
        />
      </div>

      {hasIteration && (
        <div className="space-y-3 pl-3 border-l-2 border-border-light">
          <div className="space-y-1.5">
            <Label className="text-xs">Array Key</Label>
            <Input value={iteration?.arrayKey ?? ''} onChange={(e) => updateIteration('arrayKey', e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Item Key</Label>
            <Input value={iteration?.itemKey ?? 'item'} onChange={(e) => updateIteration('itemKey', e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Concurrency</Label>
            <Input type="number" min={1} max={10} value={iteration?.concurrency ?? 1} onChange={(e) => updateIteration('concurrency', parseInt(e.target.value) || 1)} className="h-8 text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
