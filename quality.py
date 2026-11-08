"""Session-level data-quality / validity gate.

Tracks, frame by frame, whether gaze is being measured at all (not whether
the child is looking at the stimulus — that distinction matters: a valid
gaze sample pointed away from the stimulus is still a *valid* sample, see
gaze_x/gaze_y in the output CSV). A session only counts as VALID when:
  - enough frames produced a usable gaze sample (MIN_VALID_GAZE_RATIO)
  - lighting stayed in a workable range
  - the calibration error was acceptable
  - no single continuous tracking dropout exceeded MAX_TRACKING_GAP_SEC
"""
import time
import numpy as np
from config import MIN_VALID_GAZE_RATIO, MAX_TRACKING_GAP_SEC


class QualityMonitor:
    def __init__(self):
        self.total = 0
        self.valid = 0
        self.lost = 0
        self.last_valid_time = None
        self.brightness = []
        self._gap_start = None
        self.max_gap_sec = 0.0
        self.gap_exceeded_events = 0

    def update(self, frame, gaze_data):
        """Call once per captured frame. Returns True if the frame produced
        a usable gaze sample."""
        now = time.time()
        self.total += 1
        gray_mean = float(np.mean(frame)) if frame is not None else 0.0
        self.brightness.append(gray_mean)

        if gaze_data is None:
            self.lost += 1
            if self._gap_start is None:
                self._gap_start = self.last_valid_time if self.last_valid_time is not None else now
            gap = now - self._gap_start
            self.max_gap_sec = max(self.max_gap_sec, gap)
            return False

        # Tracking recovered: close out any open gap.
        if self._gap_start is not None:
            if now - self._gap_start >= MAX_TRACKING_GAP_SEC:
                self.gap_exceeded_events += 1
            self._gap_start = None
        self.valid += 1
        self.last_valid_time = now
        return True

    @property
    def valid_ratio(self):
        return self.valid / max(self.total, 1)

    def result(self, calibration_error=None):
        ratio = self.valid_ratio
        bright = float(np.mean(self.brightness)) if self.brightness else 0.0
        brightness_ok = 25 <= bright <= 235
        calibration_ok = calibration_error is None or calibration_error <= 180
        gap_ok = self.max_gap_sec <= MAX_TRACKING_GAP_SEC
        valid = ratio >= MIN_VALID_GAZE_RATIO and brightness_ok and calibration_ok and gap_ok

        reasons = []
        if ratio < MIN_VALID_GAZE_RATIO: reasons.append('LOW_VALID_GAZE_RATIO')
        if not brightness_ok: reasons.append('UNSTABLE_OR_LOW_BRIGHTNESS')
        if not calibration_ok: reasons.append('HIGH_CALIBRATION_ERROR')
        if not gap_ok: reasons.append('TRACKING_GAP_EXCEEDED')

        return {
            'status': 'VALID' if valid else 'INVALID',
            'valid_gaze_ratio': round(ratio, 4),
            'tracking_loss_ratio': round(1 - ratio, 4),
            'max_tracking_gap_sec': round(self.max_gap_sec, 3),
            'tracking_gap_events': self.gap_exceeded_events,
            'mean_brightness': round(bright, 2),
            'calibration_error_px': calibration_error,
            'reasons': ';'.join(reasons) if reasons else 'OK',
        }
