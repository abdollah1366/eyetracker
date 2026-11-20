import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  loading = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'primary' | 'success' | 'info' | 'warning' | 'accent' | 'neutral';
  loading?: boolean;
}) {
  const toneMap = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning',
    accent: 'bg-accent-soft text-accent',
    neutral: 'bg-surface-2 text-ink-muted',
  }[tone];

  return (
    <div className="rounded-card bg-surface border border-border/80 p-5 card-shadow card-shadow-hover transition-shadow duration-200 ease-clinical">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink-muted">{label}</p>
          {loading ? (
            <div className="skeleton mt-2 h-8 w-20 rounded-md" />
          ) : (
            <p className="nums mt-1 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
          )}
          {hint ? <p className="mt-1 text-[11px] text-ink-subtle">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneMap}`}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
