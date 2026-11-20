/**
 * MediaPipeGaze — browser port of the legacy `gaze_engine.py`.
 *
 * Produces the SAME 4-feature vector as the Python engine:
 *   [ lnorm_x, lnorm_y, rnorm_x, rnorm_y ]
 * using FaceMesh refined iris/eye landmarks. Calibration therefore stays
 * compatible with the backend's 2nd-order polynomial model (15 coefficients).
 *
 * IMPORTANT: raw camera frames never leave the browser. Only derived landmark
 * coordinates, the normalized feature vector and scalar brightness statistics
 * are ever handed to callers for upload.
 */
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { GazeFeatureVector } from '../../lib/types';

// MediaPipe FaceMesh refined landmarks (identical ids to legacy config.py).
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];
const LEFT_EYE_CORNERS: [number, number] = [33, 133];
const RIGHT_EYE_CORNERS: [number, number] = [362, 263];
const LEFT_EYE_VERTICAL: [number, number] = [159, 145];
const RIGHT_EYE_VERTICAL: [number, number] = [386, 374];

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface GazeFeatures {
  /** [lnorm_x, lnorm_y, rnorm_x, rnorm_y] — identical to legacy engine. */
  feature: GazeFeatureVector;
  left_iris_x: number;
  left_iris_y: number;
  right_iris_x: number;
  right_iris_y: number;
  face_detected: 1;
}

type Point = { x: number; y: number };

interface NormalizedLandmarkLike {
  x: number;
  y: number;
  z?: number;
}

export class MediaPipeGaze {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private lastResult: { faceLandmarks: NormalizedLandmarkLike[][] } | null = null;

  get isReady(): boolean {
    return this.landmarker !== null;
  }

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  /**
   * Extract gaze features from a video frame. Returns null when no face is found.
   * `timestampMs` must be monotonically increasing (video mode requirement).
   */
  extract(
    video: HTMLVideoElement,
    timestampMs: number,
  ): GazeFeatures | null {
    if (!this.landmarker || video.readyState < 2) return null;

    let result: { faceLandmarks: NormalizedLandmarkLike[][] };
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      // Tasks Vision returns a richer type; we only consume faceLandmarks.
      this.lastResult = this.landmarker.detectForVideo(video, timestampMs) as unknown as {
        faceLandmarks: NormalizedLandmarkLike[][];
      };
    }
    result = this.lastResult ?? { faceLandmarks: [] };

    const faces = result.faceLandmarks;
    if (!faces || faces.length === 0) return null;
    const lm = faces[0];
    if (lm.length < 478) return null;

    const w = video.videoWidth || 1;
    const h = video.videoHeight || 1;

    const px = (i: number): Point => ({ x: lm[i].x * w, y: lm[i].y * h });
    const meanXY = (ids: number[]): Point => {
      let sx = 0;
      let sy = 0;
      for (const id of ids) {
        const p = px(id);
        sx += p.x;
        sy += p.y;
      }
      return { x: sx / ids.length, y: sy / ids.length };
    };
    const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

    const li = meanXY(LEFT_IRIS);
    const ri = meanXY(RIGHT_IRIS);
    const lc = px(LEFT_EYE_CORNERS[0]);
    const rc = px(LEFT_EYE_CORNERS[1]);
    const lcv = px(LEFT_EYE_VERTICAL[0]);
    const lcv2 = px(LEFT_EYE_VERTICAL[1]);
    const rlc = px(RIGHT_EYE_CORNERS[0]);
    const rrc = px(RIGHT_EYE_CORNERS[1]);
    const rcv = px(RIGHT_EYE_VERTICAL[0]);
    const rcv2 = px(RIGHT_EYE_VERTICAL[1]);

    const lwidth = Math.max(dist(lc, rc), 1.0);
    const rwidth = Math.max(dist(rlc, rrc), 1.0);
    const lheight = Math.max(dist(lcv, lcv2), 1.0);
    const rheight = Math.max(dist(rcv, rcv2), 1.0);

    const lnormX = (li.x - lc.x) / lwidth;
    const lnormY = (li.y - (lcv.y + lcv2.y) / 2) / lheight;
    const rnormX = (ri.x - rlc.x) / rwidth;
    const rnormY = (ri.y - (rcv.y + rcv2.y) / 2) / rheight;

    return {
      feature: [lnormX, lnormY, rnormX, rnormY],
      left_iris_x: li.x,
      left_iris_y: li.y,
      right_iris_x: ri.x,
      right_iris_y: ri.y,
      face_detected: 1,
    };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastResult = null;
    this.lastVideoTime = -1;
  }
}

/**
 * Compute luminance statistics from a tiny downscaled copy of the frame.
 * Only scalar numbers are returned — the image bytes are discarded locally
 * and are never transmitted.
 */
export function sampleBrightness(video: HTMLVideoElement): {
  mean: number;
  cv: number;
} | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    return { mean, cv: mean > 0 ? std / mean : 0 };
  } catch {
    // Canvas may be tainted in exotic contexts — fail closed without data.
    return null;
  }
}

/* ---------------- calibration maths (2nd-order polynomial, normal equations) ---------------- */

/** Design matrix identical to legacy `polynomial_design(X, order=2)`. */
export function polynomialDesign(features: number[][]): number[][] {
  const cols: number[][] = [];
  const n = features.length;
  // bias
  cols.push(new Array(n).fill(1));
  // linear
  for (let j = 0; j < 4; j++) cols.push(features.map((row) => row[j] ?? 0));
  // quadratic interactions i<=j
  for (let i = 0; i < 4; i++) {
    for (let j = i; j < 4; j++) {
      cols.push(features.map((row) => (row[i] ?? 0) * (row[j] ?? 0)));
    }
  }
  // transpose to n x 15
  const X: number[][] = Array.from({ length: n }, (_, r) => cols.map((c) => c[r]));
  return X;
}

/** Solve (XᵀX)·coef = XᵀY for a single output via Gaussian elimination. */
function solveNormalEquations(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) continue; // singular — leave coefficient at 0
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Fit a 2 x 15 coefficient matrix mapping features → screen XY. */
export function fitGazeMapping(features: number[][], screenXY: number[][]): {
  coef: number[][];
  meanErrorPx: number;
  medianErrorPx: number;
} {
  const X = polynomialDesign(features);
  const k = X[0]?.length ?? 15;
  const XtX = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)),
  );
  const coefX = solveNormalEquations(
    XtX,
    X.map((row, i) => row.reduce((s, v) => s + v * (screenXY[i]?.[0] ?? 0), 0)),
  );
  const coefY = solveNormalEquations(
    XtX,
    X.map((row, i) => row.reduce((s, v) => s + v * (screenXY[i]?.[1] ?? 0), 0)),
  );

  const errors = X.map((row, i) => {
    const predX = row.reduce((s, v, c) => s + v * coefX[c], 0);
    const predY = row.reduce((s, v, c) => s + v * coefY[c], 0);
    return Math.hypot(predX - (screenXY[i]?.[0] ?? 0), predY - (screenXY[i]?.[1] ?? 0));
  });
  const sorted = [...errors].sort((a, b) => a - b);
  const mean = errors.reduce((s, e) => s + e, 0) / (errors.length || 1);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : 0;
  return { coef: [coefX, coefY], meanErrorPx: mean, medianErrorPx: median };
}

/** Apply a fitted mapping to a single 4-feature vector → screen pixel XY. */
export function predictScreen(feature: number[], coef: number[][]): [number, number] {
  const row = polynomialDesign([feature])[0];
  const x = row.reduce((s, v, c) => s + v * (coef[0]?.[c] ?? 0), 0);
  const y = row.reduce((s, v, c) => s + v * (coef[1]?.[c] ?? 0), 0);
  return [x, y];
}

export function medianVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [0, 0, 0, 0];
  return Array.from({ length: 4 }, (_, col) => {
    const vals = vectors.map((v) => v[col] ?? 0).sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  });
}
