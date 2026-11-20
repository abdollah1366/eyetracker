import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

const hideClasses = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

const alignClasses = {
  start: 'text-right',
  center: 'text-center',
  end: 'text-left',
};

export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyTitle = 'دادهای ثبت نشده است',
  emptyDescription,
  emptyIcon,
  onRowClick,
  className = '',
}: {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <Spinner label="در حال بارگذاری" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        compact
      />
    );
  }

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={[
                  'px-4 py-3 text-[11px] font-bold text-ink-muted whitespace-nowrap',
                  alignClasses[col.align ?? 'start'],
                  col.hideBelow ? hideClasses[col.hideBelow] : '',
                  col.className ?? '',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[
                'border-b border-border/60 transition-colors duration-150 last:border-0',
                onRowClick ? 'cursor-pointer hover:bg-primary-soft/50' : 'hover:bg-surface-2/40',
              ].join(' ')}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    'px-4 py-3.5 align-middle text-ink',
                    alignClasses[col.align ?? 'start'],
                    col.hideBelow ? hideClasses[col.hideBelow] : '',
                    col.className ?? '',
                  ].join(' ')}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as unknown as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
