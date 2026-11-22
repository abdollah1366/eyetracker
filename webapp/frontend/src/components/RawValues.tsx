import { formatDecimal, formatPercent } from '../lib/format';
import type { Features, QualityReport } from '../lib/types';

type Row = { label: string; value: string };

/**
 * Raw measurement values only — no model probability. Shown while the model is
 * forming (or alongside a real prediction) so the assessment never collapses
 * into a generic "not calculated" message when quality is actually valid.
 */
export function RawValues({
  quality,
  features,
}: {
  quality?: QualityReport | null;
  features?: Features | null;
}) {
  const qualityRows: Row[] = quality
    ? [
        { label: 'نسبت نگاه معتبر', value: formatPercent(quality.valid_gaze_ratio) },
        { label: 'نسبت ازدسترفتن ردیابی', value: formatPercent(quality.tracking_loss_ratio) },
        { label: 'میانگین روشنایی', value: formatDecimal(quality.mean_brightness, 1) },
        { label: 'ضریب تغییرات روشنایی', value: formatDecimal(quality.brightness_cv, 3) },
        { label: 'بیشترین وقفه ردیابی (ثانیه)', value: formatDecimal(quality.max_tracking_gap_s, 2) },
        {
          label: 'خطای کالیبراسیون (پیکسل)',
          value: quality.calibration_error_px != null
            ? formatDecimal(quality.calibration_error_px, 1)
            : '—',
        },
      ]
    : [];

  const featureRows: Row[] = features
    ? [
        { label: 'میانگین X نگاه', value: formatDecimal(features.gaze_x_mean, 1) },
        { label: 'میانگین Y نگاه', value: formatDecimal(features.gaze_y_mean, 1) },
        { label: 'انحراف معیار X', value: formatDecimal(features.gaze_x_std, 1) },
        { label: 'انحراف معیار Y', value: formatDecimal(features.gaze_y_std, 1) },
        { label: 'طول مسیر نگاه (پیکسل)', value: formatDecimal(features.scanpath_length_px, 0) },
        { label: 'میانگین گام نگاه (پیکسل)', value: formatDecimal(features.mean_gaze_step_px, 1) },
        { label: 'میانگین سرعت نگاه (پیکسل/ثانیه)', value: formatDecimal(features.mean_gaze_velocity_px_s, 0) },
        { label: 'تعداد تثبیتها (fixation)', value: formatDecimal(features.fixation_count, 0) },
        { label: 'میانگین مدت تثبیت (میلیثانیه)', value: formatDecimal(features.mean_fixation_ms, 0) },
        { label: 'تعداد پرشها (saccade)', value: formatDecimal(features.saccade_count, 0) },
      ]
    : [];

  const grid = (rows: Row[]) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <span className="text-[11px] text-ink-muted">{row.label}</span>
          <span className="nums text-xs font-bold text-ink">{row.value}</span>
        </div>
      ))}
    </div>
  );

  if (!qualityRows.length && !featureRows.length) return null;

  return (
    <div className="space-y-4">
      {qualityRows.length ? (
        <div>
          <p className="mb-2 text-xs font-bold text-ink">شاخصهای کیفیت داده</p>
          {grid(qualityRows)}
        </div>
      ) : null}
      {featureRows.length ? (
        <div>
          <p className="mb-2 text-xs font-bold text-ink">ویژگیهای استخراجشده از نگاه</p>
          {grid(featureRows)}
        </div>
      ) : null}
    </div>
  );
}
