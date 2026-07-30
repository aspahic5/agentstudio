import { createBrowserRouter, Navigate } from 'react-router';
import { AuthGuard } from '@/components/auth/auth-guard';
import { AppShell } from '@/components/layout/app-shell';
import { LoginPage } from '@/pages/login-page';
import { RegisterPage } from '@/pages/register-page';
import { AgentListPage } from '@/pages/agent-list-page';
import { ChatPage } from '@/pages/chat-page';
import { EditorPage } from '@/pages/editor-page';
import { ToolDefinitionsPage } from '@/pages/tool-definitions-page';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/agents" replace /> },
          { path: 'agents', element: <AgentListPage /> },
          { path: 'agents/:agentId/chat', element: <ChatPage /> },
          { path: 'agents/:agentId/editor', element: <EditorPage /> },
          { path: 'tools', element: <ToolDefinitionsPage /> },
        ],
      },
    ],
  },
]);
