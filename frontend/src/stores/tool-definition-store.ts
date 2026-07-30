import { create } from 'zustand';
import type { ToolDefinition, CreateToolPayload, UpdateToolPayload } from '@/types/api';
import { apiClient } from '@/lib/api-client';

interface ToolDefinitionState {
  tools: ToolDefinition[];
  isLoading: boolean;
  error: string | null;

  fetchTools: () => Promise<void>;
  createTool: (data: CreateToolPayload) => Promise<void>;
  updateTool: (toolId: string, data: UpdateToolPayload) => Promise<void>;
  deleteTool: (toolId: string) => Promise<void>;
}

export const useToolDefinitionStore = create<ToolDefinitionState>((set, get) => ({
  tools: [],
  isLoading: false,
  error: null,

  fetchTools: async () => {
    set({ isLoading: true, error: null });
    try {
      const tools = await apiClient.getToolDefinitions();
      set({ tools, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createTool: async (data) => {
    try {
      const tool = await apiClient.createToolDefinition(data);
      set({ tools: [tool, ...get().tools] });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  updateTool: async (toolId, data) => {
    try {
      const updated = await apiClient.updateToolDefinition(toolId, data);
      set({ tools: get().tools.map((t) => (t.id === toolId ? updated : t)) });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteTool: async (toolId) => {
    try {
      await apiClient.deleteToolDefinition(toolId);
      set({ tools: get().tools.filter((t) => t.id !== toolId) });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },
}));
