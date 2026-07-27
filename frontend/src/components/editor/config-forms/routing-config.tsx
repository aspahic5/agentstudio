import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { NodeSelector } from './node-selector';
import type { RoutingRule, RoutingTarget } from '@/types/editor';

interface RoutingConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function RoutingConfig({ nodeId, config, onChange }: RoutingConfigProps) {
  const rules = (config.rules ?? []) as RoutingRule[];
  const defaultTarget = (config.defaultTarget ?? { type: 'complete' }) as RoutingTarget;
  const message = (config.message as string) ?? '';
  const waitForContinue = (config.waitForContinue as boolean) ?? false;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  function updateRule(index: number, updates: Partial<RoutingRule>) {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    update('rules', newRules);
  }

  function addRule() {
    update('rules', [...rules, { condition: '', target: { type: 'node' as const, nodeId: '' } }]);
  }

  function removeRule(index: number) {
    update('rules', rules.filter((_, i) => i !== index));
  }

  function updateRuleTargetNodeId(index: number, targetNodeId: string) {
    updateRule(index, { target: { type: 'node', nodeId: targetNodeId } });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Message (optional, Handlebars template)</Label>
        <Textarea
          value={message}
          onChange={(e) => update('message', e.target.value)}
          placeholder="Optional message shown to user during routing"
          className="text-sm min-h-[60px]"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Wait for User to Continue</Label>
        <Switch
          checked={waitForContinue}
          onCheckedChange={(v) => update('waitForContinue', v)}
        />
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Rules (evaluated in order)</Label>
          <Button size="sm" variant="ghost" onClick={addRule} className="h-6 px-2 text-xs">
            <Plus size={12} className="mr-1" /> Add Rule
          </Button>
        </div>

        {rules.map((rule, i) => (
          <div key={i} className="space-y-2 p-2 rounded-lg bg-bg-card border border-border-light">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-ink-muted uppercase">Rule {i + 1}</span>
              <button onClick={() => removeRule(i)} className="p-0.5 text-ink-muted hover:text-error">
                <Trash2 size={12} />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condition (Handlebars expression)</Label>
              <Input
                value={rule.condition}
                onChange={(e) => updateRule(i, { condition: e.target.value })}
                placeholder="e.g. {{dietary_type}} or {{#eq goal 'weight_loss'}}true{{/eq}}"
                className="h-8 text-sm font-mono"
              />
            </div>
            <NodeSelector
              label="Target Node"
              value={rule.target.type === 'node' ? (rule.target as { type: 'node'; nodeId: string }).nodeId : ''}
              onChange={(v) => updateRuleTargetNodeId(i, v)}
              excludeNodeId={nodeId}
            />
          </div>
        ))}

        {rules.length === 0 && (
          <p className="text-xs text-ink-muted py-2">No rules defined. Add a rule or set a default target.</p>
        )}
      </div>

      {/* Default Target */}
      <div className="space-y-2 p-2 rounded-lg bg-bg-card border border-border-light">
        <Label className="text-xs font-semibold">Default Target (when no rule matches)</Label>
        <Select
          value={defaultTarget.type}
          onValueChange={(v) => {
            if (v === 'complete') update('defaultTarget', { type: 'complete' });
            else if (v === 'node') update('defaultTarget', { type: 'node', nodeId: '' });
          }}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="complete">Complete (end agent)</SelectItem>
            <SelectItem value="node">Go to node</SelectItem>
          </SelectContent>
        </Select>
        {defaultTarget.type === 'node' && (
          <NodeSelector
            label="Default Target Node"
            value={(defaultTarget as { type: 'node'; nodeId: string }).nodeId}
            onChange={(v) => update('defaultTarget', { type: 'node', nodeId: v })}
            excludeNodeId={nodeId}
          />
        )}
      </div>
    </div>
  );
}
