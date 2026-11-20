import { useEffect, useState } from 'react';
import { Building2, History, Save, SlidersHorizontal, Users } from 'lucide-react';
import { adminApi, apiErrorMessage, asItems, clinicsApi, usersApi } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AuditLog, Clinic, QualityConfig, Role, User } from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Table, type Column } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

type Tab = 'clinics' | 'users' | 'quality' | 'audit';

const tabs: Array<{ key: Tab; label: string; icon: typeof Building2 }> = [
  { key: 'clinics', label: 'کلینیکها', icon: Building2 },
  { key: 'users', label: 'کاربران', icon: Users },
  { key: 'quality', label: 'آستانههای کیفیت', icon: SlidersHorizontal },
  { key: 'audit', label: 'گزارش رویدادها', icon: History },
];

export function Admin() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('clinics');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [quality, setQuality] = useState<QualityConfig | null>(null);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicModal, setClinicModal] = useState(false);
  const [clinicForm, setClinicForm] = useState({ name: '', code: '' });
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'clinician' as Role, clinic_id: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([clinicsApi.list(), usersApi.list(), adminApi.getQualityConfig(), adminApi.audit()]).then(
      ([c, u, q, a]) => {
        if (c.status === 'fulfilled') setClinics(asItems(c.value));
        if (u.status === 'fulfilled') setUsers(asItems(u.value));
        if (q.status === 'fulfilled') setQuality(q.value);
        if (a.status === 'fulfilled') setAudit(asItems(a.value));
        setLoading(false);
      },
    );
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveClinic = async () => {
    setSaving(true);
    try {
      await clinicsApi.create({ name: clinicForm.name, code: clinicForm.code, is_active: true });
      toast.success('کلینیک ثبت شد.');
      setClinicModal(false);
      setClinicForm({ name: '', code: '' });
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async () => {
    setSaving(true);
    try {
      await usersApi.create({
        email: userForm.email,
        password: userForm.password,
        name: userForm.name,
        role: userForm.role,
        clinic_id: userForm.clinic_id || null,
      });
      toast.success('کاربر ایجاد شد.');
      setUserModal(false);
      setUserForm({ email: '', password: '', name: '', role: 'clinician', clinic_id: '' });
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveQuality = async () => {
    if (!quality) return;
    setSaving(true);
    try {
      await adminApi.patchQualityConfig(quality);
      toast.success('آستانههای کیفیت بهروز شد.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const clinicColumns: Column<Clinic>[] = [
    { key: 'name', header: 'نام کلینیک', render: (r) => <span className="font-bold text-ink">{r.name}</span> },
    { key: 'code', header: 'کد', render: (r) => <span className="nums" dir="ltr">{r.code}</span> },
    {
      key: 'is_active',
      header: 'وضعیت',
      render: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'} dot>{r.is_active ? 'فعال' : 'غیرفعال'}</Badge>,
    },
  ];

  const userColumns: Column<User>[] = [
    { key: 'name', header: 'نام', render: (r) => <span className="font-bold text-ink">{r.name}</span> },
    { key: 'email', header: 'ایمیل', render: (r) => <span className="nums text-xs" dir="ltr">{r.email}</span> },
    { key: 'role', header: 'نقش', render: (r) => <Badge tone="primary">{r.role}</Badge> },
    {
      key: 'is_active',
      header: 'وضعیت',
      render: (r) => <Badge tone={r.is_active === false ? 'error' : 'success'} dot>{r.is_active === false ? 'غیرفعال' : 'فعال'}</Badge>,
    },
  ];

  const auditColumns: Column<AuditLog>[] = [
    { key: 'action', header: 'اقدام', render: (r) => <span className="font-bold text-ink" dir="ltr">{r.action}</span> },
    { key: 'entity', header: 'موجودیت', render: (r) => <span className="nums text-xs" dir="ltr">{r.entity}</span> },
    { key: 'user_id', header: 'کاربر', render: (r) => <span className="nums text-xs">#{r.user_id}</span> },
    { key: 'created_at', header: 'زمان', render: (r) => <span className="text-xs text-ink-muted">{formatDateTime(r.created_at)}</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="مدیریت سامانه" title="تنظیمات سامانه" subtitle="کلینیکها، کاربران، آستانههای کیفیت و گزارش رویدادها." />

      {/* tabs */}
      <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors ${
              tab === key ? 'bg-primary text-white shadow-sm' : 'text-ink-muted hover:bg-surface-2'
            }`}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {tab === 'clinics' ? (
        <Card padding="none">
          <div className="flex justify-end border-b border-border/70 p-4">
            <Button leftIcon={<Building2 size={18} />} onClick={() => setClinicModal(true)}>کلینیک جدید</Button>
          </div>
          <Table columns={clinicColumns} data={clinics} rowKey={(r) => r.id} loading={loading} emptyTitle="دادهای ثبت نشده است" />
        </Card>
      ) : null}

      {tab === 'users' ? (
        <Card padding="none">
          <div className="flex justify-end border-b border-border/70 p-4">
            <Button leftIcon={<Users size={18} />} onClick={() => setUserModal(true)}>کاربر جدید</Button>
          </div>
          <Table columns={userColumns} data={users} rowKey={(r) => r.id} loading={loading} emptyTitle="دادهای ثبت نشده است" />
        </Card>
      ) : null}

      {tab === 'quality' ? (
        <Card>
          <CardHeader title="آستانههای درجهبندی کیفیت" subtitle="تغییر این مقادیر در audit_log ثبت میشود." />
          {quality ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['min_valid_gaze_ratio', 'حداقل نسبت نگاه معتبر', 0.01],
                  ['max_tracking_gap_s', 'حداکثر وقفه ردیابی (ثانیه)', 0.05],
                  ['min_brightness', 'حداقل روشنایی', 1],
                  ['max_brightness', 'حداکثر روشنایی', 1],
                  ['max_calibration_error_px', 'حداکثر خطای کالیبراسیون (px)', 1],
                ].map(([key, label, step]) => (
                  <Input
                    key={String(key)}
                    label={String(label)}
                    type="number"
                    dir="ltr"
                    step={Number(step)}
                    value={quality[String(key)]}
                    onChange={(e) => setQuality({ ...quality, [String(key)]: Number(e.target.value) })}
                  />
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button variant="accent" leftIcon={<Save size={18} />} onClick={saveQuality} loading={saving}>
                  ذخیره آستانهها
                </Button>
              </div>
            </>
          ) : (
            <EmptyState compact title="دادهای ثبت نشده است" description="تنظیمات کیفیت در دسترس نیست." />
          )}
        </Card>
      ) : null}

      {tab === 'audit' ? (
        <Card padding="none">
          <div className="border-b border-border/70 p-4">
            <p className="text-xs text-ink-muted">تمام اقدامات حساس (ورود، ایجاد، حذف، آموزش، تغییر آستانه) ثبت میشوند.</p>
          </div>
          <Table columns={auditColumns} data={audit} rowKey={(r) => r.id} loading={loading} emptyTitle="دادهای ثبت نشده است" />
        </Card>
      ) : null}

      {/* clinic modal */}
      <Modal
        open={clinicModal}
        onClose={() => setClinicModal(false)}
        title="کلینیک جدید"
        footer={<><Button variant="ghost" onClick={() => setClinicModal(false)}>لغو</Button><Button onClick={saveClinic} loading={saving}>ثبت</Button></>}
      >
        <div className="space-y-4">
          <Input label="نام کلینیک" value={clinicForm.name} onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })} />
          <Input label="کد" dir="ltr" value={clinicForm.code} onChange={(e) => setClinicForm({ ...clinicForm, code: e.target.value })} />
        </div>
      </Modal>

      {/* user modal */}
      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title="کاربر جدید"
        footer={<><Button variant="ghost" onClick={() => setUserModal(false)}>لغو</Button><Button onClick={saveUser} loading={saving}>ایجاد کاربر</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="نام" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          <Input label="ایمیل" type="email" dir="ltr" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <Input label="رمز عبور" type="password" dir="ltr" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">نقش</label>
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="admin">مدیر</option>
              <option value="clinician">بالینشناس</option>
              <option value="researcher">پژوهشگر</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-ink">کلینیک</label>
            <select
              value={userForm.clinic_id}
              onChange={(e) => setUserForm({ ...userForm, clinic_id: e.target.value })}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">بدون کلینیک</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
