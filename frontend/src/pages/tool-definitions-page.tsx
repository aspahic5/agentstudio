import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToolDefinitionStore } from '@/stores/tool-definition-store';
import type { ToolDefinition, CreateToolPayload } from '@/types/api';

function ToolForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<CreateToolPayload>;
  onSubmit: (data: CreateToolPayload) => Promise<void>;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [urlTemplate, setUrlTemplate] = useState(initial?.urlTemplate ?? '');
  const [method, setMethod] = useState(initial?.method ?? 'POST');
  const [bodyTemplate, setBodyTemplate] = useState(initial?.bodyTemplate ?? '');
  const [responsePath, setResponsePath] = useState(initial?.responsePath ?? '');
  const [authType, setAuthType] = useState(initial?.authType ?? '');
  const [parametersSchemaJson, setParametersSchemaJson] = useState(
    initial?.parametersSchemaJson ? JSON.stringify(initial.parametersSchemaJson, null, 2) : '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let parsedSchema: Record<string, unknown> | null = null;
      if (parametersSchemaJson.trim()) {
        parsedSchema = JSON.parse(parametersSchemaJson);
      }
      await onSubmit({
        name,
        description,
        urlTemplate: urlTemplate || undefined,
        method: method || undefined,
        bodyTemplate: bodyTemplate || null,
        responsePath: responsePath || null,
        authType: authType || null,
        parametersSchemaJson: parsedSchema,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tool-name">Name</Label>
        <Input id="tool-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. recipe_search" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tool-desc">Description</Label>
        <Textarea id="tool-desc" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="What this tool does" className="min-h-[60px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => v && setMethod(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Auth Type</Label>
          <Input value={authType} onChange={(e) => setAuthType(e.target.value)} placeholder="e.g. bearer" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>URL Template</Label>
        <Input value={urlTemplate} onChange={(e) => setUrlTemplate(e.target.value)} placeholder="https://api.example.com/{{endpoint}}" />
      </div>
      <div className="space-y-2">
        <Label>Body Template</Label>
        <Textarea value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} placeholder="JSON body template with {{variables}}" className="font-mono text-sm min-h-[60px]" />
      </div>
      <div className="space-y-2">
        <Label>Response Path</Label>
        <Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} placeholder="e.g. data.results" />
      </div>
      <div className="space-y-2">
        <Label>Parameters Schema (JSON Schema)</Label>
        <Textarea value={parametersSchemaJson} onChange={(e) => setParametersSchemaJson(e.target.value)} placeholder='{"type":"object","properties":{...}}' className="font-mono text-sm min-h-[80px]" />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary-dark text-white">
          {isSaving ? 'Saving...' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ToolDefinitionsPage() {
  const tools = useToolDefinitionStore((s) => s.tools);
  const isLoading = useToolDefinitionStore((s) => s.isLoading);
  const error = useToolDefinitionStore((s) => s.error);
  const fetchTools = useToolDefinitionStore((s) => s.fetchTools);
  const createTool = useToolDefinitionStore((s) => s.createTool);
  const updateTool = useToolDefinitionStore((s) => s.updateTool);
  const deleteTool = useToolDefinitionStore((s) => s.deleteTool);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  async function handleCreate(data: CreateToolPayload) {
    await createTool(data);
    setCreateOpen(false);
  }

  async function handleUpdate(data: CreateToolPayload) {
    if (!editingTool) return;
    await updateTool(editingTool.id, data);
    setEditingTool(null);
  }

  async function handleDelete(toolId: string) {
    if (!confirm('Delete this tool definition?')) return;
    await deleteTool(toolId);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-heading font-semibold text-ink">Tool Definitions</h1>
          <p className="text-sm text-ink-muted mt-1">External tools and APIs that agents can use</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary-dark text-white">
          <Plus size={14} className="mr-1.5" /> New Tool
        </Button>
      </div>

      {error && <p className="text-sm text-error mb-4">{error}</p>}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && tools.length === 0 && (
        <div className="text-center py-12">
          <Wrench size={32} className="mx-auto text-ink-muted/30 mb-3" />
          <p className="text-sm text-ink-muted mb-3">No tool definitions yet</p>
          <Button onClick={() => setCreateOpen(true)} variant="ghost">
            <Plus size={14} className="mr-1.5" /> Create your first tool
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {tools.map((tool) => (
          <div key={tool.id} className="rounded-xl border border-border-light bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-ink-muted shrink-0" />
                  <span className="text-sm font-semibold text-ink">{tool.name}</span>
                  <span className="text-[10px] bg-bg-card px-1.5 py-0.5 rounded text-ink-muted">{tool.method}</span>
                </div>
                <p className="text-xs text-ink-muted mt-1 line-clamp-2">{tool.description}</p>
                {tool.urlTemplate && (
                  <p className="text-[10px] text-ink-muted/60 font-mono mt-1 truncate">{tool.urlTemplate}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0 ml-3">
                <button onClick={() => setEditingTool(tool)} className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-bg-card">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(tool.id)} className="p-1.5 rounded-md text-ink-muted hover:text-error hover:bg-error/5">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Tool Definition</DialogTitle></DialogHeader>
          <ToolForm onSubmit={handleCreate} submitLabel="Create Tool" />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTool} onOpenChange={(open) => { if (!open) setEditingTool(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Tool Definition</DialogTitle></DialogHeader>
          {editingTool && (
            <ToolForm
              initial={editingTool}
              onSubmit={handleUpdate}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
