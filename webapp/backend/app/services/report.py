"""Ten-section clinical research report plus HTML/PDF rendering."""

from __future__ import annotations

import html
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Assessment, EyeTrackingSession
from app.services.ml import DISCLAIMER, MODEL_PENDING_MESSAGE, NOT_CALCULATED_MESSAGE

# Section keys and RTL titles, in the order required by the thesis report.
SECTION_TITLES: tuple[tuple[str, str], ...] = (
    ("identity", "مشخصات"),
    ("quality", "کیفیت"),
    ("eye_tracking", "یافتههای چشمی"),
    ("conners", "Conners"),
    ("iva2", "IVA-2"),
    ("comparison", "مقایسه منابع"),
    ("model", "مدل"),
    ("xai", "توضیحپذیری"),
    ("limitations", "محدودیتها"),
    ("conclusion", "نتیجه"),
)

LIMITATIONS = [
    "ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست.",
    "دادهها تنها از دوربین وب و نقاط نگاشتشده میآیند؛ فریم خام دوربین ذخیره نمیشود.",
    "رویدادها و ویژگیها باید توسط پروتکل پژوهش مصوب و تحت نظارت متخصص تفسیر شوند.",
    "در صورت ناکافی بودن کیفیت یا نبود مدل آموزشدیده، احتمال و ریسک محاسبه نمیشود.",
]


def _json_load(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _reasons(raw: str | None) -> list[str]:
    """Accept both the JSON-array storage format and legacy semicolon text."""
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        except (TypeError, ValueError):
            pass
    return [part for part in text.split(";") if part and part != "OK"]


def _section(
    key: str,
    content: Any,
    status: str,
    titles: dict[str, str] | None = None,
) -> dict[str, Any]:
    lookup = titles or dict(SECTION_TITLES)
    return {"key": key, "title": lookup.get(key, key), "content": content, "status": status}


def build_report(db: Session, session_id: int) -> dict[str, Any] | None:
    """Build the 10-section report for a session using only stored real data."""
    session = db.get(EyeTrackingSession, session_id)
    if session is None:
        return None
    participant = session.participant
    quality = session.quality
    features = _json_load(session.features.feature_json, {}) if session.features else None
    prediction = session.predictions[-1] if session.predictions else None

    assessments = (
        db.query(Assessment).filter(Assessment.participant_id == session.participant_id).all()
    )
    conners = [a for a in assessments if a.kind == "CONNERS"]
    iva2 = [a for a in assessments if a.kind == "IVA2"]

    quality_status = quality.status if quality is not None else "NOT_EVALUATED"
    reasons = _reasons(quality.reasons) if quality is not None else []

    quality_content: dict[str, Any] = {
        "status": quality_status,
        "reasons": reasons,
    }
    if quality is not None:
        quality_content.update(
            {
                "valid_gaze_ratio": quality.valid_gaze_ratio,
                "tracking_loss_ratio": quality.tracking_loss_ratio,
                "off_screen_ratio": quality.off_screen_ratio,
                "mean_brightness": quality.mean_brightness,
                "brightness_cv": quality.brightness_cv,
                "max_tracking_gap_s": quality.max_tracking_gap_s,
                "calibration_error_px": quality.calibration_error_px,
                "per_stimulus": _json_load(quality.per_stimulus_json, {}),
            }
        )

    risk: dict[str, Any] | None = None
    if prediction is not None:
        xai = _json_load(prediction.xai_json, [])
        risk = {
            "probability": prediction.risk,
            "version": prediction.model_version,
            "feature_version": prediction.feature_version,
            "xai": xai if isinstance(xai, list) else [],
            "disclaimer": DISCLAIMER,
            "created_at": prediction.created_at.isoformat(),
        }

    if prediction is not None:
        conclusion_text = (
            f"مدل {prediction.model_version} ریسک {prediction.risk:.3f} را ثبت کرده است. "
            "این مقدار یک شاخص پژوهشی است و تشخیص بالینی نیست."
        )
        conclusion_status = "OK"
    elif quality_status != "VALID":
        conclusion_text = NOT_CALCULATED_MESSAGE
        conclusion_status = "NOT_CALCULATED"
    else:
        # No model yet is an expected research phase, not a failed result.
        # Raw quality/feature values are still present in the report sections.
        conclusion_text = MODEL_PENDING_MESSAGE
        conclusion_status = "PENDING"

    titles = dict(SECTION_TITLES)
    sections: list[dict[str, Any]] = [
        _section(
            "identity",
            {
                "session_id": session.id,
                "research_id": participant.research_id,
                "clinic_id": participant.clinic_id,
                "label": session.label,
                "status": session.status,
                "stimulus_set": session.stimulus_set,
                "screen": {"width": session.screen_width, "height": session.screen_height},
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            },
            "OK",
            titles,
        ),
        _section(
            "quality",
            quality_content,
            "OK" if quality is not None else "NO_DATA",
            titles,
        ),
        _section(
            "eye_tracking",
            {"status": "AVAILABLE" if features else "NOT_CALCULATED", "features": features},
            "OK" if features else ("NOT_CALCULATED" if quality_status != "VALID" else "NO_DATA"),
            titles,
        ),
        _section(
            "conners",
            [
                {
                    "id": a.id,
                    "version": a.version,
                    "scores": _json_load(a.scores_json, {}),
                    "assessed_at": a.assessed_at.isoformat() if a.assessed_at else None,
                }
                for a in conners
            ],
            "OK" if conners else "NO_DATA",
            titles,
        ),
        _section(
            "iva2",
            [
                {
                    "id": a.id,
                    "version": a.version,
                    "scores": _json_load(a.scores_json, {}),
                    "assessed_at": a.assessed_at.isoformat() if a.assessed_at else None,
                }
                for a in iva2
            ],
            "OK" if iva2 else "NO_DATA",
            titles,
        ),
    ]

    available_sources: list[str] = []
    if features:
        available_sources.append("eye_tracking")
    if conners:
        available_sources.append("conners")
    if iva2:
        available_sources.append("iva2")
    sections.append(
        _section(
            "comparison",
            {
                "available_sources": available_sources,
                "note": "منابع مختلف مقیاسهای متفاوتی را اندازه میگیرند؛ مقایسه عددی مستقیم معتبر نیست.",
            },
            "OK" if available_sources else "NO_DATA",
            titles,
        )
    )

    if risk is not None:
        model_status = "OK"
    elif quality_status != "VALID":
        model_status = "NOT_CALCULATED"
    else:
        model_status = "PENDING"
    sections.append(
        _section(
            "model",
            {
                "risk": risk,
                "status": "AVAILABLE" if risk else (
                    "NOT_CALCULATED" if quality_status != "VALID" else "AWAITING_MODEL"
                ),
                "message": None if risk else (
                    NOT_CALCULATED_MESSAGE if quality_status != "VALID" else MODEL_PENDING_MESSAGE
                ),
                # Raw values remain available even without a trained model.
                "features": features,
            },
            model_status,
            titles,
        )
    )

    sections.append(
        _section(
            "xai",
            {
                "contributions": risk["xai"] if risk else [],
                "message": None if risk else (
                    NOT_CALCULATED_MESSAGE if quality_status != "VALID" else MODEL_PENDING_MESSAGE
                ),
            },
            "OK" if risk and risk["xai"] else (
                "NOT_CALCULATED" if quality_status != "VALID" else "PENDING"
            ),
            titles,
        )
    )
    sections.append(_section("limitations", LIMITATIONS, "OK", titles))
    sections.append(
        _section(
            "conclusion",
            {
                "text": conclusion_text,
                "risk": risk,
            },
            conclusion_status,
            titles,
        )
    )

    return {
        "session_id": session.id,
        "generated_at": datetime.now(UTC),
        "sections": sections,
        "disclaimer": DISCLAIMER,
    }


def render_report_html(report: dict[str, Any]) -> str:
    """Render a print-friendly RTL HTML version of the report."""
    rows = []
    for section in report["sections"]:
        body = html.escape(
            json.dumps(section.get("content"), ensure_ascii=False, indent=2, default=str)
        )
        rows.append(
            "<section>"
            f"<h2>{html.escape(str(section.get('title', section.get('key', ''))))}"
            f" <small>({html.escape(str(section.get('status', 'NO_DATA')))})</small></h2>"
            f"<pre>{body}</pre></section>"
        )
    return f"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<title>Report - Session {report['session_id']}</title>
<style>
  @page {{ size: A4; margin: 18mm; }}
  body {{ font-family: Vazirmatn, Inter, sans-serif; color: #303536; background: #fff; line-height: 1.7; }}
  h1 {{ color: #0E7490; font-size: 20px; }}
  h2 {{ color: #0F4757; font-size: 15px; border-bottom: 1px solid #D6DADC; padding-bottom: 4px; }}
  section {{ margin-bottom: 18px; page-break-inside: avoid; }}
  pre {{ white-space: pre-wrap; word-break: break-word; font-size: 11px; background: #F7F8F8; padding: 10px; border-radius: 10px; }}
  footer {{ margin-top: 24px; font-size: 11px; color: #BF2222; border-top: 1px solid #D6DADC; padding-top: 8px; }}
</style>
</head>
<body>
<h1>گزارش پژوهشی ردیابی چشم — جلسه {report['session_id']}</h1>
<p>تاریخ تولید: {html.escape(report['generated_at'].isoformat())}</p>
{''.join(rows)}
<footer>{html.escape(report['disclaimer'])}</footer>
</body>
</html>"""


def render_report_pdf(report: dict[str, Any]) -> bytes | None:
    """Return PDF bytes, or ``None`` when WeasyPrint is unavailable/fails."""
    try:
        from weasyprint import HTML
    except (ImportError, OSError):
        return None
    try:
        return HTML(string=render_report_html(report)).write_pdf()
    except Exception:  # noqa: BLE001 - graceful fallback to HTML is required
        return None
