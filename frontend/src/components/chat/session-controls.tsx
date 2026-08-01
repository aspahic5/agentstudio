import { useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import type { Session } from '@/types/api';
import { Button } from '@/components/ui/button';

interface SessionControlsProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, label: string) => Promise<void>;
}

export function SessionControls({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SessionControlsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(session: Session) {
    setEditingId(session.id);
    setEditValue(session.label ?? '');
  }

  async function commitEdit() {
    if (!editingId) return;
    await onRename(editingId, editValue.trim());
    setEditingId(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') setEditingId(null);
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  function sessionLabel(session: Session) {
    return session.label ?? `${session.id.slice(0, 8)} — ${new Date(session.createdAt).toLocaleDateString()}`;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-white">
      {editingId === activeSessionId ? (
        <div className="flex-1 flex items-center gap-1">
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm border border-primary rounded-md px-2 py-1 focus:outline-none"
          />
          <Button size="sm" variant="ghost" onClick={commitEdit} className="p-1 text-primary">
            <Check size={14} />
          </Button>
        </div>
      ) : (
        <>
          <select
            value={activeSessionId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {sessionLabel(session)}
              </option>
            ))}
          </select>
          {activeSession && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startEdit(activeSession)}
              className="text-ink-muted hover:text-primary p-1"
              title="Rename session"
            >
              <Pencil size={13} />
            </Button>
          )}
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={onNew}
        className="text-ink-muted hover:text-primary p-1"
        title="New Session"
      >
        <Plus size={16} />
      </Button>
      {activeSessionId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(activeSessionId)}
          className="text-ink-muted hover:text-error p-1"
          title="Delete Session"
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
