import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserPlus } from 'lucide-react';
import { apiErrorMessage, participantsApi } from '../lib/api';
import { formatDate, sexLabel } from '../lib/format';
import type { Participant, ParticipantCreate } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';

const emptyForm: ParticipantCreate = {
  research_id: '',
  birth_year: new Date().getFullYear() - 10,
  age: 10,
  sex: 'M',
  clinic_id: null,
  consent_guardian: false,
  consent_assent: false,
  consent_date: new Date().toISOString().slice(0, 10),
};

export function Participants() {
  const toast = useToast();
  const [items, setItems] = useState<Participant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ParticipantCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const load = () => {
    setLoading(true);
    participantsApi
      .list({ search: debounced || undefined, limit: 200 })
      .then((res) => {
        setItems(res.items ?? []);
        setTotal(res.total ?? res.items?.length ?? 0);
      })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ParticipantCreate>(key: K, value: ParticipantCreate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setFormError(null);
    if (!form.research_id.trim()) {
      setFormError('شناسه پژوهشی الزامی است.');
      return;
    }
    if (!form.consent_guardian || !form.consent_assent) {
      setFormError('هر دو رضایتنامه (والد/سرپرست و کودک) باید تأیید شوند.');
      return;
    }
    setSaving(true);
    try {
      await participantsApi.create(form);
      toast.success('شرکتکننده با موفقیت ثبت شد.');
      setModalOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Participant>[] = [
    {
      key: 'research_id',
      header: 'شناسه پژوهشی',
      render: (row) => (
        <Link to={`/participants/${row.id}`} className="nums font-bold text-primary hover:underline" dir="ltr">
          {row.research_id}
        </Link>
      ),
    },
    {
      key: 'age',
      header: 'سن',
      render: (row) => <span className="nums">{row.age} سال</span>,
    },
    { key: 'sex', header: 'جنسیت', render: (row) => sexLabel(row.sex) },
    {
      key: 'birth_year',
      header: 'سال تولد',
      render: (row) => <span className="nums">{row.birth_year}</span>,
      hideBelow: 'md',
    },
    {
      key: 'consent',
      header: 'رضایتنامه',
      render: (row) =>
        row.consent_guardian && row.consent_assent ? (
          <Badge tone="success" dot>
            تکمیل
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            ناقص
          </Badge>
        ),
    },
    {
      key: 'created_at',
      header: 'تاریخ ثبت',
      render: (row) => <span className="text-xs text-ink-muted">{formatDate(row.created_at)}</span>,
      hideBelow: 'lg',
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="شرکتکنندگان"
        subtitle={`${total ? `${total} شرکتکننده ثبتشده` : 'ثبت و مدیریت شرکتکنندگان پژوهش'}`}
        actions={
          <Button leftIcon={<UserPlus size={18} />} onClick={() => setModalOpen(true)}>
            افزودن شرکتکننده
          </Button>
        }
      />

      <Card padding="none">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 p-4 sm:p-5">
          <div className="w-full max-w-sm">
            <Input
              placeholder="جستجو بر اساس شناسه پژوهشی…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={18} />}
            />
          </div>
        </div>
        <Table
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="دادهای ثبت نشده است"
          emptyDescription={
            debounced ? 'هیچ شرکتکنندهای با این عبارت یافت نشد.' : 'با افزودن اولین شرکتکننده، لیست اینجا نمایش داده میشود.'
          }
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="افزودن شرکتکننده"
        description="اطلاعات هویتی در جدول جداگانه نگهداری میشود و وارد خروجی پژوهشی نمیشود."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              لغو
            </Button>
            <Button onClick={submit} loading={saving}>
              ثبت شرکتکننده
            </Button>
          </>
        }
      >
        {formError ? (
          <div className="mb-4 rounded-xl border border-error/25 bg-error-soft px-4 py-3 text-xs font-semibold text-error">
            {formError}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="شناسه پژوهشی"
            dir="ltr"
            value={form.research_id}
            onChange={(e) => set('research_id', e.target.value)}
            placeholder="P-001"
            required
          />
          <Input
            label="سن"
            type="number"
            min={1}
            max={120}
            value={form.age}
            onChange={(e) => set('age', Number(e.target.value))}
          />
          <Input
            label="سال تولد"
            type="number"
            value={form.birth_year}
            onChange={(e) => set('birth_year', Number(e.target.value))}
          />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">جنسیت</label>
            <select
              value={form.sex}
              onChange={(e) => set('sex', e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="M">مرد</option>
              <option value="F">زن</option>
              <option value="OTHER">سایر</option>
            </select>
          </div>
          <Input
            label="تاریخ رضایت"
            type="date"
            dir="ltr"
            value={form.consent_date}
            onChange={(e) => set('consent_date', e.target.value)}
            containerClassName="sm:col-span-2"
          />
        </div>

        <div className="mt-5 space-y-2 rounded-xl border border-border bg-surface-2/50 p-4">
          <p className="mb-2 text-xs font-bold text-ink">رضایتنامهها</p>
          <label className="flex items-center gap-3 text-xs text-ink">
            <input
              type="checkbox"
              checked={form.consent_guardian}
              onChange={(e) => set('consent_guardian', e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            رضایت والد یا سرپرست قانونی اخذ شده است.
          </label>
          <label className="flex items-center gap-3 text-xs text-ink">
            <input
              type="checkbox"
              checked={form.consent_assent}
              onChange={(e) => set('consent_assent', e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            رضایت آگاهانه کودک (Assent) اخذ شده است.
          </label>
        </div>
      </Modal>
    </div>
  );
}
