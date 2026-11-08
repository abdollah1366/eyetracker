import time
import numpy as np
from config import MIN_VALID_GAZE_RATIO

class QualityMonitor:
    def __init__(self):
        self.total = 0
        self.valid = 0
        self.lost = 0
        self.last_valid = None
        self.brightness = []
        self.head_proxy = []

    def update(self, frame, gaze_data):
        self.total += 1
        gray_mean = float(np.mean(frame)) if frame is not None else 0.0
        self.brightness.append(gray_mean)
        if gaze_data is None:
            self.lost += 1
            return False
        self.valid += 1
        self.last_valid = time.time()
        return True

    @property
    def valid_ratio(self):
        return self.valid / max(self.total, 1)

    def result(self, calibration_error=None):
        ratio = self.valid_ratio
        bright = float(np.mean(self.brightness)) if self.brightness else 0.0
        brightness_ok = 25 <= bright <= 235
        calibration_ok = calibration_error is None or calibration_error <= 180
        valid = ratio >= MIN_VALID_GAZE_RATIO and brightness_ok and calibration_ok
        reasons = []
        if ratio < MIN_VALID_GAZE_RATIO: reasons.append('LOW_VALID_GAZE_RATIO')
        if not brightness_ok: reasons.append('UNSTABLE_OR_LOW_BRIGHTNESS')
        if not calibration_ok: reasons.append('HIGH_CALIBRATION_ERROR')
        return {
            'status': 'VALID' if valid else 'INVALID',
            'valid_gaze_ratio': round(ratio, 4),
            'tracking_loss_ratio': round(1-ratio, 4),
            'mean_brightness': round(bright, 2),
            'calibration_error_px': calibration_error,
            'reasons': ';'.join(reasons) if reasons else 'OK'
        }
