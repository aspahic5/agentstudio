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
  initialNodeId: string | null;
  currentVersion: string | null;
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
  label: string | null;
  createdAt: string;
  updatedAt: string;
  hasSnapshot: boolean;
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
  inputContract?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SendMessagePayload {
  message: string | null;
  initialContext?: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  urlTemplate: string;
  method: string;
  headers: Record<string, string> | null;
  bodyTemplate: string | null;
  responsePath: string | null;
  authType: string | null;
  parametersSchemaJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateToolPayload {
  name: string;
  description: string;
  urlTemplate?: string;
  method?: string;
  headers?: Record<string, string> | null;
  bodyTemplate?: string | null;
  responsePath?: string | null;
  authType?: string | null;
  parametersSchemaJson?: Record<string, unknown> | null;
}

export type UpdateToolPayload = Partial<CreateToolPayload>;
