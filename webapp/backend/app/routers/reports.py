"""Report JSON and PDF endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import ReportOut
from app.security import get_current_user
from app.services import report as report_service

router = APIRouter(prefix="/api/v1", tags=["reports"])


@router.get("/reports/session/{session_id}.pdf")
def session_report_pdf(
    session_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> Response:
    """Return a real PDF, or a printable HTML page if PDF rendering fails."""
    report = report_service.build_report(db, session_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    pdf = report_service.render_report_pdf(report)
    if pdf is not None:
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="report-session-{session_id}.pdf"'},
        )
    return HTMLResponse(content=report_service.render_report_html(report))


@router.get("/reports/session/{session_id}", response_model=ReportOut)
def session_report(
    session_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ReportOut:
    report = report_service.build_report(db, session_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return ReportOut(**report)
