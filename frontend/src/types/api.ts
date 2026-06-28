export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  initialNodeId: string;
  currentVersion: string;
  createdBy: string;
  inputContract: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  agentId: string;
  version: string;
  userId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  agentId: string;
  version: string;
  label: string | null;
  createdAt: string;
}

export interface CreateAgentPayload {
  name: string;
  description?: string;
  initialNodeId: string;
  inputContract?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SendMessagePayload {
  message: string | null;
  initialContext?: Record<string, unknown>;
}
