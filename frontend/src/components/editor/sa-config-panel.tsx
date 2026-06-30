import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import type { EditorSaConfig } from '@/types/editor';

interface SaConfigPanelProps {
  config: EditorSaConfig;
  onChange: (updates: Partial<EditorSaConfig>) => void;
}

export function SaConfigPanel({ config, onChange }: SaConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">System Prompt</Label>
        <Textarea
          value={config.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          className="text-sm min-h-[120px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Schema (JSON)</Label>
        <Textarea
          value={config.outputSchemaJson ? JSON.stringify(config.outputSchemaJson, null, 2) : ''}
          onChange={(e) => {
            try {
              onChange({ outputSchemaJson: JSON.parse(e.target.value) });
            } catch {
              // Allow typing invalid JSON temporarily
            }
          }}
          className="text-sm font-mono min-h-[80px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Temperature</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature ?? 0.7}
            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Max Retries</Label>
          <Input
            type="number"
            min={0}
            max={10}
            value={config.maxRetries ?? 2}
            onChange={(e) => onChange({ maxRetries: parseInt(e.target.value) })}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Max Output Tokens</Label>
        <Input
          type="number"
          value={config.maxOutputTokens ?? ''}
          onChange={(e) => onChange({ maxOutputTokens: e.target.value ? parseInt(e.target.value) : null })}
          placeholder="Auto"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Formatting</Label>
        <Select value={config.outputFormatting ?? 'markdown'} onValueChange={(v) => onChange({ outputFormatting: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="plain">Plain</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output Density</Label>
        <Select value={config.outputDensity ?? 'compact'} onValueChange={(v) => onChange({ outputDensity: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="spacious">Spacious</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Reasoning Formatting</Label>
        <Select value={config.reasoningFormatting ?? 'concise'} onValueChange={(v) => onChange({ reasoningFormatting: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="concise">Concise</SelectItem>
            <SelectItem value="structured">Structured</SelectItem>
            <SelectItem value="thinking_markers">Thinking Markers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Thinking Guidance</Label>
        <Textarea
          value={config.thinkingGuidance ?? ''}
          onChange={(e) => onChange({ thinkingGuidance: e.target.value || null })}
          className="text-sm min-h-[60px]"
          placeholder="Optional guidance for reasoning"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Model Alias</Label>
        <Input
          value={config.modelAlias ?? ''}
          onChange={(e) => onChange({ modelAlias: e.target.value || null })}
          placeholder="Default model"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
