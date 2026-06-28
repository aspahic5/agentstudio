interface PhaseBadgeProps {
  name: string;
}

export function PhaseBadge({ name }: PhaseBadgeProps) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-border-light" />
      <span className="text-xs text-ink-muted bg-bg-card px-3 py-1 rounded-md">
        {name}
      </span>
      <div className="flex-1 h-px bg-border-light" />
    </div>
  );
}
