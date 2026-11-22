import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BrainCircuit, Info, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { apiErrorMessage, asItems, modelsApi } from '../lib/api';
import { enNumber, formatDecimal, formatPercent } from '../lib/format';
import type { ModelMetrics, ModelVersion, XAIEntry } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

export function ModelLab() {
  const toast = useToast();
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [minSessions, setMinSessions] = useState(100);
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ModelVersion | null>(null);
  const [predictSession, setPredictSession] = useState('');
  const [prediction, setPrediction] = useState<{ risk: XAIEntry[]; probability: number | null; version: string; message?: string | null } | null>(null);
  const [predicting, setPredicting] = useState(false);

  const load = () => {
    setLoading(true);
    modelsApi
      .list()
      .then((res) => {
        const list = asItems(res);
        setVersions(list);
        if (list.length && !selected) setSelected(list[0].version);
      })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) {
      setMetrics(null);
      setCard(null);
      return;
    }
    modelsApi.get(selected).then(setCard).catch(() => setCard(null));
    const found = versions.find((v) => v.version === selected);
    if (found) setMetrics(found.metrics);
  }, [selected, versions]);

  const train = async () => {
    setTraining(true);
    try {
      const result = await modelsApi.train({ min_labeled_sessions: minSessions });
      setMetrics(result);
      toast.success('آموزش مدل با موفقیت انجام شد.');
      load();
      if (result?.model_version) setSelected(result.model_version);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setTraining(false);
    }
  };

  const predict = async () => {
    if (!selected || !predictSession) return;
    setPredicting(true);
    try {
      const res = await modelsApi.predict(selected, { session_id: predictSession });
      setPrediction({
        risk: res.xai ?? res.risk?.xai ?? [],
        probability: res.risk?.probability ?? null,
        version: res.version,
        message: res.message,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPredicting(false);
    }
  };

  const featureData = useMemoFeatureData(metrics);

  return (
    <div>
      <PageHeader
        eyebrow="یادگیری ماشین"
        title="آزمایشگاه مدل"
        subtitle="آموزش، ارزیابی و بررسی نسخههای مدل پیشبینی با اعتبارسنجی گروهی StratifiedGroupKFold."
        actions={
          <Button variant="accent" leftIcon={<Sparkles size={18} />} onClick={train} loading={training}>
            آموزش مدل
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* train controls */}
        <Card>
          <CardHeader title="پیکربندی آموزش" subtitle="آستانه حداقل جلسات برچسبخورده" />
          <Input
            label="حداقل جلسات برچسبخورده"
            type="number"
            min={1}
            dir="ltr"
            value={minSessions}
            onChange={(e) => setMinSessions(Number(e.target.value))}
            helper="تقسیمبندی بر اساس تعداد شرکتکنندگان (نه تعداد نمونهها) انجام میشود."
          />
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft/50 p-3">
            <Info size={16} className="mt-0.5 shrink-0 text-info" />
            <p className="text-[11px] leading-6 text-ink-muted">
              «brightness_cv» تنها بهعنوان ویژگی کیفیت شناخته میشود و وارد مدل پیشبینی نمیشود.
            </p>
          </div>
        </Card>

        {/* metrics */}
        <Card className="lg:col-span-2">
          <CardHeader title="متریکهای عملکرد" subtitle={metrics ? `نسخه ${metrics.model_version}` : 'هنوز مدلی آموزش دیده نشده است'} />
          {metrics ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['AUC', formatDecimal(metrics.auc, 3)],
                ['دقت', formatPercent(metrics.accuracy)],
                ['حساسیت', formatPercent(metrics.sensitivity)],
                ['ویژگی', formatPercent(metrics.specificity)],
                ['F1', formatDecimal(metrics.f1, 3)],
                ['تعداد شرکتکنندهها', enNumber(metrics.n_participants)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
                  <p className="text-[10px] text-ink-muted">{label}</p>
                  <p className="nums mt-1 text-lg font-extrabold text-ink">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="دادهای ثبت نشده است" description="پس از آموزش مدل، متریکها نمایش داده میشوند." />
          )}
        </Card>
      </div>

      {/* feature importance */}
      <Card className="mt-5">
        <CardHeader title="مشارکت ویژگیها" subtitle="اهمیت ویژگیها در مدل انتخابشده" />
        {featureData.length ? (
          <div dir="ltr" className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={featureData} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9EA" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#5d6769' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#5d6769' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #D6DADC', fontSize: 12 }} />
                <Bar dataKey="value" name="اهمیت" fill="#0E7490" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState compact title="دادهای ثبت نشده است" description="اطلاعات اهمیت ویژگیها موجود نیست." />
        )}
      </Card>

      {/* model versions */}
      <Card className="mt-5">
        <CardHeader title="نسخههای مدل" subtitle="تاریخچه نسخهها و متریک آنها" action={<BrainCircuit size={18} className="text-ink-subtle" />} />
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Spinner /></div>
        ) : versions.length === 0 ? (
          <EmptyState compact title="دادهای ثبت نشده است" description="هیچ نسخه مدلی آموزش دیده نشده است." />
        ) : (
          <div className="space-y-3">
            {versions.map((v) => (
              <button
                key={v.version}
                onClick={() => setSelected(v.version)}
                className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right transition-colors ${
                  selected === v.version
                    ? 'border-primary bg-primary-soft/50'
                    : 'border-border/70 bg-surface-2/40 hover:border-primary/40'
                }`}
              >
                <div>
                  <p className="nums text-xs font-bold text-ink" dir="ltr">{v.version}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{v.created_at ? new Date(v.created_at).toLocaleDateString('fa-IR') : '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="nums text-[11px] text-ink-muted">AUC {formatDecimal(v.metrics?.auc, 3)}</span>
                  {selected === v.version ? <Badge tone="primary">انتخابشده</Badge> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* calibration note + prediction */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="یادداشت کالیبراسیون" />
          <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft/50 p-4">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-6 text-ink-muted">
              احتمال مدل تنها پس از تکمیل ۱۰۰ مراجع برچسبخورده، آموزش مدل و کیفیت معتبر جلسه نمایش داده میشود.
              تا آن زمان تنها مقادیر خام کیفیت و ویژگیها ارائه میشود و نتیجه «نامعتبر» تلقی نمیشود.
            </p>
          </div>
          {card?.metrics?.calibration ? (
            <p className="nums mt-3 text-[11px] text-ink-muted" dir="ltr">
              calibration: {typeof card.metrics.calibration === 'number' ? formatDecimal(card.metrics.calibration, 3) : JSON.stringify(card.metrics.calibration)}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="پیشبینی آزمایشی" subtitle="تنها با نسخه مدل انتخابشده" />
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[200px] flex-1">
              <Input
                label="شناسه جلسه"
                dir="ltr"
                value={predictSession}
                onChange={(e) => setPredictSession(e.target.value)}
                placeholder="مثال: 12"
              />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={predict} loading={predicting} disabled={!selected || !predictSession}>
                پیشبینی
              </Button>
            </div>
          </div>
          {prediction ? (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary-soft/40 p-4">
              {prediction.probability != null ? (
                <>
                  <p className="text-xs font-bold text-ink">احتمال: <span className="nums">{formatPercent(prediction.probability)}</span></p>
                  <p className="mt-1 text-[11px] text-ink-muted">نسخه: {prediction.version}</p>
                </>
              ) : (
                <p className="text-xs leading-6 text-ink-muted">
                  {prediction.message ?? 'مدل در حال تکمیل است؛ احتمالی محاسبه نمیشود.'}
                </p>
              )}
              {prediction.risk.length ? (
                <ul className="mt-3 space-y-1 text-[11px]" dir="ltr">
                  {prediction.risk.map((x, i) => (
                    <li key={i} className="flex justify-between"><span>{x.feature}</span><span className="nums">{formatDecimal(x.contribution, 3)}</span></li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/** Prepare a bounded feature-importance list for the chart without fabricated data. */
function useMemoFeatureData(metrics: ModelMetrics | null): Array<{ name: string; value: number }> {
  if (!metrics) return [];
  const names = metrics.feature_names ?? [];
  const raw = metrics.feature_importance as unknown;
  if (Array.isArray(raw) && raw.length === names.length) {
    return names.map((name, i) => ({ name, value: Number(raw[i]) || 0 }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, number>)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }
  return [];
}
