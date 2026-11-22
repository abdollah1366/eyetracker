"""Smoke tests for auth/refresh, list envelopes, Quality Gate and reports.

Environment must be configured before importing the application so the test
database is an isolated in-memory SQLite database.
"""

from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-only-secret-not-for-production"
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "test-password-123"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

REPORT_SECTION_KEYS = {
    "identity",
    "quality",
    "eye_tracking",
    "conners",
    "iva2",
    "comparison",
    "model",
    "xai",
    "limitations",
    "conclusion",
}


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _headers(client: TestClient) -> dict[str, str]:
    return {"Authorization": f"Bearer {_login(client)['access_token']}"}


def _participant(client: TestClient, research_id: str) -> int:
    response = client.post(
        "/api/v1/participants",
        headers=_headers(client),
        json={"research_id": research_id, "age": 24, "consent_assent": True},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_login(client: TestClient) -> None:
    body = _login(client)
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["refresh_token"]
    assert body["user"]["role"] == "admin"
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_refresh_rotates_token(client: TestClient) -> None:
    first = _login(client)
    refresh_token = first["refresh_token"]
    assert isinstance(refresh_token, str)

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["refresh_token"] and body["refresh_token"] != refresh_token

    # Old token is revoked after rotation.
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert replay.status_code == 401

    # New access token authenticates normally.
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200


def test_create_participant(client: TestClient) -> None:
    headers = _headers(client)
    response = client.post(
        "/api/v1/participants",
        headers=headers,
        json={
            "research_id": "P-SMOKE-001",
            "birth_year": 2000,
            "age": 24,
            "sex": "Other",
            "consent_guardian": False,
            "consent_assent": True,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["research_id"] == "P-SMOKE-001"
    assert "name" not in body  # no identity/PII in participant records


def test_list_envelopes(client: TestClient) -> None:
    headers = _headers(client)
    for path in (
        "/api/v1/sessions",
        "/api/v1/participants",
        "/api/v1/models",
        "/api/v1/clinics",
        "/api/v1/users",
        "/api/v1/audit",
    ):
        response = client.get(path, headers=headers)
        assert response.status_code == 200, (path, response.text)
        body = response.json()
        assert set(("items", "total", "skip", "limit")).issubset(body), path
        assert isinstance(body["items"], list), path


def test_config_quality_protocol(client: TestClient) -> None:
    response = client.get("/api/v1/config/quality", headers=_headers(client))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stimulus_target"] == 9
    assert body["stimulus_duration_sec"] == 10


def test_invalid_quality_has_no_features_and_no_risk(client: TestClient) -> None:
    headers = _headers(client)
    participant = client.get("/api/v1/participants", headers=headers).json()["items"][0]

    created = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={
            "participant_id": participant["id"],
            "label": "UNKNOWN",
            "stimulus_set": "default-10",
            "screen_width": 1920,
            "screen_height": 1080,
            "calibration": {"coef": [[0.0]], "mean_error_px": 10.0, "points": []},
            "idempotency_key": "smoke-session-invalid-1",
        },
    )
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]

    samples = client.post(
        f"/api/v1/sessions/{session_id}/samples",
        headers=headers,
        json={
            "stimulus": "1.jpg",
            "samples": [
                {
                    "timestamp": index * 0.1,
                    "gaze_x": 100.0,
                    "gaze_y": 100.0,
                    "gaze_valid": False,
                    "brightness": 128.0,
                }
                for index in range(20)
            ],
        },
    )
    assert samples.status_code == 200, samples.text
    assert samples.json()["accepted"] == 20

    completed = client.post(
        f"/api/v1/sessions/{session_id}/complete",
        headers=headers,
        json={},
    )
    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["status"] == "INVALID"
    assert body["features"] is None
    assert body["risk"] is None
    assert isinstance(body["quality"]["reasons"], list)
    assert "LOW_VALID_GAZE_RATIO" in body["quality"]["reasons"]
    assert "Not Calculated" in body["message"]

    detail = client.get(f"/api/v1/sessions/{session_id}", headers=headers)
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["risk"] is None
    assert detail_body["features"] is None
    assert detail_body["quality"]["status"] == "INVALID"
    assert isinstance(detail_body["quality"]["reasons"], list)

    report = client.get(f"/api/v1/reports/session/{session_id}", headers=headers)
    assert report.status_code == 200, report.text
    sections = report.json()["sections"]
    assert isinstance(sections, list)
    assert len(sections) == 10
    assert {section["key"] for section in sections} == REPORT_SECTION_KEYS
    assert all(
        set(("key", "title", "content", "status")).issubset(section) for section in sections
    )
    assert all(
        section["status"] in {"OK", "NOT_CALCULATED", "NO_DATA"} for section in sections
    )


def test_off_screen_valid_gaze_is_not_tracking_loss(client: TestClient) -> None:
    headers = _headers(client)
    participant_id = _participant(client, "P-SMOKE-OFFSCREEN")

    created = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={
            "participant_id": participant_id,
            "label": "ADHD",
            "screen_width": 1920,
            "screen_height": 1080,
            "calibration": {"coef": [[0.0]], "mean_error_px": 10.0, "points": []},
            "idempotency_key": "smoke-session-offscreen-1",
        },
    )
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]

    samples = [
        {
            "timestamp": index * 0.1,
            "gaze_x": -50.0 if index % 3 == 0 else 500.0,
            "gaze_y": 500.0,
            "gaze_valid": True,
            "off_screen": index % 3 == 0,
            "brightness": 128.0,
        }
        for index in range(30)
    ]
    response = client.post(
        f"/api/v1/sessions/{session_id}/samples",
        headers=headers,
        json={"stimulus": "1.jpg", "samples": samples},
    )
    assert response.status_code == 200, response.text

    completed = client.post(
        f"/api/v1/sessions/{session_id}/complete",
        headers=headers,
        json={},
    )
    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["status"] == "VALID", body
    assert body["quality"]["tracking_loss_ratio"] == 0.0
    assert body["quality"]["off_screen_ratio"] > 0
    assert body["quality"]["reasons"] == []


def test_sync_batch_is_idempotent(client: TestClient) -> None:
    headers = _headers(client)
    batch = {
        "events": [
            {
                "idempotency_key": "smoke-sync-participant-1",
                "type": "CREATE_PARTICIPANT",
                "payload": {"research_id": "P-SMOKE-SYNC"},
            }
        ]
    }
    first = client.post("/api/v1/sync/batch", headers=headers, json=batch)
    assert first.status_code == 200, first.text
    assert first.json()["results"][0]["status"] == "ok"

    second = client.post("/api/v1/sync/batch", headers=headers, json=batch)
    assert second.status_code == 200, second.text
    assert second.json()["results"][0]["status"] == "duplicate"

    status = client.get("/api/v1/sync/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["total_events"] == 1
