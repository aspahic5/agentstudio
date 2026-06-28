import { Plus, Trash2 } from 'lucide-react';
import type { Session } from '@/types/api';
import { Button } from '@/components/ui/button';

interface SessionControlsProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onDelete: (sessionId: string) => void;
}

export function SessionControls({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: SessionControlsProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border-light bg-white">
      <select
        value={activeSessionId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.id.slice(0, 8)}... — {new Date(session.createdAt).toLocaleDateString()}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="ghost"
        onClick={onNew}
        className="text-ink-muted hover:text-primary"
        title="New Session"
      >
        <Plus size={16} />
      </Button>
      {activeSessionId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(activeSessionId)}
          className="text-ink-muted hover:text-error"
          title="Delete Session"
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
