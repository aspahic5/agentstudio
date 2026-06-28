import type { AuthResponse, User, Agent, CreateAgentPayload, Session } from '@/types/api';

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  onAuthFailure: (() => void) | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('auth-access-token');
    this.refreshToken = localStorage.getItem('auth-refresh-token');
  }

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('auth-access-token', access);
    localStorage.setItem('auth-refresh-token', refresh);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('auth-access-token');
    localStorage.removeItem('auth-refresh-token');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let res = await fetch(path, { ...options, headers });

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers.set('Authorization', `Bearer ${this.accessToken}`);
        res = await fetch(path, { ...options, headers });
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
      (error as { status?: number }).status = res.status;
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
        if (!res.ok) {
          this.clearTokens();
          this.onAuthFailure?.();
          return false;
        }
        const data = await res.json() as { accessToken: string; refreshToken: string };
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        this.clearTokens();
        this.onAuthFailure?.();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async fetchStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error((errBody as { error?: string }).error ?? `Stream failed: ${res.status}`);
    }
    return res;
  }

  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, name: string, password: string): Promise<AuthResponse> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });
  }

  async getMe(): Promise<User> {
    return this.request('/api/auth/me');
  }

  // Agents
  async getAgents(): Promise<Agent[]> {
    return this.request('/api/agents');
  }

  async getAgent(id: string): Promise<Agent> {
    return this.request(`/api/agents/${encodeURIComponent(id)}`);
  }

  async createAgent(data: CreateAgentPayload): Promise<Agent> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // Sessions
  async createSession(agentId: string, version?: string): Promise<Session> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  }

  async getSessions(agentId: string): Promise<Session[]> {
    return this.request(`/api/agents/${encodeURIComponent(agentId)}/sessions`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  }

  // Messages (SSE stream)
  async sendMessage(sessionId: string, message: string | null, initialContext?: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    return this.fetchStream(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      { message, ...(initialContext && { initialContext }) },
      signal,
    );
  }
}

export const apiClient = new ApiClient();
