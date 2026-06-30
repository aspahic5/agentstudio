import { useState } from 'react';
import { Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFlowStore } from '@/stores/flow-store';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface VersionPanelProps {
  onClose: () => void;
}

export function VersionPanel({ onClose }: VersionPanelProps) {
  const versions = useFlowStore((s) => s.versions);
  const activeVersion = useFlowStore((s) => s.activeVersion);
  const loadVersionData = useFlowStore((s) => s.loadVersionData);
  const deleteVersion = useFlowStore((s) => s.deleteVersion);
  const agentId = useFlowStore((s) => s.agentId);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');

  async function handleLoad(version: string) {
    await loadVersionData(version);
    onClose();
  }

  async function handleDelete(version: string) {
    if (!confirm(`Delete version ${version}?`)) return;
    await deleteVersion(version);
  }

  async function handleSaveLabel(version: string) {
    if (!agentId) return;
    await apiClient.updateVersionLabel(agentId, version, labelValue);
    await useFlowStore.getState().loadVersions();
    setEditingLabel(null);
  }

  return (
    <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-elevated border border-border-light z-50 p-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted px-2 py-1">Versions</div>
      {versions.length === 0 && (
        <div className="text-xs text-ink-muted px-2 py-3">No versions saved yet</div>
      )}
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {versions.map((v) => (
          <div
            key={v.version}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm',
              v.version === activeVersion ? 'bg-bg-card font-medium' : 'hover:bg-bg-card/50',
            )}
          >
            <button
              className="flex-1 text-left truncate"
              onClick={() => handleLoad(v.version)}
            >
              <span className="text-ink">v{v.version}</span>
              {v.label && <span className="text-ink-muted ml-1.5">— {v.label}</span>}
            </button>
            <div className="flex gap-1 shrink-0">
              {editingLabel === v.version ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSaveLabel(v.version); }} className="flex gap-1">
                  <Input
                    value={labelValue}
                    onChange={(e) => setLabelValue(e.target.value)}
                    className="h-6 text-xs w-24"
                    autoFocus
                  />
                  <Button type="submit" size="sm" className="h-6 px-2 text-xs">Save</Button>
                </form>
              ) : (
                <button
                  onClick={() => { setEditingLabel(v.version); setLabelValue(v.label ?? ''); }}
                  className="p-0.5 text-ink-muted hover:text-ink"
                >
                  <Tag size={12} />
                </button>
              )}
              <button
                onClick={() => handleDelete(v.version)}
                className="p-0.5 text-ink-muted hover:text-error"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
