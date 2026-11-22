import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import { apiErrorMessage, ratingScalesApi } from '../../lib/api';
import { formatDecimal } from '../../lib/format';
import type { Assessment, ParentRatingDefinition } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

type Tone = 'success' | 'warning' | 'error';

const severityOf = (mean: number): { label: string; tone: Tone } =>
  mean >= 1.5
    ? { label: 'بالا', tone: 'error' }
    : mean >= 1.0
      ? { label: 'مرزی', tone: 'warning' }
      : { label: 'طبیعی', tone: 'success' };

/**
 * SNAP-IV parent rating form. Item text comes from the server-owned item bank
 * so the client cannot drift from what the scoring engine expects. Answers are
 * submitted raw; all subscale scores are recomputed and persisted server-side.
 */
export function ParentRatingScale({
  open,
  participantId,
  participantLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  participantId: number | string;
  participantLabel: string;
  onClose: () => void;
  onSaved: (assessment: Assessment) => void;
}) {
  const [definition, setDefinition] = useState<ParentRatingDefinition | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Assessment | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    ratingScalesApi
      .parentDefinition()
      .then((def) => setDefinition(def))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    setAnswers({});
    setNotes('');
    setError(null);
    setSaved(null);
    if (!definition) load();
  }, [open, definition, load]);

  const totalItems = definition?.items.length ?? 26;
  const answeredCount = Object.keys(answers).length;
  const complete = answeredCount === totalItems && totalItems > 0;

  const liveScores = useMemo(() => {
    if (!definition) return [] as Array<{ key: string; title: string; mean: number }>;
    const rows = definition.sections.map((section) => {
      const values = section.item_ids.map((id) => answers[id]).filter((v): v is number => v !== undefined);
      return {
        key: section.key,
        title: section.title_fa,
        mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      };
    });
    const adhdValues = definition.sections
      .filter((s) => s.key !== 'odd')
      .flatMap((s) => s.item_ids.map((id) => answers[id]).filter((v): v is number => v !== undefined));
    rows.push({
      key: 'adhd_total',
      title: 'مجموع ADHD',
      mean: adhdValues.length ? adhdValues.reduce((a, b) => a + b, 0) / adhdValues.length : 0,
    });
    return rows;
  }, [definition, answers]);

  const submit = async () => {
    if (!complete) return;
    setSaving(true);
    setError(null);
    try {
      const created = await ratingScalesApi.submitParent(participantId, {
        instrument: 'SNAP-IV-26',
        answers: Object.entries(answers).map(([item_id, value]) => ({
          item_id: Number(item_id),
          value,
        })),
        notes: notes.trim() || undefined,
        assessed_at: new Date().toISOString(),
      });
      setSaved(created);
      onSaved(created);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={definition?.title_fa ?? 'پرسشنامه والدین'}
      description={`شرکتکننده: ${participantLabel} — SNAP-IV-26`}
      size="lg"
    >
      {loading || !definition ? (
        <div className="flex min-h-64 items-center justify-center">
          {error ? (
            <div className="rounded-xl bg-error-soft px-4 py-3 text-xs font-semibold text-error">{error}</div>
          ) : (
            <Spinner label="در حال بارگذاری پرسشنامه…" />
          )}
        </div>
      ) : saved ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-success">
            <CheckCircle2 size={22} />
            <div>
              <p className="text-sm font-bold">نتیجه تست بهطور خودکار در پرونده مراجع ذخیره شد.</p>
              <p className="mt-0.5 text-[11px]">شناسه ارزیابی: <span className="nums" dir="ltr">#{saved.id}</span></p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {liveScores.map((row) => {
              const result = severityOf(row.mean);
              return (
                <div key={row.key} className="rounded-xl border border-border/70 bg-surface-2/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink">{row.title}</p>
                    <Badge tone={result.tone} dot>{result.label}</Badge>
                  </div>
                  <p className="nums mt-2 text-2xl font-bold text-ink" dir="ltr">
                    {formatDecimal(row.mean, 2)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">میانگین نمره (۰ تا ۳)</p>
                </div>
              );
            })}
          </div>
          <p className="rounded-xl bg-warning-soft/60 px-4 py-3 text-[11px] leading-6 text-ink-muted">
            {definition.disclaimer_fa}
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>بستن</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-2 rounded-xl bg-primary-soft/60 px-4 py-3 text-[11px] leading-6 text-ink-muted">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <span>{definition.disclaimer_fa}</span>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
              <span>پیشروی پاسخگویی</span>
              <span className="nums" dir="ltr">{answeredCount} / {totalItems}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
              <div
                className="h-full rounded-pill bg-primary transition-[width] duration-150"
                style={{ width: `${(answeredCount / totalItems) * 100}%` }}
              />
            </div>
          </div>

          <div className="max-h-[52vh] space-y-5 overflow-y-auto pl-1">
            {definition.sections.map((section, sectionIndex) => (
              <div key={section.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="nums flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-[11px] font-bold text-primary" dir="ltr">
                    {sectionIndex + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-ink">{section.title_fa}</p>
                    <p className="text-[10px] text-ink-muted">{section.description_fa}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {section.item_ids.map((itemId) => {
                    const item = definition.items.find((entry) => entry.id === itemId);
                    if (!item) return null;
                    const chosen = answers[itemId];
                    return (
                      <div
                        key={itemId}
                        className={`rounded-xl border px-3 py-3 transition-colors ${
                          chosen === undefined ? 'border-border/70 bg-surface' : 'border-primary/30 bg-primary-soft/30'
                        }`}
                      >
                        <p className="mb-2.5 text-[11px] leading-6 text-ink">
                          <span className="nums ml-1 text-ink-subtle" dir="ltr">{itemId}.</span>
                          {item.text_fa}
                        </p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`پاسخ سؤال ${itemId}`}>
                          {definition.likert.map((option) => (
                            <label
                              key={option.value}
                              className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                                chosen === option.value
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-border bg-surface text-ink-muted hover:border-primary/40 hover:text-ink'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`item-${itemId}`}
                                className="sr-only"
                                checked={chosen === option.value}
                                onChange={() => setAnswers((prev) => ({ ...prev, [itemId]: option.value }))}
                              />
                              <span className="nums font-bold" dir="ltr">{option.value}</span>
                              <span>{option.label_fa}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-ink-muted" htmlFor="rating-notes">
              یادداشت سرپرست (اختیاری)
            </label>
            <textarea
              id="rating-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="توضیحات تکمیلی درباره پاسخها…"
            />
          </div>

          {error ? (
            <div className="rounded-xl bg-error-soft px-4 py-3 text-xs font-semibold text-error">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap gap-3">
              {liveScores.map((row) => (
                <div key={row.key} className="text-[10px] text-ink-muted">
                  {row.title}: <span className="nums font-bold text-ink" dir="ltr">{formatDecimal(row.mean, 2)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>لغو</Button>
              <Button
                leftIcon={saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
                disabled={!complete || saving}
                loading={saving}
                onClick={() => void submit()}
              >
                {complete ? 'ثبت و ذخیره خودکار نتایج' : `پاسخ ${totalItems - answeredCount} سؤال باقیمانده است`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
