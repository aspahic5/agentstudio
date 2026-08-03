import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NodeSelector } from './node-selector';

interface ScreenConfigProps {
  nodeId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function ScreenConfig({ nodeId, config, onChange }: ScreenConfigProps) {
  const content = (config.content as string) ?? '';
  const targetNodeId = (config.targetNodeId as string) ?? '';

  function update(key: string, value: unknown) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Content (Markdown)</Label>
        <Textarea
          value={content}
          onChange={(e) => update('content', e.target.value)}
          placeholder="Enter the content to display to the user..."
          className="text-sm min-h-[120px]"
        />
      </div>

      <NodeSelector
        label="Next Node (after display)"
        value={targetNodeId}
        onChange={(v) => update('targetNodeId', v)}
        excludeNodeId={nodeId}
      />
    </div>
  );
}
