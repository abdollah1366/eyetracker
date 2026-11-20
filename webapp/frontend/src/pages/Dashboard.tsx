import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpLeft,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { asItems, modelsApi, participantsApi, sessionsApi } from '../lib/api';
import { codeLabel, enNumber, formatDateTime } from '../lib/format';
import type { ModelVersion, Participant, Session } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardHeader } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { QualityBadge } from '../components/QualityBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';

const QUALITY_COLORS: Record<string, string> = {
  VALID: '#15793A',
  INVALID: '#BF2222',
  COLLECTING: '#D08A11',
  COMPLETED: '#0E7490',
};

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      sessionsApi.list(),
      participantsApi.list({ limit: 1000 }),
      modelsApi.list(),
    ]).then(([s, p, m]) => {
      if (!active) return;
      if (s.status === 'fulfilled') setSessions(asItems(s.value));
      if (p.status === 'fulfilled') setParticipants(asItems(p.value));
      if (m.status === 'fulfilled') setModels(asItems(m.value));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const validCount = sessions.filter((s) => s.quality?.status === 'VALID' || s.status === 'VALID').length;
  const invalidCount = sessions.filter((s) => s.quality?.status === 'INVALID' || s.status === 'INVALID').length;
  const collectingCount = sessions.filter((s) => s.status === 'COLLECTING').length;

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (!s.started_at) continue;
      const key = new Date(s.started_at).toLocaleDateString('fa-IR', {
        month: 'numeric',
        day: 'numeric',
      });
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
  }, [sessions]);

  const qualityData = useMemo(
    () =>
      [
        { name: 'معتبر', value: validCount, key: 'VALID' },
        { name: 'نامعتبر', value: invalidCount, key: 'INVALID' },
        { name: 'در حال جمعآوری', value: collectingCount, key: 'COLLECTING' },
      ].filter((d) => d.value > 0),
    [validCount, invalidCount, collectingCount],
  );

  const recent = useMemo(
    () => [...sessions].sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')).slice(0, 6),
    [sessions],
  );

  const columns: Column<Session>[] = [
    {
      key: 'id',
      header: 'شناسه جلسه',
      render: (row) => (
        <Link to={`/sessions/${row.id}`} className="nums font-bold text-primary hover:underline">
          #{row.id}
        </Link>
      ),
    },
    { key: 'label', header: 'گروه', render: (row) => codeLabel(row.label) },
    {
      key: 'quality',
      header: 'کیفیت',
      render: (row) => <QualityBadge status={row.status} quality={row.quality} />,
    },
    {
      key: 'started_at',
      header: 'زمان شروع',
      render: (row) => <span className="text-xs text-ink-muted">{formatDateTime(row.started_at)}</span>,
      hideBelow: 'md',
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="نمای کلی"
        title="داشبورد"
        subtitle="خلاصهای از وضعیت جلسات، شرکتکنندگان و مدلهای ثبتشده در سامانه."
        actions={
          <Link
            to="/sessions/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Eye size={18} className="flip-rtl" /> جلسه جدید
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="کل جلسات"
          value={loading ? '—' : enNumber(sessions.length)}
          icon={<Activity size={20} />}
          loading={loading}
          tone="primary"
        />
        <StatCard
          label="شرکتکنندگان"
          value={loading ? '—' : enNumber(participants.length)}
          icon={<Users size={20} />}
          loading={loading}
          tone="info"
        />
        <StatCard
          label="جلسات معتبر"
          value={loading ? '—' : enNumber(validCount)}
          hint={sessions.length ? `${Math.round((validCount / sessions.length) * 100)}٪ از کل` : undefined}
          icon={<CheckCircle2 size={20} />}
          loading={loading}
          tone="success"
        />
        <StatCard
          label="نسخههای مدل"
          value={loading ? '—' : enNumber(models.length)}
          icon={<BrainCircuit size={20} />}
          loading={loading}
          tone="accent"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="روند ثبت جلسات" subtitle="تعداد جلسات بر اساس تاریخ شروع" />
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : sessionsByDay.length === 0 ? (
            <EmptyState compact title="دادهای ثبت نشده است" description="با ثبت اولین جلسه، نمودار نمایش داده میشود." />
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionsByDay} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9EA" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5d6769' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5d6769' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #D6DADC', fontSize: 12 }}
                    cursor={{ fill: '#E0F2F6' }}
                  />
                  <Bar dataKey="count" name="جلسات" fill="#0E7490" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="توزیع کیفیت" subtitle="وضعیت درجهبندی کیفیت جلسات" />
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : qualityData.length === 0 ? (
            <EmptyState compact title="دادهای ثبت نشده است" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={qualityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {qualityData.map((entry) => (
                      <Cell key={entry.key} fill={QUALITY_COLORS[entry.key] ?? '#0E7490'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #D6DADC', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5" padding="none">
        <div className="flex items-center justify-between px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-bold text-ink">جلسات اخیر</h3>
            <p className="mt-1 text-xs text-ink-muted">آخرین جلسات ثبتشده</p>
          </div>
          <Link
            to="/participants"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            مشاهده همه <ArrowUpLeft size={15} className="flip-rtl" />
          </Link>
        </div>
        <Table
          columns={columns}
          data={recent}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="دادهای ثبت نشده است"
          emptyDescription="هنوز جلسهای ثبت نشده است."
          onRowClick={(row) => (window.location.href = `/sessions/${row.id}`)}
        />
      </Card>
    </div>
  );
}
