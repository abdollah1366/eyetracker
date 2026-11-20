"""Polynomial iris-to-screen mapping adapted from legacy ``gaze_engine.py``.

No camera or MediaPipe dependency lives in the backend: the client captures
iris landmarks and performs calibration, then sends the mapped gaze points
and the calibration coefficients to the server.
"""

from __future__ import annotations

import numpy as np

DEFAULT_GAZE_MODEL_ORDER = 2


def polynomial_design(X: np.ndarray | list[list[float]], order: int = DEFAULT_GAZE_MODEL_ORDER) -> np.ndarray:
    """Build the polynomial design matrix (bias, linear, quadratic terms)."""
    arr = np.asarray(X, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    cols: list[np.ndarray] = [np.ones((len(arr), 1))]
    if order >= 1:
        cols.append(arr)
    if order >= 2:
        cols.extend(
            arr[:, [i]] * arr[:, [j]]
            for i in range(arr.shape[1])
            for j in range(i, arr.shape[1])
        )
    return np.hstack(cols)


def fit_gaze_mapping(
    features: np.ndarray | list[list[float]],
    screen_xy: np.ndarray | list[list[float]],
    order: int = DEFAULT_GAZE_MODEL_ORDER,
) -> tuple[np.ndarray, float, float]:
    """Least-squares fit of iris features to screen coordinates.

    Returns ``(coefficients, mean_error_px, median_error_px)``.
    """
    X = polynomial_design(features, order=order)
    Y = np.asarray(screen_xy, dtype=float)
    if Y.ndim == 1:
        Y = Y.reshape(-1, 1)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    pred = X @ coef
    err = np.sqrt(((pred - Y) ** 2).sum(axis=1))
    return coef, float(np.mean(err)), float(np.median(err))


def predict_screen(
    feature: np.ndarray | list[float],
    coef: np.ndarray | list[list[float]],
    order: int = DEFAULT_GAZE_MODEL_ORDER,
) -> tuple[float, float]:
    """Map one iris-feature vector to screen coordinates."""
    p = polynomial_design(np.asarray(feature, dtype=float).reshape(1, -1), order=order)
    xy = p @ np.asarray(coef, dtype=float)
    return float(xy[0, 0]), float(xy[0, 1])
