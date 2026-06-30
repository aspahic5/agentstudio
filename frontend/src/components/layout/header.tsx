import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';

interface HeaderProps {
  onMenuClick: () => void;
}

const routeLabels: Record<string, string> = {
  '/agents': 'Agents',
};

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();

  const label = routeLabels[location.pathname]
    || (location.pathname.includes('/editor') ? 'Editor' : '')
    || (location.pathname.includes('/chat') ? 'Chat' : '');

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-border-light bg-white sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="min-[980px]:hidden text-ink-muted hover:text-ink"
      >
        <Menu size={20} />
      </button>
      <span className="text-sm font-medium text-ink-muted">{label}</span>
    </header>
  );
}
