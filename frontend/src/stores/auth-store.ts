import { create } from 'zustand';
import type { User } from '@/types/api';
import { apiClient } from '@/lib/api-client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ error: null, isLoading: true });
    try {
      const res = await apiClient.login(email, password);
      apiClient.setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  register: async (email, name, password) => {
    set({ error: null, isLoading: true });
    try {
      const res = await apiClient.register(email, name, password);
      apiClient.setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    apiClient.clearTokens();
    set({ user: null, error: null });
  },

  initialize: async () => {
    const hasToken = localStorage.getItem('auth-access-token');
    if (!hasToken) {
      set({ isLoading: false });
      return;
    }
    try {
      const user = await apiClient.getMe();
      set({ user, isLoading: false });
    } catch {
      apiClient.clearTokens();
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
