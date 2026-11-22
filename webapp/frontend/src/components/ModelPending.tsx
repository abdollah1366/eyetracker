import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { modelsApi } from '../lib/api';
import { enNumber } from '../lib/format';
import type { ModelReadiness } from '../lib/types';

/**
 * Neutral "model forming" state shown for VALID sessions before the research
 * cohort reaches 100 labelled participants. It is NOT an error: only the risk
 * probability is withheld; all raw quality/feature values remain visible.
 */
export function ModelPending({
  readiness: provided,
  compact = false,
}: {
  readiness?: ModelReadiness | null;
  compact?: boolean;
}) {
  const [fetched, setFetched] = useState<ModelReadiness | null>(null);
  const data = provided ?? fetched;

  useEffect(() => {
    if (provided) return;
    let active = true;
    modelsApi
      .readiness()
      .then((res) => {
        if (active) setFetched(res);
      })
      .catch(() => {
        /* keep the static message if readiness cannot be loaded */
      });
    return () => {
      active = false;
    };
  }, [provided]);

  const labeled = data?.labeled_participants ?? 0;
  const required = data?.required_participants ?? 100;
  const pct = data ? Math.max(0, Math.min(100, data.progress * 100)) : 0;

  return (
    <div className="rounded-xl border border-info bg-info-soft p-4">
      <div className="flex items-start gap-3">
        <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-info" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">مدل در حال شکلگیری است</p>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            {data?.message ??
              'تا تکمیل ۱۰۰ مراجع دارای برچسب، احتمال پیشبینی محاسبه نمیشود و فقط مقادیر خام ارزیابی نمایش داده میشود.'}
          </p>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
              <span>پیشرفت تکمیل مدل</span>
              <span className="nums" dir="ltr">
                {enNumber(labeled)} / {enNumber(required)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-2">
              <div
                className="h-full rounded-pill bg-info transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {!compact ? (
              <p className="mt-2 text-[11px] text-ink-subtle">
                {enNumber(Math.max(0, required - labeled))} مراجع دیگر تا آغاز محاسبه احتمال باقی مانده است.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small badge used in the report section header for a pending model section. */
export function ModelPendingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-info bg-info-soft px-2.5 py-0.5 text-[11px] font-semibold text-info">
      <Loader2 size={12} />
      در انتظار تکمیل مدل
    </span>
  );
}
