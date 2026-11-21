import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleDot, Maximize2, X } from 'lucide-react';
import type { Calibration, CalibrationPoint } from '../../lib/types';
import { enterFullscreen, onViewportChange } from '../../lib/fullscreen';
import { EyeOverlay } from './EyeOverlay';
import {
  fitGazeMapping,
  medianVector,
  predictScreen,
  type MediaPipeGaze,
} from './MediaPipeGaze';

const SETTLE_MS = 350;
const DWELL_MS = 1500;
const MIN_POINTS = 5;

/** Inset keeps corner markers clear of the status/progress overlays and fully visible. */
const EDGE_INSET_X = 96;
const EDGE_INSET_Y = 128;

/** Four true screen corners, then the centre (normalized 0..1). */
const TARGET_POSITIONS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [0.5, 0.5],
];

export function CalibrationOverlay({
  engine,
  video,
  onComplete,
  onContinue,
  status,
  onCancel,
}: {
  engine: MediaPipeGaze | null;
  video: HTMLVideoElement | null;
  onComplete: (calibration: Calibration) => void;
  onContinue: () => void;
  status?: string | null;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'settle' | 'dwell'>('settle');
  const [frameTick, setFrameTick] = useState(0);
  const [collected, setCollected] = useState<CalibrationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const featuresRef = useRef<number[][]>([]);
  const rafRef = useRef<number>(0);
  const phaseStartRef = useRef<number>(performance.now());
  const collectedRef = useRef<CalibrationPoint[]>([]);
  const completedRef = useRef(false);

  // The wizard requests fullscreen on click; retry here if that was blocked.
  useEffect(() => {
    void enterFullscreen();
  }, []);

  // Gaze targets are screen pixels — keep them in sync with the actual
  // fullscreen viewport (including monitor changes / browser resize).
  useEffect(
    () =>
      onViewportChange(() => {
        setIsFullscreen(Boolean(document.fullscreenElement));
        setViewport({ w: window.innerWidth, h: window.innerHeight });
      }),
    [],
  );

  const targets = useMemo(() => {
    const w = Math.max(viewport.w, 2 * EDGE_INSET_X + 1);
    const h = Math.max(viewport.h, 2 * EDGE_INSET_Y + 1);
    return TARGET_POSITIONS.map(([nx, ny]) => ({
      x: Math.round(EDGE_INSET_X + nx * (w - 2 * EDGE_INSET_X)),
      y: Math.round(EDGE_INSET_Y + ny * (h - 2 * EDGE_INSET_Y)),
    }));
  }, [viewport.w, viewport.h]);
  const target = targets[Math.min(index, targets.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    const points = collectedRef.current;
    if (points.length < MIN_POINTS) {
      setError(`حداقل ${MIN_POINTS} نقطه باید ثبت شود؛ فقط ${points.length} نقطه ثبت شد.`);
      return;
    }
    try {
      const fit = fitGazeMapping(
        points.map((p) => p.feature),
        points.map((p) => [p.target_x, p.target_y]),
      );
      const withErrors: CalibrationPoint[] = points.map((p) => {
        const [px, py] = predictScreen(p.feature, fit.coef);
        return { ...p, error_px: Math.hypot(px - p.target_x, py - p.target_y) };
      });
      completedRef.current = true;
      onComplete({
        coef: fit.coef,
        mean_error_px: fit.meanErrorPx,
        median_error_px: fit.medianErrorPx,
        points: withErrors,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(`خطا در محاسبه کالیبراسیون: ${e instanceof Error ? e.message : 'نامشخص'}`);
    }
  }, [onComplete]);

  // Sample features during the dwell phase.
  useEffect(() => {
    if (!engine || !video || phase !== 'dwell') return;
    let cancelled = false;
    const loop = (now: number) => {
      if (cancelled) return;
      const data = engine.extract(video, now);
      if (data) featuresRef.current.push(data.feature);
      setFrameTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [engine, video, phase, index]);

  // Advance phases when the timer for the current phase elapses.
  useEffect(() => {
    phaseStartRef.current = performance.now();
    featuresRef.current = [];
    const duration = phase === 'settle' ? SETTLE_MS : DWELL_MS;
    const id = window.setInterval(() => {
      if (performance.now() - phaseStartRef.current < duration) return;
      if (phase === 'settle') {
        setPhase('dwell');
      } else {
        const median = medianVector(featuresRef.current);
        const t = targets[Math.min(index, targets.length - 1)];
        const next: CalibrationPoint = {
          target_x: t.x,
          target_y: t.y,
          feature: median,
        };
        const updated = [...collectedRef.current, next];
        collectedRef.current = updated;
        setCollected(updated);
        if (index + 1 >= targets.length) {
          window.clearInterval(id);
          // The ref is already updated synchronously — call finish directly
          // so no queued timer can be lost during the fullscreen transition.
          finish();
        } else {
          setIndex((i) => i + 1);
          setPhase('settle');
        }
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [phase, index, targets, finish]);

  // Minimal re-render trigger so the progress ring animates during dwell.
  void frameTick;

  const progress = ((index + (phase === 'dwell' ? 1 : 0)) / targets.length) * 100;

  // Portal to <body>: AppShell has an animated (transformed) wrapper, which
  // would otherwise become the containing block for `position: fixed` and
  // shrink this overlay to a box in the middle of the page.
  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-hidden bg-[#061f27] text-white" dir="rtl">
      {/* LIVE CAMERA FILLS THE WHOLE SCREEN. Only local display — frames are
          never uploaded; MediaPipe reads them directly from this element. */}
      {video ? (
        <video
          ref={(el) => {
            if (el && el.srcObject !== video.srcObject) el.srcObject = video.srcObject;
          }}
          autoPlay
          muted
          playsInline
          style={{ transform: 'scaleX(-1)' }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[#061f27]/35" />
      {/* Green pupil/eye guidance is visible during calibration only. */}
      <EyeOverlay engine={engine} video={video} mirrored />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-6">
        <div>
          <p className="text-xs font-semibold text-white/60">کالیبراسیون ۵ نقطهای — چهار گوشه و مرکز</p>
          <p className="mt-1 text-sm font-bold">
            نقطه {index + 1} از {targets.length}
          </p>
          <p className="nums mt-0.5 text-[11px] text-primary">
            ثبت شده: {collected.length} / {MIN_POINTS}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isFullscreen ? (
            <button
              onClick={() => void enterFullscreen()}
              className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-lg"
            >
              <Maximize2 size={18} /> تمامصفحه
            </button>
          ) : null}
          <button
            onClick={onCancel}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="لغو کالیبراسیون"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[76px] px-6">
        <div className="h-1.5 overflow-hidden rounded-pill bg-white/15">
          <div
            className="h-full rounded-pill bg-primary transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* target */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: target.x, top: target.y }}
      >
        <div className="relative flex items-center justify-center">
          <span
            className={`absolute rounded-full border-2 border-primary/50 transition-all duration-300 ${
              phase === 'dwell' ? 'h-20 w-20 animate-pulse-soft' : 'h-14 w-14'
            }`}
          />
          <CircleDot
            size={phase === 'dwell' ? 34 : 28}
            className={phase === 'dwell' ? 'text-primary' : 'text-white/70'}
          />
          <span className="nums absolute -bottom-7 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white/80">
            {index + 1}/{targets.length}
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-8 text-center">
        <p className="text-sm font-semibold text-white/80">
          {phase === 'settle' ? 'روی نقطه تمرکز کنید…' : 'نگاه خود را ثابت نگه دارید'}
        </p>
        <p className="mt-1 text-[11px] text-white/45">برای لغو از کلید Esc استفاده کنید</p>
        {status ? (
          <p className="mt-3 rounded-xl bg-primary/25 px-4 py-2 text-xs font-bold text-white">
            {status}
          </p>
        ) : null}
        {collected.length >= MIN_POINTS ? (
          <button
            onClick={() => (completedRef.current ? onContinue() : finish())}
            className="pointer-events-auto mt-3 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white shadow-lg"
          >
            اتمام کالیبراسیون و ادامه
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="absolute inset-x-0 bottom-24 mx-auto max-w-md rounded-xl bg-error px-4 py-3 text-center text-xs font-semibold">
          {error}
          <button onClick={onCancel} className="mr-3 underline">
            بازگشت
          </button>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {collected.length} نقطه ثبت شد
      </span>
    </div>,
    document.body,
  );
}
