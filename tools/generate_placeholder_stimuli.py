"""Generates 10 PLACEHOLDER stimulus images into stimuli/ADHD/ so the app
can be run and tested end-to-end before the real, rights-cleared study
images (chosen per the thesis protocol, chapter 3) are ready.

These are NOT research stimuli. Each image is clearly watermarked as a
placeholder. Re-run this any time to regenerate them:

    python tools/generate_placeholder_stimuli.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'stimuli' / 'ADHD'
W, H = 1280, 720
N_STIMULI = 10


def make_placeholder(index, total):
    img = np.full((H, W, 3), 235, dtype=np.uint8)

    # 3x3 AOI reference grid (see thesis note on AOI definition).
    for gx in (W // 3, 2 * W // 3):
        cv2.line(img, (gx, 0), (gx, H), (210, 210, 210), 1)
    for gy in (H // 3, 2 * H // 3):
        cv2.line(img, (0, gy), (W, gy), (210, 210, 210), 1)

    # A simple target that moves to a different grid cell per stimulus,
    # just so sessions aren't visually identical frame to frame.
    cell = index % 9
    cx = (cell % 3) * (W // 3) + (W // 6)
    cy = (cell // 3) * (H // 3) + (H // 6)
    cv2.circle(img, (cx, cy), 60, (80, 140, 220), -1)

    cv2.putText(img, f'PLACEHOLDER STIMULUS {index + 1}/{total}', (40, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1.1, (40, 40, 40), 2)
    cv2.putText(img, 'NOT FOR REAL DATA COLLECTION', (40, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (40, 40, 160), 2)
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = list(OUT_DIR.glob('*.png'))
    if existing and '--force' not in sys.argv:
        print(f'{len(existing)} image(s) already in {OUT_DIR}. '
              'Pass --force to overwrite.')
        return
    for i in range(N_STIMULI):
        path = OUT_DIR / f'placeholder_{i + 1:02d}.png'
        cv2.imwrite(str(path), make_placeholder(i, N_STIMULI))
    print(f'Wrote {N_STIMULI} placeholder stimuli to {OUT_DIR}')


if __name__ == '__main__':
    main()
