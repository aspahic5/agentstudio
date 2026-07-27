import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NodeSelector } from './node-selector';

interface ComputeConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ComputeConfig({ nodeId, config, onChange }: ComputeConfigProps) {
  const computeScript = (config.computeScript as string) ?? '';
  const inputContextKeys = (config.inputContextKeys as string[]) ?? [];
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const targetNodeId = (config.targetNodeId as string) ?? '';

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Input Context Keys (comma-separated)</Label>
        <Input
          value={inputContextKeys.join(', ')}
          onChange={(e) => update('inputContextKeys', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="e.g. meal_plan, protein_target"
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-ink-muted">These values are passed as arguments to the script function</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Compute Script (JavaScript function body)</Label>
        <Textarea
          value={computeScript}
          onChange={(e) => update('computeScript', e.target.value)}
          placeholder={`// Arguments match input context keys above\n// Example: if inputContextKeys = ['meals', 'target']\n// function(meals, target, _engine) {\nconst total = meals.reduce((sum, m) => sum + m.protein, 0);\nreturn { totalProtein: total, targetMet: total >= target };\n// }`}
          className="text-sm font-mono min-h-[160px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. macro_summary"
          className="h-8 text-sm"
        />
      </div>

      <NodeSelector
        label="Next Node"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />
    </div>
  );
}
