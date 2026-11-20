"""Feature extraction from mapped gaze points (legacy logic, extended).

Implements every feature required by SPEC section 5 plus fixation/saccade
statistics and a 3x3 area-of-interest (AOI) entry map. Brightness statistics
are emitted under ``quality_features`` and must not be used as predictors.
"""

from __future__ import annotations

from typing import Any, Iterable

import numpy as np

FEATURE_VERSION = "1.0.0"
EXTRACTOR_VERSION = "gaze-features-v1"

SACCADE_VELOCITY_PX_S = 300.0
SACCADE_STEP_PX = 60.0
MIN_FIXATION_MS = 80.0


def _get(sample: Any, name: str, default: Any = None) -> Any:
    if isinstance(sample, dict):
        return sample.get(name, default)
    return getattr(sample, name, default)


def _ordered_samples(samples: Iterable[Any]) -> list[Any]:
    """Order samples by timestamp when available, otherwise keep input order."""

    def key(sample: Any) -> float:
        ts = _get(sample, "timestamp", None)
        return float(ts) if ts is not None else float("inf")

    return sorted(samples, key=key)


def _event_counts(
    points: np.ndarray,
    times: np.ndarray | None,
) -> tuple[int, float, int]:
    """Return ``(fixation_count, mean_fixation_ms, saccade_count)``.

    A step is a saccade when its instantaneous velocity exceeds
    ``SACCADE_VELOCITY_PX_S`` (or its length exceeds ``SACCADE_STEP_PX`` when
    timestamps are unavailable). Consecutive steps of the same class form one
    event. Fixations shorter than ``MIN_FIXATION_MS`` are discarded.
    """
    n = len(points)
    if n < 2:
        return 0, 0.0, 0

    steps = np.linalg.norm(np.diff(points, axis=0), axis=1)
    if times is not None and len(times) == n:
        dt = np.maximum(np.diff(times), 1e-3)
        speeds = steps / dt
        saccade = speeds > SACCADE_VELOCITY_PX_S
    else:
        saccade = steps > SACCADE_STEP_PX

    fixation_durations: list[float] = []
    saccade_count = 0
    start = 0
    for i in range(1, len(saccade) + 1):
        if i == len(saccade) or bool(saccade[i]) != bool(saccade[start]):
            is_saccade = bool(saccade[start])
            if is_saccade:
                saccade_count += 1
            elif times is not None and len(times) == n:
                duration_ms = float(times[i] - times[start]) * 1000.0
                if duration_ms >= MIN_FIXATION_MS:
                    fixation_durations.append(duration_ms)
            start = i

    mean_fixation_ms = float(np.mean(fixation_durations)) if fixation_durations else 0.0
    return len(fixation_durations), round(mean_fixation_ms, 3), saccade_count


def extract_features(
    samples: Iterable[Any],
    *,
    screen_width: int,
    screen_height: int,
    brightness_cv: float | None = None,
    mean_brightness: float | None = None,
) -> dict[str, Any]:
    """Compute the feature dictionary persisted in ``features.feature_json``."""
    ordered = _ordered_samples(samples)
    total = len(ordered)
    valid = [s for s in ordered if bool(_get(s, "gaze_valid", False))]

    features: dict[str, Any] = {
        "extractor_version": EXTRACTOR_VERSION,
        "feature_version": FEATURE_VERSION,
        "valid_gaze_ratio": round(len(valid) / total, 4) if total else 0.0,
        "sample_count": total,
        "n_valid_samples": len(valid),
        "n_off_screen": sum(1 for s in valid if bool(_get(s, "off_screen", False))),
    }
    features["off_screen_ratio"] = (
        round(features["n_off_screen"] / len(valid), 4) if valid else 0.0
    )

    points_list: list[list[float]] = []
    times_list: list[float] = []
    for sample in valid:
        x, y = _get(sample, "gaze_x", None), _get(sample, "gaze_y", None)
        if x is None or y is None:
            continue
        try:
            points_list.append([float(x), float(y)])
        except (TypeError, ValueError):
            continue
        ts = _get(sample, "timestamp", None)
        if ts is not None:
            try:
                times_list.append(float(ts))
            except (TypeError, ValueError):
                times_list.append(float("nan"))

    if not points_list:
        features.update(
            gaze_x_mean=0.0,
            gaze_y_mean=0.0,
            gaze_x_std=0.0,
            gaze_y_std=0.0,
            scanpath_length_px=0.0,
            mean_gaze_step_px=0.0,
            mean_gaze_velocity_px_s=0.0,
            fixation_count=0,
            mean_fixation_ms=0.0,
            saccade_count=0,
            aoi_enter_counts={f"r{r}c{c}": 0 for r in range(3) for c in range(3)},
            quality_features={
                "brightness_cv": round(brightness_cv or 0.0, 4),
                "mean_brightness": round(mean_brightness or 0.0, 2),
            },
        )
        return features

    pts = np.asarray(points_list, dtype=float)
    features["gaze_x_mean"] = round(float(pts[:, 0].mean()), 4)
    features["gaze_y_mean"] = round(float(pts[:, 1].mean()), 4)
    features["gaze_x_std"] = round(float(pts[:, 0].std(ddof=0)), 4)
    features["gaze_y_std"] = round(float(pts[:, 1].std(ddof=0)), 4)

    if len(pts) > 1:
        steps = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        features["scanpath_length_px"] = round(float(steps.sum()), 4)
        features["mean_gaze_step_px"] = round(float(steps.mean()), 4)
        usable_times = times_list if len(times_list) == len(pts) else []
        if usable_times and all(np.isfinite(usable_times)):
            dt = np.maximum(np.diff(np.asarray(usable_times, dtype=float)), 1e-3)
            features["mean_gaze_velocity_px_s"] = round(float(np.mean(steps / dt)), 4)
            event_times: np.ndarray | None = np.asarray(usable_times, dtype=float)
        else:
            features["mean_gaze_velocity_px_s"] = 0.0
            event_times = None
        f_count, f_ms, s_count = _event_counts(pts, event_times)
    else:
        features.update(
            scanpath_length_px=0.0,
            mean_gaze_step_px=0.0,
            mean_gaze_velocity_px_s=0.0,
        )
        f_count, f_ms, s_count = 0, 0.0, 0

    features["fixation_count"] = f_count
    features["mean_fixation_ms"] = f_ms
    features["saccade_count"] = s_count

    # 3x3 AOI entry counts.
    aoi_counts = {f"r{r}c{c}": 0 for r in range(3) for c in range(3)}
    previous: tuple[int, int] | None = None
    width = max(screen_width, 1)
    height = max(screen_height, 1)
    for x, y in pts:
        col = min(2, max(0, int((x / width) * 3)))
        row = min(2, max(0, int((y / height) * 3)))
        cell = (row, col)
        if cell != previous:
            aoi_counts[f"r{row}c{col}"] += 1
            previous = cell
    features["aoi_enter_counts"] = aoi_counts

    # Brightness is a quality signal, never a predictor.
    features["quality_features"] = {
        "brightness_cv": round(float(brightness_cv or 0.0), 4),
        "mean_brightness": round(float(mean_brightness or 0.0), 2),
    }
    return features


def flatten_features(feature_dict: dict[str, Any]) -> dict[str, float]:
    """Flatten nested feature groups into numeric columns for the ML model.

    ``quality_features`` is deliberately excluded so brightness never enters
    the predictor matrix.
    """
    flat: dict[str, float] = {}
    for key, value in feature_dict.items():
        if key in {"quality_features", "extractor_version", "feature_version"}:
            continue
        if isinstance(value, dict):
            for sub_key, sub_value in value.items():
                try:
                    flat[f"{key}_{sub_key}"] = float(sub_value)
                except (TypeError, ValueError):
                    continue
        elif isinstance(value, bool):
            flat[key] = float(value)
        elif isinstance(value, (int, float)):
            flat[key] = float(value)
    return flat
