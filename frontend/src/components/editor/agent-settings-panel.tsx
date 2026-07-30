import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFlowStore } from '@/stores/flow-store';
import { NODE_TYPE_META } from '@/lib/node-type-meta';

export function AgentSettingsPanel() {
  const agent = useFlowStore((s) => s.agent);
  const agentNodes = useFlowStore((s) => s.agentNodes);
  const closeAgentSettings = useFlowStore((s) => s.closeAgentSettings);
  const updateAgentSettings = useFlowStore((s) => s.updateAgentSettings);

  const [description, setDescription] = useState(agent?.description ?? '');
  const [initialNodeId, setInitialNodeId] = useState(agent?.initialNodeId ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDescription(agent?.description ?? '');
    setInitialNodeId(agent?.initialNodeId ?? '');
  }, [agent?.id]);
  const [error, setError] = useState<string | null>(null);

  if (!agent) return null;

  const nodeOptions = Array.from(agentNodes.values()).map((n) => ({
    id: n.id,
    name: n.name,
    typeLabel: NODE_TYPE_META[n.nodeType].label,
  }));

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await updateAgentSettings({ initialNodeId, description });
      closeAgentSettings();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-96 border-l border-border-light bg-white flex flex-col h-full shrink-0">
      <div className="h-12 flex items-center justify-between px-3 border-b border-border-light shrink-0">
        <span className="text-sm font-semibold text-ink">Agent Settings</span>
        <button
          onClick={closeAgentSettings}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Agent Name</Label>
            <Input value={agent.name} disabled className="h-8 text-sm bg-bg-card" />
            <p className="text-[10px] text-ink-muted">Name is set at creation time</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this agent does"
              className="text-sm min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Initial Node (entry point)</Label>
            <Select value={initialNodeId} onValueChange={(v) => v && setInitialNodeId(v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select starting node..." />
              </SelectTrigger>
              <SelectContent>
                {nodeOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    <span className="truncate">{opt.name}</span>
                    <span className="ml-1.5 text-ink-muted text-[10px]">{opt.typeLabel}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-ink-muted">The first node executed when a user starts a session</p>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      </ScrollArea>

      <div className="border-t border-border-light p-3 shrink-0">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-primary hover:bg-primary-dark text-white"
        >
          <Save size={14} className="mr-1.5" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
