import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NodeSelector } from './node-selector';
import type { IterationConfig } from '@/types/editor';

interface GenerationConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function GenerationConfig({ nodeId, config, onChange }: GenerationConfigProps) {
  const generationPromptTemplate = (config.generationPromptTemplate as string) ?? '';
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const targetNodeId = (config.targetNodeId as string) ?? '';
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
        <Label className="text-xs">Generation Prompt Template</Label>
        <Textarea
          value={generationPromptTemplate}
          onChange={(e) => update('generationPromptTemplate', e.target.value)}
          placeholder="Handlebars template. Use {{contextKey}} to reference context data."
          className="text-sm font-mono min-h-[120px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. meal_plan"
          className="h-8 text-sm"
        />
      </div>

      <NodeSelector
        label="Next Node"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />

      <div className="flex items-center justify-between">
        <Label className="text-xs">Enable Iteration (batch processing)</Label>
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
            <Label className="text-xs">Array Key (context key containing items)</Label>
            <Input
              value={iteration?.arrayKey ?? ''}
              onChange={(e) => updateIteration('arrayKey', e.target.value)}
              placeholder="e.g. days_of_week"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Item Key (loop variable name)</Label>
            <Input
              value={iteration?.itemKey ?? 'item'}
              onChange={(e) => updateIteration('itemKey', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Concurrency</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={iteration?.concurrency ?? 1}
              onChange={(e) => updateIteration('concurrency', parseInt(e.target.value) || 1)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
