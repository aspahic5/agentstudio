import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agent-store';
import { AgentCard } from '@/components/agents/agent-card';
import { CreateAgentDialog } from '@/components/agents/create-agent-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function AgentListPage() {
  const { agents, isLoading, error, fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl text-ink">Agents</h1>
        <CreateAgentDialog />
      </div>

      {error && (
        <div className="bg-error/10 text-error rounded-lg p-4 mb-6 flex items-center justify-between">
          <span className="text-sm">{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchAgents}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 min-[980px]:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-ink-muted mb-4">No agents yet</p>
          <CreateAgentDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 min-[980px]:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
