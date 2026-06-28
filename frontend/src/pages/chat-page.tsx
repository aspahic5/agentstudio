import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { Agent } from '@/types/api';
import { apiClient } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TestChat } from '@/components/chat/test-chat';

export function ChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    apiClient.getAgent(agentId)
      .then(setAgent)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (!agentId) {
    return <div className="p-6 text-ink-muted">No agent selected</div>;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[calc(100vh-12rem)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-error/10 text-error rounded-lg p-4 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {agent && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
          <h1 className="font-heading text-lg text-ink">{agent.name}</h1>
          <Badge variant="secondary" className="text-xs bg-bg-card text-ink-muted">
            v{agent.currentVersion}
          </Badge>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <TestChat agentId={agentId} />
      </div>
    </div>
  );
}
