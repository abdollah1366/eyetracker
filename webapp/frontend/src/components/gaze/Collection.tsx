import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, X } from 'lucide-react';
import { sessionsApi } from '../../lib/api';
import { enqueueEvent, newIdempotencyKey } from '../../lib/idb';
import type { Calibration, GazeSample, Session } from '../../lib/types';
import { predictScreen, sampleBrightness, type MediaPipeGaze } from './MediaPipeGaze';

export interface StimulusItem {
  /** URL, e.g. /stimuli/ADHD/1.jpg */
  url: string;
  /** display label, e.g. "۱" */
  label: string;
  /** stable key used as the stimulus field in the API */
  key: string;
}

export interface StimulusStat {
  key: string;
  samples: number;
  valid: number;
  validRatio: number;
}

export function CollectionOverlay({
  engine,
  video,
  calibration,
  session,
  stimuli,
  onComplete,
  onAbort,
}: {
  engine: MediaPipeGaze | null;
  video: HTMLVideoElement | null;
  calibration: Calibration;
  session: Session;
  stimuli: StimulusItem[];
  onComplete: (stats: StimulusStat[]) => void;
  onAbort: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [sending, setSending] = useState(false);
  const [aborted, setAborted] = useState(false);

  const rafRef = useRef<number>(0);
  const nextSampleAtRef = useRef<number>(0);
  const nextBrightnessAtRef = useRef<number>(0);
  const samplesRef = useRef<GazeSample[]>([]);
  const frameIdRef = useRef(0);
  const statsRef = useRef<StimulusStat[]>([]);
  const brightnessRef = useRef<{ sum: number; sumSq: number; n: number }>({ sum: 0, sumSq: 0, n: 0 });
  const cancelledRef = useRef(false);
  const indexRef = useRef(0);
  const stimulus = stimuli[Math.min(index, stimuli.length - 1)];

  const abort = useCallback(() => {
    cancelledRef.current = true;
    setAborted(true);
    cancelAnimationFrame(rafRef.current);
    onAbort();
  }, [onAbort]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') abort();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abort]);

  const flushStimulus = useCallback(
    async (sampleBatch: GazeSample[]) => {
      if (sampleBatch.length === 0) return;
      const key = stimuli[indexRef.current]?.key ?? String(indexRef.current + 1);
      const b = brightnessRef.current;
      const mean = b.n ? b.sum / b.n : 0;
      const cv = mean > 0 ? Math.sqrt(Math.max(0, b.sumSq / b.n - mean * mean)) / mean : 0;
      const qualityPartial = {
        mean_brightness: mean,
        brightness_cv: cv,
        sample_count: sampleBatch.length,
        valid_count: sampleBatch.filter((s) => s.gaze_valid).length,
      };
      const req = { stimulus: key, samples: sampleBatch, quality_partial: qualityPartial };

      const stat: StimulusStat = {
        key,
        samples: sampleBatch.length,
        valid: qualityPartial.valid_count,
        validRatio: qualityPartial.valid_count / sampleBatch.length,
      };
      statsRef.current = [...statsRef.current, stat];
      setSending(true);
      try {
        await sessionsApi.addSamples(session.id, req);
      } catch {
        // Offline-first: queue the derived samples (never raw frames) for later sync.
        await enqueueEvent({
          idempotency_key: newIdempotencyKey('samples'),
          type: 'SESSION_SAMPLES',
          payload: { session_id: session.id, ...req },
        });
      } finally {
        setSending(false);
      }
    },
    [session.id, stimuli],
  );

  // Main timestamp-based sampling loop for the current stimulus.
  useEffect(() => {
    if (aborted || !stimulus) return;
    cancelledRef.current = false;
    setImageError(false);
    setElapsed(0);
    samplesRef.current = [];
    brightnessRef.current = { sum: 0, sumSq: 0, n: 0 };
    const start = performance.now();
    const DURATION = 10_000;
    const INTERVAL = 33; // ~30 Hz, governed by timestamp not frame count
    nextSampleAtRef.current = start;
    nextBrightnessAtRef.current = start;

    const loop = (now: number) => {
      if (cancelledRef.current) return;
      const t = now - start;
      setElapsed(t);

      // Brightness sampled at a lower, timestamp-driven cadence (~4 Hz).
      if (video && now >= nextBrightnessAtRef.current && video.readyState >= 2) {
        nextBrightnessAtRef.current = now + 250;
        const b = sampleBrightness(video);
        if (b) {
          brightnessRef.current.sum += b.mean;
          brightnessRef.current.sumSq += b.mean * b.mean;
          brightnessRef.current.n += 1;
        }
      }

      if (now >= nextSampleAtRef.current) {
        nextSampleAtRef.current = now + INTERVAL;
        const data = engine && video ? engine.extract(video, now) : null;
        const frameId = frameIdRef.current++;
        if (data) {
          const [gx, gy] = predictScreen(data.feature, calibration.coef);
          const offScreen =
            gx < 0 || gy < 0 || gx > session.screen_width || gy > session.screen_height;
          // A valid gaze outside the screen/stimulus is meaningful behaviour,
          // NOT a tracking loss. Keep it valid and flag it separately.
          samplesRef.current.push({
            timestamp: Math.round(t),
            frame_id: frameId,
            gaze_x: gx,
            gaze_y: gy,
            gaze_valid: true,
            off_screen: offScreen,
            left_iris_x: data.left_iris_x,
            left_iris_y: data.left_iris_y,
            right_iris_x: data.right_iris_x,
            right_iris_y: data.right_iris_y,
          });
        } else {
          // Tracking loss: recorded as invalid, no fabricated coordinates.
          samplesRef.current.push({
            timestamp: Math.round(t),
            frame_id: frameId,
            gaze_x: 0,
            gaze_y: 0,
            gaze_valid: false,
            left_iris_x: 0,
            left_iris_y: 0,
            right_iris_x: 0,
            right_iris_y: 0,
          });
        }
      }

      if (t >= DURATION) {
        void flushStimulus([...samplesRef.current]).then(() => {
          if (indexRef.current + 1 >= stimuli.length) {
            onComplete(statsRef.current);
          } else {
            indexRef.current += 1;
            setIndex(indexRef.current);
          }
        });
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [index, aborted, stimulus, engine, video, calibration, session, flushStimulus, onComplete, stimuli.length]);

  const remaining = Math.max(0, 10 - elapsed / 1000);

  if (aborted) return null;

  // Portal to <body> so the transformed AppShell wrapper cannot turn this
  // fixed overlay into a small centred box.
  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-hidden bg-black text-white" dir="rtl">
      {/* The stimulus occupies the ENTIRE viewport — no padding, no scaling down.
          object-contain keeps the whole image visible without cropping so AOI
          coordinates stay meaningful. */}
      {imageError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle size={36} className="text-warning" />
          <p className="text-sm font-bold">تصویر محرک در دسترس نیست</p>
          <p className="text-xs text-white/50">{stimulus?.url}</p>
        </div>
      ) : (
        <img
          key={stimulus?.url}
          src={stimulus?.url}
          alt={`محرک ${stimulus?.label}`}
          onError={() => setImageError(true)}
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
      )}

      {/* Status controls float above the image so they never shrink it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/75 to-transparent px-6 pb-12 pt-4">
        <div className="pointer-events-auto flex items-center gap-3">
          <Camera size={20} className="text-primary" />
          <div>
            <p className="text-xs font-semibold text-white/60">جمعآوری داده</p>
            <p className="text-sm font-bold">
              محرک {index + 1} از {stimuli.length}
            </p>
          </div>
        </div>
        <button
          onClick={abort}
          className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl bg-black/50 px-4 text-xs font-semibold backdrop-blur transition-colors hover:bg-black/70"
        >
          <X size={18} /> لغو (Esc)
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[76px] z-10 h-1 bg-white/20">
        <div
          className="h-full bg-primary transition-[width] duration-100"
          style={{ width: `${((index + elapsed / 10000) / stimuli.length) * 100}%` }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
        <div className="flex items-center gap-4 rounded-pill bg-black/55 px-5 py-2 backdrop-blur">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white/25">
            <span className="nums text-sm font-bold">{remaining.toFixed(0)}</span>
          </div>
          <p className="text-xs text-white/70">لطفاً تا پایان زمان به تصویر نگاه کنید</p>
        </div>
      </div>

      {sending ? (
        <span className="pointer-events-none absolute bottom-6 right-6 z-10 rounded-pill bg-black/55 px-3 py-1 text-[11px] backdrop-blur">
          در حال ارسال…
        </span>
      ) : null}

      {video ? (
        <video
          ref={(el) => {
            if (el && el.srcObject !== video.srcObject) el.srcObject = video.srcObject;
          }}
          autoPlay
          muted
          playsInline
          className="pointer-events-none absolute bottom-4 left-4 z-10 h-16 w-24 rounded-lg object-cover opacity-25"
        />
      ) : null}
    </div>,
    document.body,
  );
}
