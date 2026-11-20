"""CSV/JSON export helpers.

Research exports contain only the pseudonymous ``research_id`` — names,
phone numbers and other identity data are never included.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import EyeTrackingSession

CSV_COLUMNS = [
    "research_id",
    "session_id",
    "label",
    "stimulus",
    "timestamp",
    "frame_id",
    "gaze_x",
    "gaze_y",
    "gaze_valid",
    "off_screen",
    "left_iris_x",
    "left_iris_y",
    "right_iris_x",
    "right_iris_y",
]


def session_export_rows(db: Session, session_id: int) -> list[dict[str, Any]]:
    """Return flat, de-identified rows for one session."""
    session = db.get(EyeTrackingSession, session_id)
    if session is None:
        return []
    research_id = session.participant.research_id
    rows: list[dict[str, Any]] = []
    for sample in session.samples:
        rows.append(
            {
                "research_id": research_id,
                "session_id": session.id,
                "label": session.label,
                "stimulus": sample.stimulus,
                "timestamp": sample.timestamp,
                "frame_id": sample.frame_id,
                "gaze_x": sample.gaze_x,
                "gaze_y": sample.gaze_y,
                "gaze_valid": sample.gaze_valid,
                "off_screen": sample.off_screen,
                "left_iris_x": sample.left_iris_x,
                "left_iris_y": sample.left_iris_y,
                "right_iris_x": sample.right_iris_x,
                "right_iris_y": sample.right_iris_y,
            }
        )
    return rows


def rows_to_csv(rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def rows_to_json(rows: list[dict[str, Any]]) -> str:
    return json.dumps(rows, ensure_ascii=False, indent=2)


def export_session(db: Session, session_id: int, fmt: str = "csv") -> str:
    """Export one session as de-identified CSV or JSON text."""
    rows = session_export_rows(db, session_id)
    return rows_to_csv(rows) if fmt == "csv" else rows_to_json(rows)
