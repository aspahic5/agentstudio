import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Plus, Trash2, Pencil, Check, ChevronDown } from 'lucide-react';
import type { Session, Version } from '@/types/api';
import { Button } from '@/components/ui/button';

interface SessionControlsProps {
  sessions: Session[];
  activeSessionId: string | null;
  versions: Version[];
  onSelect: (sessionId: string) => void;
  onNew: (version?: string) => void;
  onDelete: (sessionId: string) => void;
  onRename: (sessionId: string, label: string) => Promise<void>;
}

export function SessionControls({
  sessions,
  activeSessionId,
  versions,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SessionControlsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!versionPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setVersionPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [versionPickerOpen]);

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

  function handleNewClick() {
    if (versions.length > 1) {
      setVersionPickerOpen((o) => !o);
    } else {
      // 0 or 1 version — just create with default
      onNew(versions[0]?.version);
    }
  }

  function handlePickVersion(version?: string) {
    setVersionPickerOpen(false);
    onNew(version);
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  function sessionLabel(session: Session) {
    const name = session.label ?? `${session.id.slice(0, 8)} — ${new Date(session.createdAt).toLocaleDateString()}`;
    const isDraft = session.version.startsWith('draft-');
    const versionTag = isDraft ? 'draft' : `v${session.version}`;
    return `${name}  [${versionTag}]`;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light bg-white">
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
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <select
              value={activeSessionId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-border rounded-lg px-2 py-1.5 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {sessionLabel(session)}
                </option>
              ))}
            </select>
            {activeSession && (
              <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                activeSession.version.startsWith('draft-')
                  ? 'bg-warning/15 text-warning'
                  : 'bg-bg-card text-ink-muted'
              }`}>
                {activeSession.version.startsWith('draft-') ? 'draft' : `v${activeSession.version}`}
              </span>
            )}
          </div>
          {activeSession && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startEdit(activeSession)}
              className="text-ink-muted hover:text-primary p-1 shrink-0"
              title="Rename session"
            >
              <Pencil size={13} />
            </Button>
          )}
        </>
      )}

      {/* New session button — with version picker if multiple versions exist */}
      <div className="relative shrink-0" ref={pickerRef}>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleNewClick}
          className="text-ink-muted hover:text-primary p-1 flex items-center gap-0.5"
          title="New Session"
        >
          <Plus size={16} />
          {versions.length > 1 && <ChevronDown size={11} />}
        </Button>

        {versionPickerOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">New session with</p>
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => handlePickVersion(v.version)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-bg-card flex items-center justify-between gap-2"
              >
                <span className="font-medium text-ink">v{v.version}</span>
                {v.label && <span className="text-xs text-ink-muted truncate">{v.label}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeSessionId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(activeSessionId)}
          className="text-ink-muted hover:text-error p-1 shrink-0"
          title="Delete Session"
        >
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
