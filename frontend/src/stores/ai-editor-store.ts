import { create } from 'zustand';
import type { AIEditOperation, AIConversationMessage, AISuggestResponse } from '@/types/ai-editor';
import { apiClient } from '@/lib/api-client';
import { useFlowStore } from './flow-store';

interface AIEditorState {
  isOpen: boolean;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  conversationHistory: AIConversationMessage[];
  pendingOperations: AIEditOperation[] | null;
  pendingSummary: string | null;
  pendingValidation: { valid: boolean; violations: string[] } | null;
  isLoading: boolean;
  error: string | null;

  open: () => void;
  close: () => void;
  sendInstruction: (instruction: string) => Promise<void>;
  acceptOperations: () => void;
  rejectOperations: () => void;
  clearConversation: () => void;
}

export const useAIEditorStore = create<AIEditorState>((set, get) => ({
  isOpen: false,
  messages: [],
  conversationHistory: [],
  pendingOperations: null,
  pendingSummary: null,
  pendingValidation: null,
  isLoading: false,
  error: null,

  open: () => {
    set({ isOpen: true });
  },

  close: () => {
    const { pendingOperations } = get();
    if (pendingOperations) {
      useFlowStore.getState().clearNodeHighlights();
    }
    set({ isOpen: false });
  },

  sendInstruction: async (instruction: string) => {
    const { conversationHistory } = get();

    useFlowStore.getState().clearNodeHighlights();
    set({
      pendingOperations: null,
      pendingSummary: null,
      pendingValidation: null,
      messages: [
        ...get().messages,
        { role: 'user' as const, content: instruction },
      ],
      isLoading: true,
      error: null,
    });

    const flowState = useFlowStore.getState();

    if (!flowState.agentId || !flowState.agent) {
      set({
        isLoading: false,
        error: 'No agent loaded.',
        messages: [
          ...get().messages,
          { role: 'system' as const, content: 'No agent loaded.' },
        ],
      });
      return;
    }

    const request = {
      agent: {
        id: flowState.agentId,
        name: flowState.agent.name,
        initialNodeId: flowState.agent.initialNodeId,
        description: flowState.agent.description,
      },
      nodes: Array.from(flowState.agentNodes.values()).map((n) => ({
        id: n.id,
        name: n.name,
        nodeType: n.nodeType,
        semanticAgentConfigId: n.semanticAgentConfigId,
        phaseLabel: n.phaseLabel,
        progressWeight: n.progressWeight,
        configJson: n.configJson,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      saConfigs: Array.from(flowState.saConfigs.values()).map((c) => ({
        id: c.id,
        nodeId: c.nodeId,
        name: c.name,
        systemPrompt: c.systemPrompt,
        outputSchemaJson: c.outputSchemaJson,
        maxRetries: c.maxRetries,
        temperature: c.temperature,
        maxOutputTokens: c.maxOutputTokens,
        outputFormatting: c.outputFormatting,
        outputDensity: c.outputDensity,
        reasoningFormatting: c.reasoningFormatting,
        thinkingGuidance: c.thinkingGuidance,
        modelAlias: c.modelAlias,
      })),
      instruction,
      conversationHistory,
    };

    try {
      const response: AISuggestResponse = await apiClient.suggestEdit(request);

      const highlights = new Map<string, 'added' | 'modified' | 'removed'>();
      for (const op of response.operations) {
        switch (op.op) {
          case 'update_node':
          case 'update_sa_config':
          case 'add_transition':
          case 'update_transition':
          case 'remove_transition':
          case 'update_routing_rule':
          case 'add_routing_rule':
            highlights.set(op.nodeId, 'modified');
            break;
          case 'remove_node':
            highlights.set(op.nodeId, 'removed');
            break;
          // add_node has no existing nodeId to highlight
          // add_sa_config and update_agent do not correspond to a specific existing node to highlight
        }
      }

      useFlowStore.getState().setNodeHighlights(highlights);

      set({
        pendingOperations: response.operations,
        pendingSummary: response.summary,
        pendingValidation: response.validation,
        conversationHistory: response.conversationHistory,
        messages: [
          ...get().messages,
          { role: 'assistant' as const, content: response.summary },
        ],
        isLoading: false,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      set({
        isLoading: false,
        error: message,
        messages: [
          ...get().messages,
          { role: 'system' as const, content: message },
        ],
      });
    }
  },

  acceptOperations: () => {
    const { pendingOperations } = get();
    if (pendingOperations) {
      for (const op of pendingOperations) {
        useFlowStore.getState().applyAIOperation(op);
      }
    }
    useFlowStore.getState().clearNodeHighlights();
    set({
      pendingOperations: null,
      pendingSummary: null,
      pendingValidation: null,
    });
  },

  rejectOperations: () => {
    useFlowStore.getState().clearNodeHighlights();
    set({
      pendingOperations: null,
      pendingSummary: null,
      pendingValidation: null,
      messages: [
        ...get().messages,
        { role: 'system' as const, content: 'Changes rejected.' },
      ],
    });
  },

  clearConversation: () => {
    const { pendingOperations } = get();
    if (pendingOperations) {
      useFlowStore.getState().clearNodeHighlights();
    }
    set({
      messages: [],
      conversationHistory: [],
      pendingOperations: null,
      pendingSummary: null,
      pendingValidation: null,
      error: null,
    });
  },
}));
