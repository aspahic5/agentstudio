import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Save, ChevronDown, Sparkles, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useFlowStore } from '@/stores/flow-store';
import { useAIEditorStore } from '@/stores/ai-editor-store';
import { VersionPanel } from './version-panel';
import { cn } from '@/lib/utils';

export function EditorToolbar() {
  const navigate = useNavigate();
  const agent = useFlowStore((s) => s.agent);
  const activeVersion = useFlowStore((s) => s.activeVersion);
  const isDirty = useFlowStore((s) => s.isDirty);
  const isSaving = useFlowStore((s) => s.isSaving);
  const saveNewVersion = useFlowStore((s) => s.saveNewVersion);
  const overwriteVersion = useFlowStore((s) => s.overwriteVersion);

  const aiEditorOpen = useAIEditorStore((s) => s.isOpen);
  const openAIEditor = useAIEditorStore((s) => s.open);
  const closeAIEditor = useAIEditorStore((s) => s.close);

  const agentSettingsOpen = useFlowStore((s) => s.agentSettingsOpen);
  const openAgentSettings = useFlowStore((s) => s.openAgentSettings);
  const closeAgentSettings = useFlowStore((s) => s.closeAgentSettings);

  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new');
  const [newVersion, setNewVersion] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSaveClick() {
    if (activeVersion) {
      // Show choice: overwrite or new
      setSaveMode('overwrite');
    } else {
      setSaveMode('new');
    }
    setSaveDialogOpen(true);
    setSaveError(null);
  }

  async function handleSaveSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    try {
      if (saveMode === 'overwrite') {
        await overwriteVersion();
      } else {
        if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
          setSaveError('Version must be in semver format (e.g., 1.0.0)');
          return;
        }
        await saveNewVersion(newVersion, newLabel || undefined);
      }
      setSaveDialogOpen(false);
      setNewVersion('');
      setNewLabel('');
    } catch (err) {
      setSaveError((err as Error).message);
    }
  }

  return (
    <>
      <div className="h-12 flex items-center gap-3 px-3 border-b border-border-light bg-white shrink-0">
        <button
          onClick={() => navigate('/agents')}
          className="p-1.5 rounded-md hover:bg-bg-card text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={18} />
        </button>

        <span className="font-heading text-sm font-semibold text-ink truncate">
          {agent?.name ?? 'Editor'}
        </span>

        {/* Version selector */}
        <div className="relative">
          <button
            onClick={() => setVersionPanelOpen(!versionPanelOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-ink-muted hover:bg-bg-card"
          >
            {activeVersion ? `v${activeVersion}` : 'No version'}
            <ChevronDown size={12} />
          </button>
          {versionPanelOpen && (
            <VersionPanel onClose={() => setVersionPanelOpen(false)} />
          )}
        </div>

        {/* Dirty indicator */}
        {isDirty && (
          <div className="w-2 h-2 rounded-full bg-warning" title="Unsaved changes" />
        )}

        <div className="flex-1" />

        {/* Agent Settings */}
        <Button
          size="sm"
          variant={agentSettingsOpen ? 'default' : 'ghost'}
          onClick={() => (agentSettingsOpen ? closeAgentSettings() : openAgentSettings())}
          className={cn(agentSettingsOpen && 'bg-primary text-white')}
        >
          <Settings size={14} className="mr-1.5" />
          Settings
        </Button>

        {/* AI Editor */}
        <Button
          size="sm"
          variant={aiEditorOpen ? 'default' : 'ghost'}
          onClick={() => {
            if (aiEditorOpen) {
              closeAIEditor();
            } else {
              openAIEditor();
              closeAgentSettings();
            }
          }}
          className={cn(aiEditorOpen && 'bg-primary text-white')}
        >
          <Sparkles size={14} className="mr-1.5" />
          AI Editor
        </Button>

        {/* Save */}
        <Button
          size="sm"
          onClick={handleSaveClick}
          disabled={isSaving}
          className="bg-primary hover:bg-primary-dark text-white"
        >
          <Save size={14} className="mr-1.5" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {saveMode === 'overwrite' ? 'Save Version' : 'Save New Version'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSubmit} className="space-y-4">
            {activeVersion && (
              <div className="flex gap-2 mb-3">
                <Button
                  type="button"
                  variant={saveMode === 'overwrite' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSaveMode('overwrite')}
                  className={cn(saveMode === 'overwrite' && 'bg-primary text-white')}
                >
                  Overwrite v{activeVersion}
                </Button>
                <Button
                  type="button"
                  variant={saveMode === 'new' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSaveMode('new')}
                  className={cn(saveMode === 'new' && 'bg-primary text-white')}
                >
                  New Version
                </Button>
              </div>
            )}

            {saveMode === 'new' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="version-number">Version (semver)</Label>
                  <Input
                    id="version-number"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    placeholder="1.0.0"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="version-label">Label (optional)</Label>
                  <Input
                    id="version-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Initial release"
                  />
                </div>
              </>
            )}

            {saveMode === 'overwrite' && (
              <p className="text-sm text-ink-muted">
                This will overwrite version <strong>v{activeVersion}</strong> with your current changes.
              </p>
            )}

            {saveError && <p className="text-sm text-error">{saveError}</p>}

            <DialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary-dark text-white"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
