import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage, asItems, assessmentsApi, participantsApi } from '../lib/api';
import { assessmentScores, codeLabel, formatDate } from '../lib/format';
import type { Assessment, AssessmentKind, Participant } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

interface ScoreRow {
  key: string;
  value: string;
}

export function Assessments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const participantParam = params.get('participant') ?? '';
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantId, setParticipantId] = useState(participantParam);
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [kind, setKind] = useState<AssessmentKind>('CONNERS');
  const [version, setVersion] = useState('');
  const [assessedAt, setAssessedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ScoreRow[]>([{ key: '', value: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    participantsApi.list({ limit: 500 }).then((res) => setParticipants(res.items ?? [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    setParticipantId(participantParam);
  }, [participantParam]);

  const load = () => {
    if (!participantId) {
      setItems([]);
      return;
    }
    setLoading(true);
    participantsApi
      .assessments(participantId)
      .then((res) => setItems(asItems(res)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [participantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setError(null);
    const scores: Record<string, number | string> = {};
    for (const row of rows) {
      if (!row.key.trim()) continue;
      const num = Number(row.value);
      scores[row.key.trim()] = row.value.trim() === '' ? '' : Number.isFinite(num) ? num : row.value.trim();
    }
    if (!participantId) {
      setError('لطفاً شرکتکننده را انتخاب کنید.');
      return;
    }
    if (!version.trim()) {
      setError('نسخه ابزار الزامی است.');
      return;
    }
    if (Object.keys(scores).length === 0) {
      setError('حداقل یک نمره وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      await assessmentsApi.create(participantId, {
        kind,
        version: version.trim(),
        scores,
        assessed_at: new Date(assessedAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success('ارزیابی با موفقیت ثبت شد.');
      setModalOpen(false);
      setRows([{ key: '', value: '' }]);
      setVersion('');
      setNotes('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number | string) => {
    if (!window.confirm('آیا از حذف این ارزیابی اطمینان دارید؟')) return;
    try {
      await assessmentsApi.remove(id);
      toast.success('ارزیابی حذف شد.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const columns: Column<Assessment>[] = [
    {
      key: 'kind',
      header: 'ابزار',
      render: (row) => <Badge tone="primary">{codeLabel(row.kind)}</Badge>,
    },
    { key: 'version', header: 'نسخه', render: (row) => <span className="nums" dir="ltr">{row.version}</span> },
    {
      key: 'scores',
      header: 'تعداد شاخصها',
      render: (row) => <span className="nums">{Object.keys(assessmentScores(row)).length}</span>,
    },
    { key: 'assessed_at', header: 'تاریخ ارزیابی', render: (row) => formatDate(row.assessed_at) },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void remove(row.id);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-error-soft hover:text-error"
          aria-label="حذف"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="ارزیابیهای بالینی"
        title="ارزیابیها"
        subtitle="ثبت ساختاریافته نمرات کانرز و IVA-2، بدون درج محتوای دارای حق کپی."
        actions={
          <Button
            leftIcon={<Plus size={18} />}
            onClick={() => setModalOpen(true)}
            disabled={!participantId}
          >
            ارزیابی جدید
          </Button>
        }
      />

      <Card padding="none">
        <div className="border-b border-border/70 p-4 sm:p-5">
          <label className="mb-1.5 block text-xs font-semibold text-ink">شرکتکننده</label>
          <select
            value={participantId}
            onChange={(e) => {
              setParticipantId(e.target.value);
              setParams(e.target.value ? { participant: e.target.value } : {});
            }}
            className="h-11 w-full max-w-sm rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">انتخاب کنید…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.research_id} — {p.age} سال
              </option>
            ))}
          </select>
        </div>
        {!participantId ? (
          <EmptyState icon={<ClipboardList size={24} />} title="دادهای ثبت نشده است" description="برای مشاهده ارزیابیها، ابتدا شرکتکننده را انتخاب کنید." compact />
        ) : (
          <Table columns={columns} data={items} rowKey={(r) => r.id} loading={loading} emptyTitle="دادهای ثبت نشده است" emptyDescription="هیچ ارزیابیی برای این شرکتکننده ثبت نشده است." />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="ثبت ارزیابی جدید"
        description="فقط نمرات واردشده توسط کاربر ذخیره میشود؛ محتوای آزمون در سامانه گنجانده نشده است."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>لغو</Button>
            <Button onClick={submit} loading={saving}>ثبت ارزیابی</Button>
          </>
        }
      >
        {error ? (
          <div className="mb-4 rounded-xl border border-error/25 bg-error-soft px-4 py-3 text-xs font-semibold text-error">{error}</div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">ابزار</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AssessmentKind)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="CONNERS">Conners</option>
              <option value="IVA2">IVA-2</option>
            </select>
          </div>
          <Input label="نسخه ابزار" dir="ltr" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="مثال: 3" />
          <Input label="تاریخ ارزیابی" type="date" dir="ltr" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-ink">نمرات</p>
            <button
              onClick={() => setRows((r) => [...r, { key: '', value: '' }])}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <Plus size={14} /> افزودن شاخص
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="نام شاخص"
                  value={row.key}
                  onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                />
                <Input
                  placeholder="نمره"
                  dir="ltr"
                  value={row.value}
                  onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
                {rows.length > 1 ? (
                  <button
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle hover:bg-error-soft hover:text-error"
                    aria-label="حذف ردیف"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold text-ink">یادداشت (اختیاری)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </Modal>
    </div>
  );
}
