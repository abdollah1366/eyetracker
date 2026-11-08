"""Run one Eye Tracking session for a participant: show each stimulus image
in sequence, record gaze samples, and write the session CSV + quality report.

Usage:
    python record_eye_data.py --participant-id P001 --label ADHD
    python record_eye_data.py --participant-id P002 --label CONTROL
"""
import argparse
import csv
import json
import time

import cv2

from config import CAMERA_INDEX, DATA_DIR, STIMULI_DIR, STIMULUS_DURATION_SEC
from gaze_engine import GazeEngine
from screen_calibrator import load_calibration, map_feature
from quality import QualityMonitor

ESC_KEY = 27


def load_stimuli():
    folder = STIMULI_DIR / 'ADHD'
    if not folder.exists():
        raise RuntimeError(
            f'Stimuli folder not found: {folder}\n'
            'Create it and add the 10 protocol images first '
            '(see stimuli/ADHD/README.md).'
        )
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png'})
    if not files:
        raise RuntimeError(f'No stimulus images found in {folder}.')
    if len(files) != 10:
        print(f'WARNING: protocol target is 10 stimuli; found {len(files)}. '
              'No stimulus will be duplicated automatically.')
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--participant-id', required=True)
    ap.add_argument('--label', choices=['ADHD', 'CONTROL', 'UNKNOWN'], default='UNKNOWN')
    ap.add_argument('--camera', type=int, default=CAMERA_INDEX)
    ap.add_argument('--duration', type=float, default=STIMULUS_DURATION_SEC)
    args = ap.parse_args()

    cal = load_calibration()
    if not cal:
        raise RuntimeError('No calibration found. Run screen_calibrator.py first.')

    files = load_stimuli()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError('Webcam could not be opened.')
    engine = GazeEngine(args.camera)
    q = QualityMonitor()
    out = DATA_DIR / f'{args.participant_id}_eye.csv'

    rows = []
    win = 'ADHD Eye Tracking'
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.setWindowProperty(win, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    sw, sh = cal['screen_width'], cal['screen_height']

    aborted = False
    try:
        for stim in files:
            img = cv2.imread(str(stim))
            if img is None:
                print(f'WARNING: could not read stimulus image {stim}, skipping.')
                continue
            img = cv2.resize(img, (sw, sh))

            start = time.time()
            frame_id = 0
            key = -1  # set before the loop: a stimulus with zero readable frames must not crash here
            while time.time() - start < args.duration:
                ret, frame = cap.read()
                if not ret:
                    continue
                d = engine.extract(frame)
                q.update(frame, d)
                gx = gy = None
                if d:
                    gx, gy = map_feature(d['feature'], cal)
                    gx = max(0, min(sw - 1, gx))
                    gy = max(0, min(sh - 1, gy))
                t = time.time()
                rows.append([
                    args.participant_id, args.label, t, stim.name, frame_id,
                    gx, gy, int(bool(d)),
                    d['left_iris_x'] if d else None, d['left_iris_y'] if d else None,
                    d['right_iris_x'] if d else None, d['right_iris_y'] if d else None,
                ])
                cv2.imshow(win, img)
                key = cv2.waitKey(1) & 255
                if key == ESC_KEY:
                    break
                frame_id += 1
            if key == ESC_KEY:
                aborted = True
                break
    finally:
        cap.release()
        engine.close()
        cv2.destroyAllWindows()

    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['participant_id', 'label', 'timestamp', 'stimulus', 'frame_id',
                    'gaze_x', 'gaze_y', 'gaze_valid',
                    'left_iris_x', 'left_iris_y', 'right_iris_x', 'right_iris_y'])
        w.writerows(rows)

    quality = q.result(cal['mean_error_px'])
    quality['aborted_by_user'] = aborted
    out.with_suffix('.quality.json').write_text(
        json.dumps(quality, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps({'data_file': str(out), 'quality': quality}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
