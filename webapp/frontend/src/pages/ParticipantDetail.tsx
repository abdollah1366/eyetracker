import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, ClipboardList, FileText, Sparkles, User } from 'lucide-react';
import { asItems, participantsApi } from '../lib/api';
import { assessmentScores, codeLabel, formatDate, formatDateTime, formatDecimal, sexLabel } from '../lib/format';
import type { Assessment, Participant, Session } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { QualityBadge } from '../components/QualityBadge';
import { ParentRatingScale } from '../components/assessments/ParentRatingScale';

export function ParticipantDetail() {
  const { id } = useParams<{ id: string }>();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scaleOpen, setScaleOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.allSettled([
      participantsApi.get(id),
      participantsApi.sessions(id),
      participantsApi.assessments(id),
    ]).then(([p, s, a]) => {
      if (!active) return;
      if (p.status === 'fulfilled') setParticipant(p.value);
      if (s.status === 'fulfilled') setSessions(asItems(s.value));
      if (a.status === 'fulfilled') setAssessments(asItems(a.value));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const reloadAssessments = () => {
    if (!id) return;
    participantsApi.assessments(id).then((res) => setAssessments(asItems(res))).catch(() => undefined);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="در حال بارگذاری" />
      </div>
    );
  }

  if (!participant) {
    return <EmptyState title="دادهای ثبت نشده است" description="شرکتکننده یافت نشد." />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="نمایه شرکتکننده"
        title={`شناسه پژوهشی ${participant.research_id}`}
        subtitle="مشخصات، ارزیابیها و زمانبندی جلسات ثبتشده"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button leftIcon={<Sparkles size={17} />} onClick={() => setScaleOpen(true)}>
              تست والدین (SNAP-IV)
            </Button>
            <Link
              to={`/assessments?participant=${participant.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              <ClipboardList size={18} className="flip-rtl" /> ثبت ارزیابی
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* profile */}
        <Card>
          <CardHeader title="مشخصات" action={<User size={18} className="text-ink-subtle" />} />
          <dl className="space-y-3 text-xs">
            {[
              ['شناسه پژوهشی', participant.research_id, true],
              ['سن', `${participant.age} سال`, true],
              ['سال تولد', String(participant.birth_year), true],
              ['جنسیت', sexLabel(participant.sex), false],
              ['تاریخ عضویت', formatDate(participant.created_at), false],
            ].map(([label, value, numeric]) => (
              <div key={String(label)} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                <dt className="text-ink-muted">{label}</dt>
                <dd className={`font-bold text-ink ${numeric ? 'nums' : ''}`} dir={numeric ? 'ltr' : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={participant.consent_guardian ? 'success' : 'warning'} dot>
              رضایت سرپرست
            </Badge>
            <Badge tone={participant.consent_assent ? 'success' : 'warning'} dot>
              رضایت کودک
            </Badge>
          </div>
        </Card>

        {/* assessments */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="ارزیابیها"
            subtitle="نتایج ثبتشده پرسشنامه والدین، کانرز و IVA-2"
            action={<ClipboardList size={18} className="text-ink-subtle" />}
          />
          {assessments.length === 0 ? (
            <EmptyState compact icon={<FileText size={22} />} title="دادهای ثبت نشده است" description="هیچ ارزیابیی برای این شرکتکننده ثبت نشده است." />
          ) : (
            <div className="space-y-3">
              {assessments.map((a) => {
                const scores = assessmentScores(a);
                const subscales = scores.subscales as
                  | Record<string, { mean: number; severity_fa: string; severity_code: string }>
                  | undefined;
                const isParentRating = a.kind === 'PARENT_RATING' && Boolean(subscales);
                return (
                  <div key={a.id} className="rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">{codeLabel(a.kind)} — {a.version}</p>
                          <p className="text-[11px] text-ink-muted">{formatDate(a.assessed_at)}</p>
                        </div>
                      </div>
                      {!isParentRating ? (
                        <Badge tone="info">{Object.keys(scores).length} شاخص</Badge>
                      ) : null}
                    </div>
                    {isParentRating && subscales ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ['inattention', 'عدم توجه'],
                          ['hyperactivity', 'بیشفعالی'],
                          ['odd', 'نافرمانی'],
                          ['adhd_total', 'مجموع ADHD'],
                        ].map(([key, label]) => {
                          const row = subscales[key];
                          if (!row) return null;
                          const tone = row.severity_code === 'elevated' ? 'error' : row.severity_code === 'borderline' ? 'warning' : 'success';
                          return (
                            <div key={key} className="rounded-lg border border-border/60 bg-surface px-3 py-2">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-semibold text-ink-muted">{label}</span>
                                <Badge tone={tone}>{row.severity_fa}</Badge>
                              </div>
                              <p className="nums mt-1 text-lg font-bold text-ink" dir="ltr">{formatDecimal(row.mean, 2)}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* sessions timeline */}
      <Card className="mt-5">
        <CardHeader title="زمانبندی جلسات" subtitle="تمام جلسات ردیابی چشم این شرکتکننده" />
        {sessions.length === 0 ? (
          <EmptyState compact icon={<CalendarDays size={22} />} title="دادهای ثبت نشده است" description="هیچ جلسهای برای این شرکتکننده ثبت نشده است." />
        ) : (
          <ol className="relative space-y-4 pr-6">
            <span className="absolute right-[9px] top-2 h-[calc(100%-16px)] w-px bg-border" />
            {[...sessions]
              .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
              .map((s) => (
                <li key={s.id} className="relative">
                  <span className="absolute -right-6 top-1.5 h-4 w-4 rounded-full border-4 border-canvas bg-primary" />
                  <Link
                    to={`/sessions/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/30"
                  >
                    <div>
                      <p className="nums text-xs font-bold text-ink">جلسه #{s.id} — {codeLabel(s.label)}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{formatDateTime(s.started_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <QualityBadge status={s.status} quality={s.quality} />
                      <ArrowRight size={16} className="text-ink-subtle flip-rtl" />
                    </div>
                  </Link>
                </li>
              ))}
          </ol>
        )}
      </Card>

      <ParentRatingScale
        open={scaleOpen}
        participantId={participant.id}
        participantLabel={participant.research_id}
        onClose={() => setScaleOpen(false)}
        onSaved={() => {
          reloadAssessments();
          toast.success('نتیجه پرسشنامه والدین در پرونده مراجع ذخیره شد.');
        }}
      />
    </div>
  );
}
