import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { codeLabel } from '../lib/format';
import type { QualityReport, QualityStatus } from '../lib/types';

/** Semantic status badge for a session's data-quality gate. */
export function QualityBadge({
  status,
  quality,
  showIcon = true,
}: {
  status?: QualityStatus | string | null;
  quality?: QualityReport | null;
  showIcon?: boolean;
}) {
  const resolved: QualityStatus | 'PENDING' =
    (quality?.status as QualityStatus) ??
    (status === 'VALID' || status === 'INVALID' ? status : 'PENDING');

  const config = {
    VALID: {
      cls: 'bg-success-soft text-success border-success/25',
      icon: <CheckCircle2 size={14} />,
      label: 'کیفیت معتبر',
    },
    INVALID: {
      cls: 'bg-error-soft text-error border-error/25',
      icon: <XCircle size={14} />,
      label: 'کیفیت نامعتبر',
    },
    PENDING: {
      cls: 'bg-warning-soft text-warning border-warning/25',
      icon: <AlertTriangle size={14} />,
      label: 'در انتظار ارزیابی',
    },
  }[resolved];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[11px] font-bold ${config.cls}`}
    >
      {showIcon ? config.icon : null}
      {config.label}
      {quality?.status ? (
        <span className="opacity-70">({codeLabel(quality.status)})</span>
      ) : null}
    </span>
  );
}

/** Honest placeholder only when data quality is genuinely invalid. */
export function NotCalculated({ reason }: { reason?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft/60 p-4">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
      <div>
        <p className="text-sm font-bold text-ink">محاسبه نشد – کیفیت داده کافی نیست</p>
        <p className="mt-1 text-xs leading-6 text-ink-muted">
          {reason ??
            'احتمال و نتیجه مدل تنها زمانی نمایش داده میشود که کیفیت داده معتبر و مدل موجود باشد.'}
        </p>
      </div>
    </div>
  );
}
