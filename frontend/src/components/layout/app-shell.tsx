import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isEditorRoute = location.pathname.includes('/editor');

  return (
    <div className="flex h-screen bg-bg-soft">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className={cn('flex-1', isEditorRoute ? 'overflow-hidden' : 'overflow-auto p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
