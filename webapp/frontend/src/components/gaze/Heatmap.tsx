import { useEffect, useMemo, useRef, useState } from 'react';
import { sessionsApi } from '../../lib/api';
import type { HeatmapSeries } from '../../lib/types';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';

/** Canvas heatmap rendered from GET /sessions/{id}/heatmap (no raw frames). */
export function Heatmap({
  sessionId,
  screenWidth = 1920,
  screenHeight = 1080,
}: {
  sessionId: string | number;
  screenWidth?: number;
  screenHeight?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<HeatmapSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    sessionsApi
      .heatmap(sessionId)
      .then((res) => {
        if (!active) return;
        setData(res ?? []);
        setSelected(res?.[0]?.stimulus ?? null);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const series = useMemo(
    () => data.find((d) => d.stimulus === selected) ?? data[0] ?? null,
    [data, selected],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !series) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (series.points.length === 0) {
      ctx.fillStyle = '#e9edee';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // Draw additive radial density blobs into an offscreen alpha map.
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, W, H);
    const radius = Math.max(18, Math.round(Math.min(W, H) * 0.06));
    for (const [x, y] of series.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const cx = (x / (screenWidth || 1)) * W;
      const cy = (y / (screenHeight || 1)) * H;
      const g = octx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, 'rgba(255,255,255,0.09)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(cx, cy, radius, 0, Math.PI * 2);
      octx.fill();
    }

    const img = octx.getImageData(0, 0, W, H);
    const d = img.data;
    // Colorize luminance → cool→warm ramp.
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] / 255; // intensity from white blobs over black
      if (v <= 0.01) {
        d[i] = 247;
        d[i + 1] = 248;
        d[i + 2] = 248;
        d[i + 3] = 255;
        continue;
      }
      const t = Math.min(1, v * 1.6);
      const r = Math.round(14 + (209 - 14) * t);
      const g = Math.round(116 + (57 - 116) * t);
      const b = Math.round(144 + (15 - 144) * t);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = Math.round(120 + 135 * t);
    }
    ctx.putImageData(img, 0, 0);
  }, [series, screenWidth, screenHeight]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Spinner label="در حال بارگذاری نقشه حرارتی" />
      </div>
    );
  }

  if (!series) {
    return <EmptyState title="دادهای ثبت نشده است" description="نقشه حرارتی برای این جلسه موجود نیست." compact />;
  }

  return (
    <div>
      {data.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {data.map((d) => (
            <button
              key={d.stimulus}
              onClick={() => setSelected(d.stimulus)}
              className={`nums rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                selected === d.stimulus
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-surface text-ink-muted hover:border-border-strong'
              }`}
            >
              {d.stimulus}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative overflow-hidden rounded-xl border border-border bg-canvas">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="block aspect-[16/9] w-full"
          aria-label="نقشه حرارتی نگاه"
        />
        <div className="absolute bottom-2 left-2 rounded-lg bg-white/85 px-2 py-1 text-[10px] font-semibold text-ink backdrop-blur">
          {series.points.length} نقطه نگاه
        </div>
      </div>
    </div>
  );
}
