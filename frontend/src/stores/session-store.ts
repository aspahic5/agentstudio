import { create } from 'zustand';
import type { Session } from '@/types/api';
import { apiClient } from '@/lib/api-client';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  fetchSessions: (agentId: string) => Promise<void>;
  createSession: (agentId: string, version?: string) => Promise<Session>;
  createDraftSession: (agentId: string, payload: { nodes: unknown[]; saConfigs: unknown[] }) => Promise<Session>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionLabel: (sessionId: string, label: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: false,

  fetchSessions: async (agentId) => {
    set({ isLoading: true });
    try {
      const sessions = await apiClient.getSessions(agentId);
      set({ sessions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createSession: async (agentId, version) => {
    const session = await apiClient.createSession(agentId, version);
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
    }));
    return session;
  },

  createDraftSession: async (agentId, payload) => {
    const session = await apiClient.createDraftSession(agentId, payload);
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
    }));
    return session;
  },

  deleteSession: async (sessionId) => {
    await apiClient.deleteSession(sessionId);
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== sessionId);
      const activeSessionId = s.activeSessionId === sessionId
        ? (sessions[0]?.id ?? null)
        : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  updateSessionLabel: async (sessionId, label) => {
    const updated = await apiClient.updateSessionLabel(sessionId, label);
    set((s) => ({
      sessions: s.sessions.map((sess) => sess.id === sessionId ? { ...sess, label: updated.label } : sess),
    }));
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
}));
