import { NavLink } from 'react-router';
import { LayoutGrid, LogOut, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: '/agents', label: 'Agents', icon: LayoutGrid },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();

  return (
    <>
      {/* Overlay on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-full bg-white border-r border-border-light z-50 flex flex-col transition-transform duration-200',
          'w-60',
          // Mobile: hidden by default, slide in when open
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop (>=980px): always visible
          'min-[980px]:translate-x-0 min-[980px]:static',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-border-light">
          <h1 className="font-heading text-lg text-ink font-semibold">Agent Studio</h1>
          <button onClick={onClose} className="min-[980px]:hidden text-ink-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-bg-card text-primary font-medium border-l-3 border-primary'
                    : 'text-ink-muted hover:text-ink hover:bg-bg-card/50',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border-light p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{user?.name}</p>
              <p className="text-xs text-ink-muted truncate">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="text-ink-muted hover:text-error transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
