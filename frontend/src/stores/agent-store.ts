import { create } from 'zustand';
import type { Agent, CreateAgentPayload } from '@/types/api';
import { apiClient } from '@/lib/api-client';

interface AgentState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  createAgent: (data: CreateAgentPayload) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const agents = await apiClient.getAgents();
      set({ agents, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createAgent: async (data) => {
    const agent = await apiClient.createAgent(data);
    set((s) => ({ agents: [agent, ...s.agents] }));
    return agent;
  },

  deleteAgent: async (agentId) => {
    await apiClient.deleteAgent(agentId);
    set((s) => ({ agents: s.agents.filter((a) => a.id !== agentId) }));
  },
}));
