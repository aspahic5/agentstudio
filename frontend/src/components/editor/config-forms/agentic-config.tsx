import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NodeSelector } from './node-selector';

interface AgenticConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function AgenticConfig({ nodeId, config, onChange }: AgenticConfigProps) {
  const toolNames = (config.toolNames as string[]) ?? [];
  const maxSteps = (config.maxSteps as number) ?? 10;
  const systemPromptTemplate = (config.systemPromptTemplate as string) ?? '';
  const agenticPromptTemplate = (config.agenticPromptTemplate as string) ?? '';
  const outputContextKey = (config.outputContextKey as string) ?? '';
  const targetNodeId = (config.targetNodeId as string) ?? '';
  const outputSchema = config.outputSchema as Record<string, unknown> | undefined;

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Tool Names (comma-separated)</Label>
        <Input
          value={toolNames.join(', ')}
          onChange={(e) => update('toolNames', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="e.g. recipe_search, nutrition_api, price_compare"
          className="h-8 text-sm"
        />
        <p className="text-[10px] text-ink-muted">Must match tool definition names exactly</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Max Steps</Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={maxSteps}
          onChange={(e) => update('maxSteps', parseInt(e.target.value) || 10)}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">System Prompt Template</Label>
        <Textarea
          value={systemPromptTemplate}
          onChange={(e) => update('systemPromptTemplate', e.target.value)}
          placeholder="Handlebars template for the system prompt"
          className="text-sm font-mono min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Agentic Prompt Template</Label>
        <Textarea
          value={agenticPromptTemplate}
          onChange={(e) => update('agenticPromptTemplate', e.target.value)}
          placeholder="Handlebars template for each agent loop iteration. Available: {{toolResults}}, {{toolDescriptions}}"
          className="text-sm font-mono min-h-[120px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Context Key</Label>
        <Input
          value={outputContextKey}
          onChange={(e) => update('outputContextKey', e.target.value)}
          placeholder="e.g. analysis_result"
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
        <Label className="text-xs">Output Schema (JSON)</Label>
        <Textarea
          value={outputSchema ? JSON.stringify(outputSchema, null, 2) : '{}'}
          onChange={(e) => {
            try { update('outputSchema', JSON.parse(e.target.value)); } catch { /* allow typing */ }
          }}
          className="text-sm font-mono min-h-[100px]"
        />
      </div>
    </div>
  );
}
