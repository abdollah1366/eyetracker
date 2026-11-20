"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import admin, assessments, auth, clinics, models, participants, reports, sessions, sync, users
from app.seeds.seed import seed_db

logger = logging.getLogger("eye_tracker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create schema, seed baseline data, and ensure artifact storage exists."""
    settings.artifacts_path.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_db(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="ADHD Eye-Tracking CDSS API",
    version=settings.APP_VERSION or __version__,
    description=(
        "Research decision-support backend. "
        "ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return a uniform ``{"detail": ...}`` body for validation failures."""
    errors: list[dict[str, Any]] = []
    for error in exc.errors():
        errors.append(
            {
                "loc": [str(part) for part in error.get("loc", [])],
                "msg": error.get("msg", "Invalid value"),
                "type": error.get("type", "value_error"),
            }
        )
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak internal details or fabricated data to clients."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.APP_VERSION}


for router in (
    auth.router,
    clinics.router,
    users.router,
    participants.router,
    sessions.router,
    assessments.router,
    models.router,
    reports.router,
    sync.router,
    admin.router,
):
    app.include_router(router)
