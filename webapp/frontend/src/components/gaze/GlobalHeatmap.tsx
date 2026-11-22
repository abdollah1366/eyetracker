import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { sessionsApi } from '../../lib/api';
import { enNumber } from '../../lib/format';
import type { GlobalHeatmap as GlobalHeatmapData } from '../../lib/types';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';

/** Cool→warm ramp matching the per-session heatmap palette. */
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [14, 116, 144]], // primary teal
  [0.45, [46, 168, 138]], // teal-green
  [0.72, [208, 138, 17]], // warning amber
  [1.0, [209, 57, 15]], // accent red
];

function rampColor(t: number): [number, number, number] {
  for (let i = 1; i < COLOR_STOPS.length; i += 1) {
    const [p1, c1] = COLOR_STOPS[i];
    if (t <= p1) {
      const [p0, c0] = COLOR_STOPS[i - 1];
      const k = (t - p0) / (p1 - p0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

/**
 * Mean gaze density across ALL sessions and ALL stimuli. The backend returns a
 * fixed normalized 48×27 grid; every session's points are scaled by its own
 * screen size before binning, so different monitors can be averaged fairly.
 * No raw camera frames are ever involved.
 */
export function GlobalHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GlobalHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    sessionsApi
      .globalHeatmap(selected || undefined)
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gw = data.grid_width;
    const gh = data.grid_height;
    const off = document.createElement('canvas');
    off.width = gw;
    off.height = gh;
    const octx = off.getContext('2d');
    if (!octx) return;

    const img = octx.createImageData(gw, gh);
    for (let y = 0; y < gh; y += 1) {
      for (let x = 0; x < gw; x += 1) {
        const v = data.grid[y]?.[x] ?? 0;
        const i = (y * gw + x) * 4;
        if (v <= 0.01) {
          img.data[i] = 247;
          img.data[i + 1] = 248;
          img.data[i + 2] = 248;
        } else {
          const [r, g, b] = rampColor(Math.min(1, Math.max(0, v)));
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
        }
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, gw, gh, 0, 0, W, H);
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Spinner label="در حال بارگذاری نقشه حرارتی کلی" />
      </div>
    );
  }

  if (!data || data.point_count === 0) {
    return (
      <EmptyState
        title="نقطه نگاهی ثبت نشده است"
        description="پس از ثبت جلسات معتبر، میانگین نقشه حرارتی تمام تصاویر در اینجا نمایش داده میشود."
        compact
      />
    );
  }

  const stat = (label: string, value: string) => (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3">
      <p className="text-[10px] text-ink-muted">{label}</p>
      <p className="nums mt-1 text-lg font-extrabold text-ink">{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stat('مجموع نقاط نگاه', enNumber(data.point_count))}
        {stat('تعداد جلسات', enNumber(data.session_count))}
        {stat('تعداد تصاویر', enNumber(data.stimulus_count))}
      </div>

      {data.stimuli.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected('')}
            className={`nums rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              selected === ''
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-surface text-ink-muted hover:border-border-strong'
            }`}
          >
            همه تصاویر
          </button>
          {data.stimuli.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelected(s)}
              className={`nums rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                selected === s
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-surface text-ink-muted hover:border-border-strong'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-border bg-canvas">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="block aspect-[16/9] w-full"
          aria-label="میانگین نقشه حرارتی نگاه تمام تصاویر"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-ink backdrop-blur">
          <Layers size={13} />
          میانگین {selected ? `تصویر ${selected}` : 'تمام تصاویر'}
        </div>
      </div>

      <div className="flex items-center gap-3" dir="ltr">
        <span className="text-[10px] text-ink-muted">کم</span>
        <div
          className="h-2 flex-1 rounded-pill"
          style={{
            background: `linear-gradient(to right, ${COLOR_STOPS.map(([p, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${p * 100}%`).join(', ')})`,
          }}
        />
        <span className="text-[10px] text-ink-muted">زیاد</span>
      </div>
      <p className="text-[11px] leading-6 text-ink-subtle">
        هر نقطه نگاه بر اساس اندازه صفحه همان جلسه نرمالسازی شده، سپس میانگین تمام جلسات و تصاویر محاسبه شده است.
        فقط نمونههای معتبر ردیابی وارد میشوند و هیچ فریم خام دوربینی ذخیره یا ارسال نمیشود.
      </p>
    </div>
  );
}
