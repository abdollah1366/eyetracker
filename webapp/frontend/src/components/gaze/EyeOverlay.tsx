import { useEffect, useRef } from 'react';
import type { MediaPipeGaze } from './MediaPipeGaze';

/**
 * Green eye / pupil landmarks drawn locally on top of the webcam preview.
 * Used only in the camera-check and calibration stages — never during the
 * real stimulus collection, so the participant is not distracted.
 *
 * No image data is uploaded: MediaPipe reads the <video> element in-browser
 * and only numeric landmarks are used to paint this canvas.
 */
export function EyeOverlay({
  engine,
  video,
  mirrored = false,
}: {
  engine: MediaPipeGaze | null;
  video: HTMLVideoElement | null;
  mirrored?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine || !video) return;

    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.max(1, Math.round(rect.width * dpr));
      const ph = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const data = engine.extract(video, now);
      if (!data) return;

      // The video uses object-cover: convert normalized video coordinates
      // into the rendered (possibly mirrored) element's pixel coordinates.
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const scale = Math.max(rect.width / vw, rect.height / vh);
      const rw = vw * scale;
      const rh = vh * scale;
      const ox = (rect.width - rw) / 2;
      const oy = (rect.height - rh) / 2;
      const map = (nx: number, ny: number) => {
        const x = ox + nx * rw;
        return { x: mirrored ? rect.width - x : x, y: oy + ny * rh };
      };

      const green = '#15793A';
      const bright = '#4ADE80';
      ctx.lineWidth = 2;
      ctx.strokeStyle = green;
      ctx.fillStyle = bright;

      const drawEye = (
        box: { x: number; y: number; w: number; h: number },
        iris: { x: number; y: number },
      ) => {
        const padX = box.w * 0.18;
        const padY = box.h * 0.35;
        const topLeft = map(box.x - padX, box.y - padY);
        const bottomRight = map(box.x + box.w + padX, box.y + box.h + padY);
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const w = Math.abs(bottomRight.x - topLeft.x);
        const h = Math.abs(bottomRight.y - topLeft.y);
        ctx.strokeRect(x, y, w, h);

        const p = map(iris.x, iris.y);
        const r = Math.max(6, Math.min(rect.width, rect.height) * 0.011);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
        ctx.stroke();

        // Small crosshair makes gaze direction easy to verify.
        ctx.beginPath();
        ctx.moveTo(p.x - r * 2.6, p.y);
        ctx.lineTo(p.x - r * 1.2, p.y);
        ctx.moveTo(p.x + r * 1.2, p.y);
        ctx.lineTo(p.x + r * 2.6, p.y);
        ctx.stroke();
      };

      drawEye(data.overlay.leftEye, data.overlay.leftIris);
      drawEye(data.overlay.rightEye, data.overlay.rightIris);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, video, mirrored]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
