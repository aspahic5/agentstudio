import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { NodeSelector } from './node-selector';

interface ConversationConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ConversationConfig({ nodeId, config, onChange }: ConversationConfigProps) {
  const goalDescription = (config.goalDescription as string) ?? '';
  const completionStrategy = (config.completionStrategy as string) ?? 'llm_decided';
  const targetNodeId = (config.targetNodeId as string) ?? '';
  const maxStepsPerTurn = (config.maxStepsPerTurn as number) ?? 5;
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const availableTools = (config.availableTools as string[]) ?? [];
  const reEntryContextKey = (config.reEntryContextKey as string) ?? '';
  const outputSchema = config.outputSchema as Record<string, unknown> | undefined;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Goal Description</Label>
        <Textarea
          value={goalDescription}
          onChange={(e) => update('goalDescription', e.target.value)}
          placeholder="Describe the conversation goal, e.g. 'Understand the client's dietary preferences and restrictions'"
          className="text-sm min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Completion Strategy</Label>
        <Select value={completionStrategy} onValueChange={(v) => v && update('completionStrategy', v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="llm_decided">LLM Decided</SelectItem>
            <SelectItem value="user_explicit">User Explicit</SelectItem>
            <SelectItem value="either">Either</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <NodeSelector
        label="Next Node (after completion)"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />

      <div className="space-y-1.5">
        <Label className="text-xs">Max Steps Per Turn</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={maxStepsPerTurn}
          onChange={(e) => update('maxStepsPerTurn', parseInt(e.target.value) || 5)}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. dietary_profile"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Schema (JSON)</Label>
        <Textarea
          value={outputSchema ? JSON.stringify(outputSchema, null, 2) : '{}'}
          onChange={(e) => {
            try { update('outputSchema', JSON.parse(e.target.value)); } catch { /* allow typing */ }
          }}
          className="text-sm font-mono min-h-[100px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Available Tools (comma-separated)</Label>
        <Input
          value={availableTools.join(', ')}
          onChange={(e) => update('availableTools', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="e.g. recipe_search, nutrition_api"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Re-entry Context Key</Label>
        <Input
          value={reEntryContextKey}
          onChange={(e) => update('reEntryContextKey', e.target.value)}
          placeholder="Optional"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
