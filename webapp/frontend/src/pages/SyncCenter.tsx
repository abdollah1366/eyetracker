import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { apiErrorMessage, syncApi } from '../lib/api';
import {
  clearQueue,
  getAllEvents,
  getQueueCount,
  removeEvents,
  setMeta,
} from '../lib/idb';
import type { SyncEvent } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { StatCard } from '../components/ui/StatCard';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

export function SyncCenter() {
  const toast = useToast();
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [count, setCount] = useState(0);
  const [serverStatus, setServerStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [q, e] = await Promise.allSettled([getQueueCount(), getAllEvents()]);
    if (q.status === 'fulfilled') setCount(q.value);
    if (e.status === 'fulfilled') setEvents(e.value);
    setOnline(navigator.onLine);
    try {
      setServerStatus(await syncApi.status());
      await setMeta('last_sync_view', new Date().toISOString());
    } catch {
      setServerStatus(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  const retrySync = async () => {
    if (!online) {
      toast.warning('اتصال اینترنت برقرار نیست.');
      return;
    }
    const queued = await getAllEvents();
    if (queued.length === 0) {
      toast.info('هیچ رویدادی در صف همگامسازی نیست.');
      return;
    }
    setSyncing(true);
    try {
      const res = await syncApi.batch({ events: queued });
      const successful = res.results.filter((r) => r.status === 'ok' || r.status === 'duplicate').map((r) => r.idempotency_key);
      await removeEvents(successful);
      toast.success(`${successful.length} رویداد همگامساز شد.`);
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  const discardAll = async () => {
    if (!window.confirm('آیا از حذف تمام رویدادهای صف اطمینان دارید؟')) return;
    await clearQueue();
    toast.success('صف همگامسازی پاک شد.');
    await refresh();
  };

  return (
    <div>
      <PageHeader
        eyebrow="دسترسی آفلاین"
        title="مرکز همگامسازی"
        subtitle="رویدادهای ثبتشده در حالت آفلاین و وضعیت ارسال به سرور."
        actions={
          <Button leftIcon={<RefreshCw size={18} />} onClick={retrySync} loading={syncing}>
            همگامسازی
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="وضعیت اتصال"
          value={online ? 'متصل' : 'آفلاین'}
          tone={online ? 'success' : 'warning'}
          icon={online ? <CheckCircle2 size={20} /> : <CloudOff size={20} />}
        />
        <StatCard label="رویدادهای در صف" value={count} tone="primary" icon={<RefreshCw size={20} />} />
        <StatCard
          label="آخرین بررسی"
          value={loading ? '—' : formatDateTime(new Date().toISOString()).slice(0, 10)}
          tone="info"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="صف رویدادها" subtitle="رویدادهای ذخیرهشده بهصورت محلی (IndexedDB)" />
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Spinner /></div>
          ) : events.length === 0 ? (
            <EmptyState compact icon={<CheckCircle2 size={24} />} title="دادهای ثبت نشده است" description="هیچ رویدادی در صف همگامسازی وجود ندارد." />
          ) : (
            <>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {events.map((e) => (
                  <div key={e.idempotency_key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-2/40 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="nums truncate text-[11px] font-bold text-ink" dir="ltr">{e.type}</p>
                      <p className="nums truncate text-[10px] text-ink-subtle" dir="ltr">{e.idempotency_key}</p>
                    </div>
                    <Badge tone="warning" dot>در صف</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="danger" size="sm" leftIcon={<Trash2 size={16} />} onClick={discardAll}>
                  حذف تمام رویدادها
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="وضعیت سرور" subtitle="پاسخ GET /sync/status" />
          {serverStatus ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(serverStatus).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3" dir="ltr">
                  <p className="text-[10px] text-ink-muted">{key}</p>
                  <p className="nums mt-1 text-sm font-bold text-ink">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact title="دادهای ثبت نشده است" description="وضعیت سرور در دسترس نیست." />
          )}
          <p className="mt-4 text-[11px] text-ink-subtle">
            فراموش نشود: فقط مختصات نگاشتشده نگاه و ویژگیها ارسال میشوند، نه فریم خام دوربین.
          </p>
        </Card>
      </div>
    </div>
  );
}
