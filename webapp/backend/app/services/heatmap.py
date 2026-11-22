"""Aggregate gaze points across all sessions/stimuli into one normalized map.

Coordinates are normalized per session by its own screen dimensions before
being binned into a fixed 16:9 grid, so sessions recorded on different screens
can be averaged fairly. Only real valid gaze samples are used — no frames, no
synthetic points, and no tracking-loss rows (gaze_valid = False).
"""

from __future__ import annotations

import math
from typing import Any, Iterable

GRID_WIDTH = 48
GRID_HEIGHT = 27
SIGMA_CELLS = 1.4
STENCIL = 2


def build_global_map(
    rows: Iterable[tuple[Any, Any]],
    stimulus_filter: str | None = None,
) -> dict[str, Any]:
    """Build a mean-density grid from (GazeSample, EyeTrackingSession) rows.

    ``rows`` already carries the caller's clinic scoping and validity filters.
    The returned grid values are normalized to 0..1 by the maximum cell so the
    client can render a stable colour ramp without knowing raw sample counts.
    """
    grid = [[0.0 for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
    point_count = 0
    session_ids: set[int] = set()
    stimuli: set[str] = set()

    stencil_weights = [
        (dx, dy, math.exp(-(dx * dx + dy * dy) / (2 * SIGMA_CELLS * SIGMA_CELLS)))
        for dy in range(-STENCIL, STENCIL + 1)
        for dx in range(-STENCIL, STENCIL + 1)
    ]

    for sample, session in rows:
        if stimulus_filter and (sample.stimulus or "unknown") != stimulus_filter:
            continue
        width = int(session.screen_width or 0)
        height = int(session.screen_height or 0)
        if width <= 0 or height <= 0:
            continue
        nx = float(sample.gaze_x or 0) / width
        ny = float(sample.gaze_y or 0) / height
        # Ignore points far outside the screen; clamp borderline ones.
        if nx < -0.05 or nx > 1.05 or ny < -0.05 or ny > 1.05:
            continue
        gx = min(GRID_WIDTH - 1, max(0, int(nx * GRID_WIDTH)))
        gy = min(GRID_HEIGHT - 1, max(0, int(ny * GRID_HEIGHT)))

        for dx, dy, weight in stencil_weights:
            x, y = gx + dx, gy + dy
            if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                grid[y][x] += weight

        point_count += 1
        session_ids.add(int(session.id))
        stimuli.add(sample.stimulus or "unknown")

    maximum = max((value for row in grid for value in row), default=0.0)
    normalizer = maximum if maximum > 0 else 1.0
    normalized = [[round(value / normalizer, 4) for value in row] for row in grid]

    return {
        "grid": normalized,
        "grid_width": GRID_WIDTH,
        "grid_height": GRID_HEIGHT,
        "point_count": point_count,
        "session_count": len(session_ids),
        "stimulus_count": len(stimuli),
        "stimuli": sorted(stimuli),
        "stimulus": stimulus_filter,
    }
