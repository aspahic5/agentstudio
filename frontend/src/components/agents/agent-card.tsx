import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MessageSquare, Trash2 } from 'lucide-react';
import type { Agent } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useAgentStore } from '@/stores/agent-store';

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();
  const { deleteAgent } = useAgentStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAgent(agent.id);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-soft hover:shadow-card transition-shadow p-5 flex flex-col">
        <h3 className="font-heading text-lg text-ink font-semibold">{agent.name}</h3>
        <p className="text-sm text-ink-muted mt-1 line-clamp-2 flex-1">
          {agent.description || 'No description'}
        </p>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
          <Badge variant="secondary" className="text-xs bg-bg-card text-ink-muted">
            v{agent.currentVersion}
          </Badge>
          <span className="text-xs text-ink-muted">
            {new Date(agent.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            className="flex-1 bg-primary hover:bg-primary-dark text-white"
            onClick={() => navigate(`/agents/${agent.id}/chat`)}
          >
            <MessageSquare size={14} className="mr-1.5" />
            Chat
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted hover:text-error hover:bg-error/5"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted">
            Are you sure you want to delete <strong>{agent.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
