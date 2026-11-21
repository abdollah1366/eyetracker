import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleDot,
  Eye,
  ScanEye,
  ShieldCheck,
} from 'lucide-react';
import { apiErrorMessage, asItems, participantsApi, sessionsApi } from '../lib/api';
import { newIdempotencyKey } from '../lib/idb';
import { enterFullscreen, exitFullscreen } from '../lib/fullscreen';
import { formatDecimal, formatPercent } from '../lib/format';
import type {
  Calibration,
  Participant,
  Session,
  SessionLabel,
} from '../lib/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { MediaPipeGaze } from '../components/gaze/MediaPipeGaze';
import { EyeOverlay } from '../components/gaze/EyeOverlay';
import { CalibrationOverlay } from '../components/gaze/Calibration';
import { CollectionOverlay, type StimulusItem, type StimulusStat } from '../components/gaze/Collection';
import { NotCalculated, QualityBadge } from '../components/QualityBadge';

type Stage = 'consent' | 'camera' | 'calibration' | 'calibration-overlay' | 'collection' | 'result';

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: 'consent', label: 'رضایت و شرکتکننده' },
  { key: 'camera', label: 'بررسی دوربین' },
  { key: 'calibration', label: 'کالیبراسیون' },
  { key: 'collection', label: 'جمعآوری' },
  { key: 'result', label: 'نتیجه کیفیت' },
];

const STIMULUS_TARGET = 10;

/** Honestly probe which of the 10 protocol stimuli are actually available. */
function probeStimuli(): Promise<StimulusItem[]> {
  const results: StimulusItem[] = [];
  return Promise.all(
    Array.from({ length: STIMULUS_TARGET }, (_, i) => {
      const n = i + 1;
      return new Promise<StimulusItem | null>((resolve) => {
        const img = new Image();
        const timeout = window.setTimeout(() => resolve(null), 4000);
        img.onload = () => {
          window.clearTimeout(timeout);
          resolve(
            img.naturalWidth > 0
              ? { url: `/stimuli/ADHD/${n}.jpg`, label: String(n), key: String(n) }
              : null,
          );
        };
        img.onerror = () => {
          window.clearTimeout(timeout);
          resolve(null);
        };
        img.src = `/stimuli/ADHD/${n}.jpg?probe=${Date.now()}`;
      });
    }),
  ).then((found) => {
    found.forEach((f) => f && results.push(f));
    return results.sort((a, b) => Number(a.key) - Number(b.key));
  });
}

export function SessionWizard() {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('consent');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantId, setParticipantId] = useState<string>('');
  const [label, setLabel] = useState<SessionLabel>('ADHD');
  const [consentGuardian, setConsentGuardian] = useState(false);
  const [consentAssent, setConsentAssent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [stimuli, setStimuli] = useState<StimulusItem[]>([]);
  const [stimuliChecked, setStimuliChecked] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<MediaPipeGaze | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<Session | null>(null);
  const [creating, setCreating] = useState(false);
  const [flowMessage, setFlowMessage] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => newIdempotencyKey('session'), []);

  useEffect(() => {
    participantsApi.list({ limit: 500 }).then((res) => setParticipants(res.items ?? [])).catch(() => undefined);
    probeStimuli().then((found) => {
      setStimuli(found);
      setStimuliChecked(true);
    });
  }, []);

  // Cleanup camera + engine on unmount.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      engineRef.current?.close();
      void exitFullscreen();
    },
    [],
  );

  const missingStimuli = STIMULUS_TARGET - stimuli.length;

  const startCamera = async () => {
    setCameraStatus('starting');
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const engine = new MediaPipeGaze();
      await engine.init();
      engineRef.current = engine;
      setCameraStatus('ready');
    } catch (err) {
      setCameraError(apiErrorMessage(err));
      setCameraStatus('error');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const proceedConsent = () => {
    if (!participantId) {
      setConsentError('لطفاً شرکتکننده را انتخاب کنید.');
      return;
    }
    if (!consentGuardian || !consentAssent) {
      setConsentError('هر دو رضایتنامه باید تأیید شوند.');
      return;
    }
    setConsentError(null);
    setStage('camera');
  };

  const startCalibration = () => {
    // Request fullscreen in the click handler; the overlay also retries on mount.
    void enterFullscreen();
    setStage('calibration-overlay');
  };

  const beginCollection = async (cal: Calibration | null = calibration) => {
    if (!cal || !participantId) {
      void exitFullscreen();
      setStage('calibration');
      return;
    }
    if (stimuli.length === 0) {
      toast.error('هیچ محرکی یافت نشد؛ جمعآوری امکانپذیر نیست.');
      void exitFullscreen();
      setStage('calibration');
      return;
    }
    // If this is called from the click handler, the user activation is still
    // valid. On the automatic path we are already fullscreen, so this is a no-op.
    await enterFullscreen();
    setCreating(true);
    setFlowMessage('در حال ایجاد جلسه و آمادهسازی محرکها…');
    try {
      const created = await sessionsApi.create({
        participant_id: participantId,
        label,
        stimulus_set: 'ADHD',
        // Same viewport the calibration targets were captured in.
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        calibration: cal,
        started_at: new Date().toISOString(),
        client_meta: {
          user_agent: navigator.userAgent,
          stimulus_count: stimuli.length,
          protocol_target: STIMULUS_TARGET,
          camera_width: videoRef.current?.videoWidth ?? null,
          camera_height: videoRef.current?.videoHeight ?? null,
        },
        idempotency_key: idempotencyKey,
      });
      setSession(created);
      setFlowMessage('جلسه ساخته شد — آغاز جمعآوری داده');
      setStage('collection');
    } catch (err) {
      const message = apiErrorMessage(err);
      setFlowMessage(`خطا: ${message}`);
      toast.error(message);
      void exitFullscreen();
      setStage('calibration');
    } finally {
      setCreating(false);
    }
  };

  const finishCollection = useCallback(
    async (stats: StimulusStat[]) => {
      if (!session) return;
      const totalSamples = stats.reduce((s, x) => s + x.samples, 0);
      const totalValid = stats.reduce((s, x) => s + x.valid, 0);
      const validRatio = totalSamples ? totalValid / totalSamples : 0;
      try {
        const complete = await sessionsApi.complete(session.id, {
          ended_at: new Date().toISOString(),
          quality: {
            valid_gaze_ratio: validRatio,
            tracking_loss_ratio: totalSamples ? 1 - validRatio : 1,
            calibration_error_px: calibration?.mean_error_px ?? null,
            stimuli_completed: stats.length,
            protocol_target: STIMULUS_TARGET,
          },
        });
        const detail = await sessionsApi.get(complete.id);
        setResult(detail);
        setStage('result');
      } catch (err) {
        toast.error(apiErrorMessage(err));
      } finally {
        void exitFullscreen();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        engineRef.current?.close();
      }
    },
    [session, calibration, toast],
  );

  const activeIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div>
      <PageHeader
        eyebrow="ثبت جلسه"
        title="جلسه ردیابی چشم جدید"
        subtitle="رضایت → دوربین → کالیبراسیون → جمعآوری → نتیجه کیفیت"
      />

      {/* stepper */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < activeIndex
                  ? 'bg-success text-white'
                  : i === activeIndex
                    ? 'bg-primary text-white'
                    : 'bg-surface-2 text-ink-subtle border border-border'
              }`}
            >
              {i < activeIndex ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={`hidden text-[11px] font-semibold sm:inline ${i === activeIndex ? 'text-ink' : 'text-ink-subtle'}`}>
              {s.label}
            </span>
            {i < STAGES.length - 1 ? <span className="mx-1 h-px w-5 bg-border sm:w-8" /> : null}
          </div>
        ))}
      </div>

      {/* stimulus protocol warning */}
      {stimuliChecked && missingStimuli > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/70 p-4">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="text-xs font-bold text-ink">هشدار پروتکل محرکها</p>
            <p className="mt-1 text-[11px] leading-6 text-ink-muted">
              هدف پروتکل {STIMULUS_TARGET} محرک است، اما {stimuli.length} فایل در{' '}
              <code dir="ltr" className="nums rounded bg-surface px-1">/stimuli/ADHD/</code> موجود است؛ محرک دهم تأمین نشده است.
              از تکثیر یا ساخت محرک جایگزین خودداری میشود و جمعآوری با همان محرکهای موجود انجام میشود.
            </p>
          </div>
        </div>
      ) : null}

      {/* ---- consent ---- */}
      {stage === 'consent' ? (
        <Card>
          <CardHeader title="رضایت و انتخاب شرکتکننده" subtitle="پیش از آغاز، رضایتنامهها و شرکتکننده مشخص شوند." />
          {consentError ? (
            <div className="mb-4 rounded-xl border border-error/25 bg-error-soft px-4 py-3 text-xs font-semibold text-error">
              {consentError}
            </div>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">شرکتکننده</label>
              <select
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">انتخاب کنید…</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.research_id} — {p.age} سال
                  </option>
                ))}
              </select>

              <label className="mb-1.5 mt-4 block text-xs font-semibold text-ink">گروه آزمودنی</label>
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value as SessionLabel)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="ADHD">ADHD</option>
                <option value="CONTROL">گروه کنترل</option>
                <option value="UNKNOWN">نامشخص</option>
              </select>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck size={16} className="text-primary" /> رضایتنامهها
              </p>
              <label className="flex items-start gap-3 text-xs leading-6 text-ink">
                <input type="checkbox" checked={consentGuardian} onChange={(e) => setConsentGuardian(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                رضایت والد یا سرپرست قانونی اخذ و ثبت شده است.
              </label>
              <label className="flex items-start gap-3 text-xs leading-6 text-ink">
                <input type="checkbox" checked={consentAssent} onChange={(e) => setConsentAssent(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                رضایت آگاهانه کودک (Assent) اخذ و ثبت شده است.
              </label>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button leftIcon={<Eye size={18} />} onClick={proceedConsent}>
              ادامه به بررسی دوربین
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ---- camera check ---- */}
      {stage === 'camera' ? (
        <Card>
          <CardHeader title="بررسی دوربین" subtitle="دوربین فعال شود و مدل تشخیص چهره بارگذاری گردد." />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-sidebar">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ transform: 'scaleX(-1)' }}
                className="h-full w-full object-cover"
              />
              <EyeOverlay engine={engineRef.current} video={videoRef.current} mirrored />
              {cameraStatus !== 'ready' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sidebar/85 text-white">
                  <Camera size={36} className="text-white/70" />
                  <p className="text-xs font-semibold">پیشنمایش دوربین</p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col justify-center">
              {cameraStatus === 'error' ? (
                <div className="mb-4 rounded-xl border border-error/25 bg-error-soft px-4 py-3 text-xs font-semibold text-error">
                  {cameraError}
                </div>
              ) : null}
              {cameraStatus === 'ready' ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-xs font-semibold text-success">
                  <CheckCircle2 size={18} /> دوربین و مدل تشخیص چهره آمادهاند.
                </div>
              ) : null}
              {cameraStatus === 'starting' ? (
                <div className="mb-4">
                  <Spinner label="در حال بارگذاری مدل…" />
                </div>
              ) : null}
              <p className="mb-5 text-xs leading-6 text-ink-muted">
                فریم خام دوربین هرگز به سرور ارسال نمیشود. تنها مختصات نگاه استخراجشده و آمار کیفیت
                محلی به سامانه فرستاده میشود.
              </p>
              <div className="flex gap-3">
                {cameraStatus !== 'ready' ? (
                  <Button leftIcon={<Camera size={18} />} onClick={startCamera} loading={cameraStatus === 'starting'}>
                    فعالسازی دوربین
                  </Button>
                ) : (
                  <Button
                    leftIcon={<ScanEye size={18} />}
                    onClick={startCalibration}
                    disabled={stimuli.length === 0}
                  >
                    آغاز کالیبراسیون (تمامصفحه)
                  </Button>
                )}
              </div>
              {stimuli.length === 0 && stimuliChecked ? (
                <p className="mt-3 text-[11px] text-error">هیچ محرکی یافت نشد؛ جمعآوری امکانپذیر نیست.</p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* ---- calibration ---- */}
      {stage === 'calibration' ? (
        <Card>
          <CardHeader title="کالیبراسیون ۵ نقطهای" subtitle="چهار گوشه صفحه و سپس مرکز — در حالت تمامصفحه ثبت شد." />
          {flowMessage ? (
            <div className="mx-6 mt-4 rounded-xl bg-error-soft px-4 py-2 text-center text-xs font-semibold text-error">
              {flowMessage}
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            {calibration ? (
              <>
                <Badge tone="success" dot>کالیبراسیون تکمیل شد</Badge>
                <div className="flex gap-6 text-xs">
                  <div>
                    <p className="text-ink-muted">میانگین خطا</p>
                    <p className="nums mt-1 text-lg font-bold text-ink">{formatDecimal(calibration.mean_error_px, 1)} px</p>
                  </div>
                  <div>
                    <p className="text-ink-muted">میانه خطا</p>
                    <p className="nums mt-1 text-lg font-bold text-ink">{formatDecimal(calibration.median_error_px, 1)} px</p>
                  </div>
                </div>
                <p className="text-xs text-ink-muted">
                  کالیبراسیون ذخیره شد. برای نمایش محرکها در تمامصفحه، مرحله بعد را آغاز کنید.
                </p>
                <Button
                  leftIcon={<ScanEye size={18} />}
                  onClick={() => void beginCollection()}
                  loading={creating}
                >
                  ادامه: آغاز جمعآوری ({stimuli.length} محرک)
                </Button>
              </>
            ) : (
              <>
                <CircleDot size={48} className="text-primary" />
                <p className="text-sm text-ink-muted">کالیبراسیون در صفحه تمامصفحه آغاز میشود.</p>
                <Button onClick={startCalibration}>شروع کالیبراسیون</Button>
              </>
            )}
          </div>
        </Card>
      ) : null}

      {stage === 'calibration-overlay' ? (
        <CalibrationOverlay
          engine={engineRef.current}
          video={videoRef.current}
          onComplete={(cal) => {
            setCalibration(cal);
            toast.success('کالیبراسیون ۵ نقطهای تکمیل شد');
            // Direct transition — no timers. We stay in fullscreen, so
            // beginCollection does not need a new user gesture.
            void beginCollection(cal);
          }}
          onContinue={() => void beginCollection()}
          status={flowMessage}
          onCancel={() => {
            void exitFullscreen();
            setStage('calibration');
          }}
        />
      ) : null}

      {/* ---- collection ---- */}
      {stage === 'collection' && session && calibration ? (
        <CollectionOverlay
          engine={engineRef.current}
          video={videoRef.current}
          calibration={calibration}
          session={session}
          stimuli={stimuli}
          onComplete={finishCollection}
          onAbort={() => {
            void exitFullscreen();
            setStage('camera');
          }}
        />
      ) : null}

      {/* ---- quality result ---- */}
      {stage === 'result' && result ? (
        <Card>
          <CardHeader title="نتیجه ارزیابی کیفیت" subtitle="بر اساس درجهبندی اعمالشده توسط سامانه" />
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <QualityBadge status={result.status} quality={result.quality} />
              {result.quality ? (
                <>
                  <span className="text-xs text-ink-muted">نسبت نگاه معتبر:</span>
                  <span className="nums text-sm font-bold text-ink">{formatPercent(result.quality.valid_gaze_ratio)}</span>
                </>
              ) : null}
            </div>

            {result.quality?.reasons?.length ? (
              <div className="rounded-xl border border-border bg-surface-2/50 p-4">
                <p className="mb-2 text-xs font-bold text-ink">دلایل کیفیت</p>
                <ul className="list-disc space-y-1 pr-5 text-[11px] text-ink-muted">
                  {result.quality.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}

            {result.quality?.status === 'VALID' && result.risk?.probability != null ? (
              <div className="rounded-xl border border-primary/20 bg-primary-soft/60 p-4">
                <p className="text-xs font-bold text-ink">احتمال مدل</p>
                <p className="nums mt-1 text-2xl font-extrabold text-primary">{formatPercent(result.risk.probability)}</p>
                <p className="mt-1 text-[11px] text-ink-muted">نسخه مدل: {result.risk.version}</p>
              </div>
            ) : (
              <NotCalculated reason="کیفیت داده معتبر نیست یا مدل در دسترس نمیباشد." />
            )}

            <div className="flex flex-wrap gap-3">
              <Link to={`/sessions/${result.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
                مشاهده جزئیات جلسه
              </Link>
              <Link to="/sessions/new" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2">
                جلسه جدید
              </Link>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
