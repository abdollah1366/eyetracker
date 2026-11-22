import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileBarChart2, Layers, ListChecks } from 'lucide-react';
import { api, asItems, reportsApi, sessionsApi } from '../lib/api';
import { codeLabel, formatDateTime, formatDecimal, formatPercent } from '../lib/format';
import type { Session, SessionEvent, SessionReport } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Heatmap } from '../components/gaze/Heatmap';
import { NotCalculated, QualityBadge } from '../components/QualityBadge';
import { ModelPending, ModelPendingBadge } from '../components/ModelPending';
import { RawValues } from '../components/RawValues';

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.allSettled([
      sessionsApi.get(id),
      reportsApi.session(id),
      sessionsApi.events(id),
    ]).then(([s, r, e]) => {
      if (!active) return;
      if (s.status === 'fulfilled') setSession(s.value);
      if (r.status === 'fulfilled') setReport(r.value);
      if (e.status === 'fulfilled') setEvents(asItems(e.value));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="در حال بارگذاری گزارش" /></div>;
  }

  if (!session) {
    return <EmptyState title="دادهای ثبت نشده است" description="جلسه یافت نشد." />;
  }

  const qualityValid = session.quality?.status === 'VALID';
  const riskAllowed = qualityValid && session.risk != null && session.risk.probability != null;
  const features = session.features;

  // PDFs require the Bearer token, so fetch through the authenticated axios
  // instance and open a temporary object URL instead of a bare <a href>.
  const openPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get<Blob>(`/reports/session/${session.id}.pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={`جلسه #${session.id}`}
        title="گزارش جلسه ردیابی چشم"
        subtitle={`گروه ${codeLabel(session.label)} — ${formatDateTime(session.started_at)}`}
        actions={
          <button
            type="button"
            onClick={openPdf}
            disabled={pdfLoading}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={18} className="flip-rtl" /> {pdfLoading ? 'در حال تهیه…' : 'خروجی PDF'}
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="وضعیت جلسه" />
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">کیفیت</span>
              <QualityBadge status={session.status} quality={session.quality} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">گروه</span>
              <span className="font-bold text-ink">{codeLabel(session.label)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">مجموعه محرک</span>
              <span className="nums font-bold text-ink" dir="ltr">{session.stimulus_set}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">اندازه صفحه</span>
              <span className="nums font-bold text-ink" dir="ltr">{session.screen_width}×{session.screen_height}</span>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="شاخصهای کیفیت" subtitle="مقادیر محاسبهشده توسط سامانه" />
          {session.quality ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['نسبت نگاه معتبر', formatPercent(session.quality.valid_gaze_ratio)],
                ['نسبت ازدسترفتن ردیابی', formatPercent(session.quality.tracking_loss_ratio)],
                ['حداکثر وقفه (ثانیه)', formatDecimal(session.quality.max_tracking_gap_s, 2)],
                ['خطای کالیبراسیون (px)', formatDecimal(session.quality.calibration_error_px, 1)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
                  <p className="text-[10px] text-ink-muted">{label}</p>
                  <p className="nums mt-1 text-base font-extrabold text-ink">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="دادهای ثبت نشده است" description="گزارش کیفیتی موجود نیست." />
          )}
          {session.quality?.reasons?.length ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft/50 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-ink">
                <ListChecks size={14} /> دلایل کیفیت
              </p>
              <ul className="list-disc space-y-1 pr-5 text-[11px] text-ink-muted">
                {session.quality.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      {/* heatmap */}
      <Card className="mt-5">
        <CardHeader title="نقشه حرارتی نگاه" subtitle="توزیع نقاط نگاه بر روی محرکها" action={<Layers size={18} className="text-ink-subtle" />} />
        <Heatmap sessionId={session.id} screenWidth={session.screen_width} screenHeight={session.screen_height} />
      </Card>

      {/* features */}
      <Card className="mt-5">
        <CardHeader title="ویژگیهای استخراجشده" subtitle="محاسبهشده توسط استخراجکننده ویژگی" />
        {features ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(features)
              .filter(([key]) => !key.endsWith('_version'))
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3" dir="ltr">
                  <span className="text-[11px] font-medium text-ink-muted">{key}</span>
                  <span className="nums text-xs font-bold text-ink">
                    {typeof value === 'number' ? formatDecimal(value, 3) : Array.isArray(value) ? value.length : '—'}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState compact title="دادهای ثبت نشده است" description="هیچ ویژگی استخراج نشده است." />
        )}
      </Card>

      {/* risk + XAI — only when quality VALID and a real model exists.
          Until the 100-participant cohort is complete we show progress + raw
          values instead of an error-like "not calculated" message. */}
      <Card className="mt-5">
        <CardHeader title="نتیجه مدل و تفسیر" subtitle="احتمال تنها پس از تکمیل مدل و کیفیت معتبر نمایش داده میشود" />
        {riskAllowed ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
              <div>
                <p className="text-xs font-bold text-ink">احتمال پیشبینی</p>
                <p className="nums mt-1 text-3xl font-extrabold text-primary">{formatPercent(session.risk!.probability)}</p>
              </div>
              <div className="mr-auto text-left">
                <Badge tone="primary">نسخه {session.risk!.version}</Badge>
                {session.risk!.created_at ? (
                  <p className="mt-1 text-[11px] text-ink-muted">{formatDateTime(session.risk!.created_at)}</p>
                ) : null}
              </div>
            </div>
            {session.risk?.xai?.length ? (
              <div>
                <p className="mb-3 text-xs font-bold text-ink">مشارکت ویژگیها (XAI)</p>
                <div className="space-y-2">
                  {session.risk.xai.map((x, i) => (
                    <div key={`${x.feature}-${i}`} className="flex items-center gap-3" dir="ltr">
                      <span className="w-44 shrink-0 truncate text-[11px] text-ink-muted">{x.feature}</span>
                      <div className="h-2 flex-1 rounded-pill bg-surface-2">
                        <div
                          className={`h-full rounded-pill ${x.contribution >= 0 ? 'bg-primary' : 'bg-error'}`}
                          style={{ width: `${Math.min(100, Math.abs(x.contribution) * 100)}%` }}
                        />
                      </div>
                      <span className="nums w-14 text-left text-[11px] font-bold text-ink">{formatDecimal(x.contribution, 3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {session.risk?.disclaimer ? (
              <p className="text-[11px] text-ink-subtle">{session.risk.disclaimer}</p>
            ) : null}
          </div>
        ) : qualityValid ? (
          <div className="space-y-5">
            <ModelPending compact />
            <p className="text-[11px] text-ink-muted">
              تا این مرحله تنها مقادیر خام کیفیت و ویژگیها ارائه میشود؛ احتمال پیشبینی محاسبه نمیشود.
            </p>
            <RawValues quality={session.quality} features={features} />
          </div>
        ) : (
          <NotCalculated reason="کیفیت جلسه معتبر نیست؛ احتمال و ویژگیهای مدل محاسبه نمیشود." />
        )}
      </Card>

      {/* report sections */}
      <Card className="mt-5">
        <CardHeader title="گزارش ساختاریافته" subtitle="بخشهای دهگانه فصل سوم" action={<FileBarChart2 size={18} className="text-ink-subtle" />} />
        {report?.sections?.length ? (
          <div className="space-y-5">
            {report.sections.map((section, i) => {
              // Accept {items,note}, string content, and the backend's raw
              // {content,status} object shape (with its pending message).
              const content = section.content as unknown;
              const obj = content != null && typeof content === 'object' && !Array.isArray(content)
                ? (content as Record<string, unknown>)
                : null;
              const message = obj && typeof obj.message === 'string'
                ? obj.message
                : obj && typeof obj.text === 'string'
                  ? obj.text
                  : undefined;
              const pending = section.status === 'PENDING';
              // Pending sections show the explanatory message as prose; hide
              // internal bookkeeping fields such as status/features.
              const rows = pending
                ? []
                : section.items?.length
                  ? section.items
                  : Array.isArray(content)
                    ? (content as Array<{ label: string; value?: string | number | null }>)
                    : obj
                      ? Object.entries(obj)
                          .filter(([key, value]) =>
                            key !== 'features' && key !== 'xai' && key !== 'contributions' &&
                            value !== null && typeof value !== 'object'
                          )
                          .map(([key, value]) => ({ label: key, value: String(value) }))
                      : [];
              const prose = rows.length
                ? undefined
                : typeof content === 'string'
                  ? content
                  : message ?? section.note;
              const notCalculated = section.status === 'NOT_CALCULATED';
              return (
                <div key={section.key ?? i} className="rounded-xl border border-border/70 bg-surface-2/30 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold text-primary">
                    <span className="nums flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[10px]">{i + 1}</span>
                    {section.title}
                    {pending ? (
                      <span className="mr-auto"><ModelPendingBadge /></span>
                    ) : notCalculated ? (
                      <Badge tone="warning" className="mr-auto">محاسبه نشد</Badge>
                    ) : null}
                  </h4>
                  {rows.length ? (
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {rows.map((item, j) => (
                        <div key={j} className="flex items-center justify-between gap-3 text-[11px]">
                          <dt className="text-ink-muted">{item.label}</dt>
                          <dd className="font-bold text-ink">{item.value ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-[11px] text-ink-subtle">{prose ?? 'دادهای ثبت نشده است'}</p>
                  )}
                </div>
              );
            })}
            {report.limitations ? (
              <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-4 text-[11px] leading-6 text-ink-muted">
                <strong className="text-ink">محدودیتها: </strong>{report.limitations}
              </div>
            ) : null}
            {report.conclusion ? (
              <div className="rounded-xl border border-primary/20 bg-primary-soft/40 p-4 text-[11px] leading-6 text-ink-muted">
                <strong className="text-ink">نتیجه: </strong>{report.conclusion}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState compact title="دادهای ثبت نشده است" description="گزارش ساختاریافته این جلسه در دسترس نیست." />
        )}
      </Card>

      {/* event log */}
      <Card className="mt-5">
        <CardHeader title="رویدادهای جلسه" subtitle="شروع و پایان محرکها و خطاها" />
        {events.length === 0 ? (
          <EmptyState compact title="دادهای ثبت نشده است" description="رویدادهایی ثبت نشده است." />
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-[11px]" dir="ltr">
                <span className="font-semibold text-ink">{e.type}</span>
                <span className="text-ink-muted">{formatDateTime(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 text-center">
        <Link to="/participants" className="text-xs font-semibold text-primary hover:underline">بازگشت به لیست شرکتکنندگان</Link>
      </div>
    </div>
  );
}
