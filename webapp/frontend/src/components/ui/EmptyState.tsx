import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'دادهای ثبت نشده است',
  description,
  icon,
  action,
  compact = false,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'min-h-[220px] px-4 py-10' : 'min-h-[340px] px-6 py-16',
      ].join(' ')}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        {icon ?? <Inbox size={26} strokeWidth={1.6} />}
      </div>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-xs leading-6 text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
