import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, Monitor, Play, RotateCcw, Volume2 } from 'lucide-react';
import { apiErrorMessage, cptApi } from '../../lib/api';
import { assessmentScores, formatDecimal } from '../../lib/format';
import type { Assessment, CptProtocol, CptTrialResult } from '../../lib/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

type Phase = 'intro' | 'countdown' | 'running' | 'saving' | 'result';

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Metric = { label: string; key: string; suffix?: string };

const MODALITY_METRICS: Metric[] = [
  { label: 'اصبت (Hit)', key: 'hits' },
  { label: 'از دست رفته (Miss)', key: 'misses' },
  { label: 'خطای کاذب (FA)', key: 'false_alarms' },
  { label: 'رد درست (CR)', key: 'correct_rejections' },
  { label: 'نرخ اصابت', key: 'hit_rate' },
  { label: 'نرخ خطای کاذب', key: 'false_alarm_rate' },
  { label: "حساسیت (d')", key: 'd_prime' },
  { label: 'میانگین واکنش (ms)', key: 'mean_hit_rt_ms' },
];

/**
 * Open IVA-style CPT. Target = digit 1, non-target = 2, in a visual block and
 * an auditory block. Trial timing and scoring are fully server-owned; this
 * component only records response times and submits raw results.
 */
export function IvaCptTest({
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
  const [protocol, setProtocol] = useState<CptProtocol | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [countdown, setCountdown] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showingStimulus, setShowingStimulus] = useState(false);
  const [saved, setSaved] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const phaseRef = useRef<Phase>('intro');
  const abortRef = useRef(false);
  const resultsRef = useRef<Record<number, CptTrialResult>>({});
  const activeIndexRef = useRef(-1);
  const respondedRef = useRef(false);
  const countRef = useRef(0);
  const onsetRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [responsePulse, setResponsePulse] = useState(0);

  const setPhaseSafe = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    if (!open) return;
    abortRef.current = true;
    setProtocol(null);
    setPhaseSafe('intro');
    setCurrentIndex(-1);
    setShowingStimulus(false);
    setSaved(null);
    setError(null);
    setLoading(true);
    cptApi
      .protocol()
      .then(setProtocol)
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
    return () => {
      abortRef.current = true;
      window.speechSynthesis?.cancel();
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [open]);

  const playStimulus = useCallback((digit: 1 | 2) => {
    // Spoken Persian digit is the primary auditory cue.
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(digit === 1 ? 'یک' : 'دو');
      utterance.lang = 'fa-IR';
      utterance.rate = 1;
      utterance.pitch = digit === 1 ? 1.25 : 0.85;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        /* speech is optional; the tone below carries the cue */
      }
    }
    // A crisp redundant tone: high = target (1), low = non-target (2).
    const ctx = audioCtxRef.current;
    if (ctx) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = digit === 1 ? 1000 : 500;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.45);
    }
  }, []);

  const recordResponse = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    const index = activeIndexRef.current;
    if (index < 0) return;
    const elapsed = Math.max(0, performance.now() - onsetRef.current);
    if (!respondedRef.current) {
      respondedRef.current = true;
      countRef.current = 1;
      resultsRef.current[index] = {
        trial_index: index,
        reaction_ms: Math.round(elapsed),
        response_count: 1,
      };
    } else {
      countRef.current += 1;
      const existing = resultsRef.current[index];
      if (existing) existing.response_count = countRef.current;
    }
    setResponsePulse(Date.now());
  }, []);

  // Space bar response, exactly like the on-screen button.
  useEffect(() => {
    if (phase !== 'running') return;
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        recordResponse();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, recordResponse]);

  const submit = useCallback(
    async (proto: CptProtocol) => {
      setPhaseSafe('saving');
      const results: CptTrialResult[] = proto.trials.map((trial, index) =>
        resultsRef.current[index] ?? { trial_index: index, reaction_ms: null, response_count: 0 },
      );
      try {
        const created = await cptApi.submit(participantId, {
          protocol_version: proto.protocol_version,
          results,
          assessed_at: new Date().toISOString(),
        });
        setSaved(created);
        setPhaseSafe('result');
        onSaved(created);
      } catch (err) {
        setError(apiErrorMessage(err));
        setPhaseSafe('result');
      }
    },
    [participantId, onSaved],
  );

  const start = async () => {
    if (!protocol) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor && !audioCtxRef.current) audioCtxRef.current = new Ctor();
      await audioCtxRef.current?.resume();
    } catch {
      /* audio is optional; speech may still work */
    }
    setError(null);
    resultsRef.current = {};
    abortRef.current = false;
    setPhaseSafe('countdown');
    for (let n = 3; n >= 1; n -= 1) {
      if (abortRef.current) return;
      setCountdown(n);
      await delay(1000);
    }
    if (abortRef.current) return;
    setPhaseSafe('running');

    for (let index = 0; index < protocol.trials.length; index += 1) {
      if (abortRef.current) return;
      const trial = protocol.trials[index];
      activeIndexRef.current = index;
      respondedRef.current = false;
      countRef.current = 0;
      setCurrentIndex(index);
      setResponsePulse(0);
      setShowingStimulus(true);
      onsetRef.current = performance.now();
      if (trial.modality === 'auditory') playStimulus(trial.digit);
      await delay(protocol.stimulus_duration_ms);
      if (abortRef.current) return;
      setShowingStimulus(false);
      window.speechSynthesis?.cancel();
      await delay(protocol.inter_trial_interval_ms);
    }
    if (abortRef.current) return;
    activeIndexRef.current = -1;
    await submit(protocol);
  };

  const close = () => {
    abortRef.current = true;
    window.speechSynthesis?.cancel();
    onClose();
  };

  const currentTrial = protocol && currentIndex >= 0 ? protocol.trials[currentIndex] : null;
  const progress = protocol ? Math.max(0, currentIndex + 1) / protocol.total_trials : 0;
  const scores = saved ? assessmentScores(saved) : null;
  const perModality = scores?.per_modality as
    | Record<string, Record<string, number>>
    | undefined;
  const overall = scores?.overall as Record<string, number> | undefined;

  return (
    <Modal
      open={open}
      onClose={close}
      title="تست IVA-2 (پیوسته دیداری-شنیداری)"
      description={`شرکتکننده: ${participantLabel} — هدف: رقم ۱ | غیرهدف: رقم ۲`}
      size="lg"
    >
      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner label="در حال بارگذاری پروتکل تست…" />
        </div>
      ) : error && phase === 'intro' ? (
        <div className="rounded-xl bg-error-soft px-4 py-3 text-xs font-semibold text-error">{error}</div>
      ) : phase === 'intro' && protocol ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-primary/25 bg-primary-soft/40 p-4">
            <p className="text-sm font-bold text-ink">دستورالعمل</p>
            <p className="mt-2 text-xs leading-6 text-ink-muted">
              در این تست دو بخش وجود دارد: <b>دیداری</b> و <b>شنیداری</b>. هر رقمی که میبینید یا میشنوید یا <b className="text-primary">۱ (هدف)</b> است یا <b className="text-ink">۲ (غیرهدف)</b>.
            </p>
            <p className="mt-2 text-xs leading-6 text-ink-muted">
              هرگاه <b className="text-primary">رقم ۱</b> را دیدید یا صدای «یک» را شنیدید، فوراً <b>کلید Space</b> را فشار دهید یا دکمهٔ «پاسخ» را بزنید. هنگام رقم ۲ نباید پاسخی بدهید.
            </p>
            <p className="mt-2 text-[11px] leading-6 text-ink-muted">
              تعداد کارآزمایی: <span className="nums font-bold" dir="ltr">{protocol.total_trials}</span> (۲۰ دیداری + ۲۰ شنیداری) — هر محرک حدود <span className="nums" dir="ltr">{protocol.stimulus_duration_ms}</span> میلیثانیه نمایش داده میشود.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface-2/40 p-4">
              <Monitor size={22} className="text-primary" />
              <div>
                <p className="text-xs font-bold text-ink">بخش دیداری</p>
                <p className="text-[11px] text-ink-muted">رقم ۱ یا ۲ روی صفحه ظاهر میشود.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface-2/40 p-4">
              <Headphones size={22} className="text-accent" />
              <div>
                <p className="text-xs font-bold text-ink">بخش شنیداری</p>
                <p className="text-[11px] text-ink-muted">صدای «یک» یا «دو» پخش میشود (با تن بلند/کوتاه).</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-warning-soft/50 px-4 py-3 text-[11px] leading-6 text-ink-muted">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <span>این ابزار غربالگری پژوهشی است، تشخیص بالینی محسوب نمیشود. نتایج توسط متخصص تفسیر میشود.</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>لغو</Button>
            <Button leftIcon={<Play size={16} />} onClick={() => void start()}>شروع تست</Button>
          </div>
        </div>
      ) : phase === 'countdown' ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-4">
          <p className="text-sm font-semibold text-ink-muted">تست بهزودی آغاز میشود</p>
          <div className="nums text-7xl font-black text-primary" dir="ltr">{countdown}</div>
          <p className="text-[11px] text-ink-muted">آماده باشید؛ با دیدن یا شنیدن رقم ۱ پاسخ دهید.</p>
        </div>
      ) : phase === 'running' ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
              <span>
                {currentTrial?.modality === 'visual' ? 'بخش دیداری' : 'بخش شنیداری'} — کارآزمایی{' '}
                <span className="nums" dir="ltr">{currentIndex + 1}</span> از{' '}
                <span className="nums" dir="ltr">{protocol?.total_trials}</span>
              </span>
              <span className="nums" dir="ltr">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
              <div className="h-full rounded-pill bg-primary transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 bg-surface-2/30">
            {showingStimulus ? (
              currentTrial?.modality === 'visual' ? (
                <div className="nums select-none text-9xl font-black leading-none text-primary" dir="ltr">
                  {currentTrial.digit}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Volume2 size={44} />
                  </div>
                  <p className="text-xs font-semibold text-ink-muted">صدا را بشنوید…</p>
                </div>
              )
            ) : (
              <div className="h-24 w-24 rounded-full border-2 border-dashed border-border" />
            )}
            <div className={`h-3 w-3 rounded-pill transition-colors ${responsePulse ? 'bg-success' : 'bg-transparent'}`} />
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                recordResponse();
              }}
              className="h-16 w-64 rounded-2xl bg-primary text-lg font-bold text-white shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
            >
              پاسخ (Space)
            </button>
          </div>
        </div>
      ) : phase === 'saving' ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3">
          <Spinner label="در حال محاسبه و ذخیره نتایج…" />
          <p className="text-[11px] text-ink-muted">تمام نمرات توسط سرور محاسبه و در پرونده مراجع ذخیره میشوند.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-error-soft px-4 py-3 text-xs font-semibold text-error">
              <span>{error}</span>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RotateCcw size={14} />}
                onClick={() => protocol && void submit(protocol)}
              >
                تلاش مجدد
              </Button>
            </div>
          ) : null}
          {saved ? (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-success">
                <CheckCircle2 size={22} />
                <div>
                  <p className="text-sm font-bold">نتیجه تست بهطور خودکار در پرونده مراجع ذخیره شد.</p>
                  <p className="mt-0.5 text-[11px]">شناسه ارزیابی: <span className="nums" dir="ltr">#{saved.id}</span></p>
                </div>
              </div>

              {(['visual', 'auditory'] as const).map((modality) => (
                <div key={modality}>
                  <div className="mb-2 flex items-center gap-2">
                    {modality === 'visual' ? <Monitor size={17} className="text-primary" /> : <Headphones size={17} className="text-accent" />}
                    <p className="text-xs font-bold text-ink">{modality === 'visual' ? 'بخش دیداری' : 'بخش شنیداری'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {MODALITY_METRICS.map((metric) => {
                      const value = perModality?.[modality]?.[metric.key];
                      return (
                        <div key={metric.key} className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2">
                          <p className="text-[10px] text-ink-muted">{metric.label}</p>
                          <p className="nums mt-0.5 text-base font-bold text-ink" dir="ltr">
                            {typeof value === 'number' ? formatDecimal(value, metric.key.includes('rt') ? 0 : 2) : '—'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {overall ? (
                <div className="rounded-xl border border-primary/25 bg-primary-soft/40 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-ink">خلاصه کلی</p>
                    <Badge tone="primary" dot>IVA-CPT</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-ink-muted">
                    <span>اصابت: <b className="nums text-ink" dir="ltr">{overall.hits}</b></span>
                    <span>خطای کاذب: <b className="nums text-ink" dir="ltr">{overall.false_alarms}</b></span>
                    <span>نرخ اصابت: <b className="nums text-ink" dir="ltr">{formatDecimal(overall.hit_rate, 2)}</b></span>
                    <span>حساسیت d': <b className="nums text-ink" dir="ltr">{formatDecimal(overall.d_prime, 2)}</b></span>
                    <span>میانگین واکنش: <b className="nums text-ink" dir="ltr">{formatDecimal(overall.mean_hit_rt_ms, 0)} ms</b></span>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>بستن</Button>
            {protocol ? (
              <Button leftIcon={<Play size={16} />} onClick={() => void start()}>اجرای مجدد تست</Button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
