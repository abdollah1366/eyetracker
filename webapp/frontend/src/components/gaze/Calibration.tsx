import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, X } from 'lucide-react';
import type { Calibration, CalibrationPoint } from '../../lib/types';
import {
  fitGazeMapping,
  medianVector,
  predictScreen,
  type MediaPipeGaze,
} from './MediaPipeGaze';

const SETTLE_MS = 350;
const DWELL_MS = 1500;
const MIN_POINTS = 7;

/** 3x3 grid in normalized screen coordinates. */
const GRID: Array<[number, number]> = [
  [0.1, 0.12],
  [0.5, 0.12],
  [0.9, 0.12],
  [0.1, 0.5],
  [0.5, 0.5],
  [0.9, 0.5],
  [0.1, 0.88],
  [0.5, 0.88],
  [0.9, 0.88],
];

export function CalibrationOverlay({
  engine,
  video,
  onComplete,
  onCancel,
}: {
  engine: MediaPipeGaze | null;
  video: HTMLVideoElement | null;
  onComplete: (calibration: Calibration) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'settle' | 'dwell'>('settle');
  const [frameTick, setFrameTick] = useState(0);
  const [collected, setCollected] = useState<CalibrationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const featuresRef = useRef<number[][]>([]);
  const rafRef = useRef<number>(0);
  const phaseStartRef = useRef<number>(performance.now());
  const collectedRef = useRef<CalibrationPoint[]>([]);

  const targets = useMemo(
    () =>
      GRID.map(([nx, ny]) => ({
        x: Math.round(nx * window.innerWidth),
        y: Math.round(ny * window.innerHeight),
      })),
    [],
  );
  const target = targets[Math.min(index, targets.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const finish = useCallback(() => {
    const points = collectedRef.current;
    if (points.length < MIN_POINTS) {
      setError(`حداقل ${MIN_POINTS} نقطه باید ثبت شود؛ فقط ${points.length} نقطه ثبت شد.`);
      return;
    }
    const fit = fitGazeMapping(
      points.map((p) => p.feature),
      points.map((p) => [p.target_x, p.target_y]),
    );
    const withErrors: CalibrationPoint[] = points.map((p) => {
      const [px, py] = predictScreen(p.feature, fit.coef);
      return { ...p, error_px: Math.hypot(px - p.target_x, py - p.target_y) };
    });
    onComplete({
      coef: fit.coef,
      mean_error_px: fit.meanErrorPx,
      median_error_px: fit.medianErrorPx,
      points: withErrors,
      created_at: new Date().toISOString(),
    });
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
          // finish reads the ref populated above.
          window.setTimeout(finish, 0);
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

  return (
    <div className="fixed inset-0 z-[70] bg-[#061f27] text-white" dir="rtl">
      {/* live camera preview stays tiny in the corner — frames never uploaded */}
      {video ? (
        <video
          ref={(el) => {
            if (el && el.srcObject !== video.srcObject) el.srcObject = video.srcObject;
          }}
          autoPlay
          muted
          playsInline
          className="pointer-events-none absolute bottom-4 left-4 h-24 w-32 rounded-lg object-cover opacity-40"
        />
      ) : null}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-6">
        <div>
          <p className="text-xs font-semibold text-white/60">کالیبراسیون ۹ نقطهای</p>
          <p className="mt-1 text-sm font-bold">
            نقطه {index + 1} از {targets.length}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="لغو کالیبراسیون"
        >
          <X size={22} />
        </button>
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
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-8 text-center">
        <p className="text-sm font-semibold text-white/80">
          {phase === 'settle' ? 'روی نقطه تمرکز کنید…' : 'نگاه خود را ثابت نگه دارید'}
        </p>
        <p className="mt-1 text-[11px] text-white/45">برای لغو از کلید Esc استفاده کنید</p>
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
    </div>
  );
}
