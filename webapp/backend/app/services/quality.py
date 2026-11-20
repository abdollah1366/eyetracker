"""Quality Gate enforcement for completed eye-tracking sessions.

Key invariant: a gaze point that is *detected* but falls outside the screen is
marked ``off_screen`` and is NEVER counted as tracking loss. Only samples with
``gaze_valid == False`` are tracking losses.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.config import settings
from app.models import QualityConfig

# A very unstable brightness signal is also rejected (coefficient of variation).
MAX_BRIGHTNESS_CV = 1.0


@dataclass(frozen=True)
class Thresholds:
    """Effective Quality Gate thresholds for one evaluation."""

    min_valid_gaze_ratio: float = settings.MIN_VALID_GAZE_RATIO
    max_tracking_gap_s: float = settings.MAX_TRACKING_GAP_SEC
    brightness_min: float = settings.BRIGHTNESS_MIN
    brightness_max: float = settings.BRIGHTNESS_MAX
    max_calibration_error_px: float = settings.MAX_CALIBRATION_ERROR_PX

    @classmethod
    def from_db(cls, db: Session) -> "Thresholds":
        row = db.get(QualityConfig, 1)
        if row is None:
            return cls()
        return cls(
            min_valid_gaze_ratio=row.min_valid_gaze_ratio,
            max_tracking_gap_s=row.max_tracking_gap_s,
            brightness_min=row.brightness_min,
            brightness_max=row.brightness_max,
            max_calibration_error_px=row.max_calibration_error_px,
        )

    def as_dict(self) -> dict[str, float]:
        return {
            "min_valid_gaze_ratio": self.min_valid_gaze_ratio,
            "max_tracking_gap_s": self.max_tracking_gap_s,
            "brightness_min": self.brightness_min,
            "brightness_max": self.brightness_max,
            "max_calibration_error_px": self.max_calibration_error_px,
            "stimulus_target": settings.STIMULUS_TARGET,
        }


@dataclass
class QualityResult:
    """Complete outcome of the server-side Quality Gate."""

    status: str
    valid_gaze_ratio: float
    tracking_loss_ratio: float
    off_screen_ratio: float
    mean_brightness: float
    brightness_cv: float
    max_tracking_gap_s: float
    calibration_error_px: float | None
    reasons: list[str] = field(default_factory=list)
    per_stimulus: dict[str, Any] = field(default_factory=dict)
    sample_count: int = 0
    valid_count: int = 0
    off_screen_count: int = 0
    tracking_loss_count: int = 0

    @property
    def reasons_text(self) -> str:
        return ";".join(self.reasons) if self.reasons else "OK"

    @property
    def is_valid(self) -> bool:
        return self.status == "VALID"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "valid_gaze_ratio": self.valid_gaze_ratio,
            "tracking_loss_ratio": self.tracking_loss_ratio,
            "off_screen_ratio": self.off_screen_ratio,
            "mean_brightness": self.mean_brightness,
            "brightness_cv": self.brightness_cv,
            "max_tracking_gap_s": self.max_tracking_gap_s,
            "calibration_error_px": self.calibration_error_px,
            "reasons": self.reasons,
            "sample_count": self.sample_count,
            "per_stimulus": self.per_stimulus,
        }


def _get(sample: Any, name: str, default: Any = None) -> Any:
    if isinstance(sample, dict):
        return sample.get(name, default)
    return getattr(sample, name, default)


def _brightness_of(sample: Any) -> float | None:
    value = _get(sample, "brightness", None)
    if value is not None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    partial = _get(sample, "quality_partial_json", None)
    if isinstance(partial, str) and partial:
        try:
            parsed = json.loads(partial)
        except (TypeError, ValueError):
            return None
        if isinstance(parsed, dict):
            for key in ("brightness", "mean_brightness"):
                value = parsed.get(key)
                if value is not None:
                    try:
                        return float(value)
                    except (TypeError, ValueError):
                        return None
    if isinstance(partial, dict):
        for key in ("brightness", "mean_brightness"):
            value = partial.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return None
    return None


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def _max_tracking_gap(sorted_samples: list[tuple[float, bool]]) -> float:
    """Longest continuous interval in which no valid gaze sample was seen.

    ``sorted_samples`` is a list of ``(timestamp, gaze_valid)`` pairs. Points
    flagged off-screen are passed as valid and therefore break the gap.
    """
    last_valid_ts: float | None = None
    worst = 0.0
    for ts, is_valid in sorted_samples:
        if is_valid:
            last_valid_ts = ts
            continue
        if last_valid_ts is not None:
            worst = max(worst, ts - last_valid_ts)
    return float(round(max(worst, 0.0), 4))


def evaluate_quality(
    samples: Iterable[Any],
    *,
    screen_width: int,
    screen_height: int,
    calibration_error_px: float | None,
    thresholds: Thresholds | None = None,
    client_calibration_error: float | None = None,
    client_brightness: float | None = None,
) -> QualityResult:
    """Recompute the Quality Gate from stored samples (never trust the client).

    ``screen_width``/``screen_height`` are accepted for API symmetry; the
    off-screen flag is decided when the samples are stored.
    """
    cfg = thresholds or Thresholds()
    _ = (screen_width, screen_height)  # documented, not needed for the gate

    all_samples = list(samples)
    total = len(all_samples)

    valid_count = 0
    off_screen_count = 0
    tracking_loss_count = 0
    brightness_values: list[float] = []
    per_bucket: dict[str, dict[str, Any]] = {}
    timestamped: list[tuple[float, bool]] = []

    for sample in all_samples:
        is_valid = bool(_get(sample, "gaze_valid", False))
        is_off_screen = bool(_get(sample, "off_screen", False)) and is_valid
        stimulus = str(_get(sample, "stimulus", None) or "unknown")

        if is_valid:
            valid_count += 1
            if is_off_screen:
                off_screen_count += 1
        else:
            tracking_loss_count += 1

        b = _brightness_of(sample)
        if b is not None and math.isfinite(b):
            brightness_values.append(b)

        ts = _get(sample, "timestamp", None)
        if ts is not None:
            try:
                timestamped.append((float(ts), is_valid))
            except (TypeError, ValueError):
                pass

        bucket = per_bucket.setdefault(
            stimulus,
            {
                "sample_count": 0,
                "valid_count": 0,
                "tracking_loss_count": 0,
                "off_screen_count": 0,
                "brightness": [],
            },
        )
        bucket["sample_count"] += 1
        bucket["valid_count"] += int(is_valid)
        bucket["tracking_loss_count"] += int(not is_valid)
        bucket["off_screen_count"] += int(is_off_screen)
        if b is not None and math.isfinite(b):
            bucket["brightness"].append(b)

    if client_brightness is not None:
        try:
            brightness_values.append(float(client_brightness))
        except (TypeError, ValueError):
            pass

    ratio = _ratio(valid_count, total)
    tracking_loss_ratio = _ratio(tracking_loss_count, total)
    off_screen_ratio = _ratio(off_screen_count, total)

    if brightness_values:
        mean_brightness = sum(brightness_values) / len(brightness_values)
        variance = sum((v - mean_brightness) ** 2 for v in brightness_values) / len(brightness_values)
        std = math.sqrt(variance)
        brightness_cv = std / mean_brightness if abs(mean_brightness) > 1e-9 else 0.0
    else:
        mean_brightness = 0.0
        brightness_cv = 0.0

    timestamped.sort(key=lambda item: item[0])
    max_gap = _max_tracking_gap(timestamped)

    effective_cal_error = calibration_error_px
    if effective_cal_error is None:
        effective_cal_error = client_calibration_error

    brightness_ok = bool(brightness_values) and cfg.brightness_min <= mean_brightness <= cfg.brightness_max
    stability_ok = brightness_cv <= MAX_BRIGHTNESS_CV
    calibration_ok = effective_cal_error is None or effective_cal_error <= cfg.max_calibration_error_px
    ratio_ok = ratio >= cfg.min_valid_gaze_ratio
    gap_ok = max_gap <= cfg.max_tracking_gap_s

    reasons: list[str] = []
    if total == 0:
        reasons.append("NO_SAMPLES")
    if not ratio_ok:
        reasons.append("LOW_VALID_GAZE_RATIO")
    if not gap_ok:
        reasons.append("LONG_TRACKING_GAP")
    if not brightness_values:
        reasons.append("MISSING_BRIGHTNESS_DATA")
    elif not brightness_ok or not stability_ok:
        reasons.append("UNSTABLE_OR_LOW_BRIGHTNESS")
    if not calibration_ok:
        reasons.append("HIGH_CALIBRATION_ERROR")

    per_stimulus: dict[str, Any] = {}
    for name, bucket in per_bucket.items():
        bvals = bucket["brightness"]
        bmean = sum(bvals) / len(bvals) if bvals else 0.0
        per_stimulus[name] = {
            "sample_count": bucket["sample_count"],
            "valid_gaze_ratio": _ratio(bucket["valid_count"], bucket["sample_count"]),
            "tracking_loss_ratio": _ratio(bucket["tracking_loss_count"], bucket["sample_count"]),
            "off_screen_ratio": _ratio(bucket["off_screen_count"], bucket["sample_count"]),
            "mean_brightness": round(bmean, 2),
        }

    status = "VALID" if not reasons else "INVALID"
    return QualityResult(
        status=status,
        valid_gaze_ratio=ratio,
        tracking_loss_ratio=tracking_loss_ratio,
        off_screen_ratio=off_screen_ratio,
        mean_brightness=round(mean_brightness, 2),
        brightness_cv=round(brightness_cv, 4),
        max_tracking_gap_s=max_gap,
        calibration_error_px=effective_cal_error,
        reasons=reasons,
        per_stimulus=per_stimulus,
        sample_count=total,
        valid_count=valid_count,
        off_screen_count=off_screen_count,
        tracking_loss_count=tracking_loss_count,
    )
