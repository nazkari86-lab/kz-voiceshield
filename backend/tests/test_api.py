from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from backend.app.config import Principal, Settings
from backend.app.factory import create_app


class FakeModel:
    available = True

    def assess(self, transcript: str):
        return {
            "verdict": "fraud" if "код" in transcript.lower() else "safe",
            "score": 92 if "код" in transcript.lower() else 4,
            "confidence": 88,
            "model": "test-model",
            "embeddingModel": "test-vectorizer",
            "signals": ["test-only"],
        }


class FakeTranscriber:
    def transcribe(self, audio: bytes, suffix: str):
        assert audio == b"fake-audio"
        assert suffix == ".wav"
        return "Назовите код из SMS", 91


@pytest.fixture()
def api(tmp_path: Path):
    settings = Settings(
        api_tokens={
            "analyst-token": Principal("analyst-1", "analyst"),
            "reviewer-token": Principal("reviewer-1", "reviewer"),
            "admin-token": Principal("admin-1", "admin"),
        },
        database_path=tmp_path / "voiceshield.db",
        encryption_key=Fernet.generate_key().decode("ascii"),
        max_audio_bytes=64,
        model_path=None,
    )
    app = create_app(settings=settings, transcriber=FakeTranscriber(), model_service=FakeModel())
    with TestClient(app) as client:
        yield client, settings.database_path


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def case_payload(case_id: str = "case-1") -> dict:
    return {
        "id": case_id,
        "status": "new",
        "assignedTo": "Unassigned",
        "transcript": "Секретный transcript с кодом [REDACTED]",
        "flags": {"bankContactNeeded": True},
    }


def test_health_is_public_and_auth_is_required(api):
    client, _ = api
    assert client.get("/health").json() == {"ok": True, "version": "1.9.0", "mlAvailable": True}
    readiness = client.get("/readyz")
    assert readiness.status_code == 200
    assert readiness.json() == {
        "ok": True,
        "version": "1.9.0",
        "database": "ok",
        "mlAvailable": True,
        "serverSttConfigured": True,
        "retainAudio": False,
        "maxAudioBytes": 64,
        "livekitConfigured": False,
        "capabilities": {
            "serverStt": True,
            "serverVad": False,
            "liveKitVoip": False,
            "serverPiiRedaction": True,
            "trainedKazakhStreamingAsr": False,
            "deepfakeModel": False,
        },
    }
    assert client.post("/analyze-transcript", json={"transcript": "Назовите код"}).status_code == 401


def test_livekit_is_explicitly_disabled_without_server_secrets(api):
    client, _ = api
    response = client.post("/calls/create", headers=auth("analyst-token"))
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_analyzes_with_experimental_model(api):
    client, _ = api
    response = client.post(
        "/analyze-transcript",
        headers=auth("analyst-token"),
        json={"transcript": "Назовите код из SMS", "ruleAnalysis": {"score": 90}},
    )
    assert response.status_code == 200
    assert response.json()["ml"]["verdict"] == "fraud"


def test_case_storage_is_encrypted_and_role_guarded(api):
    client, database_path = api
    response = client.put("/cases/case-1", headers=auth("analyst-token"), json=case_payload())
    assert response.status_code == 200
    assert client.get("/cases", headers=auth("analyst-token")).status_code == 403

    listed = client.get("/cases", headers=auth("reviewer-token"))
    assert listed.status_code == 200
    assert listed.json()["items"][0]["transcript"].startswith("Секретный")

    with sqlite3.connect(database_path) as connection:
        encrypted = connection.execute("SELECT payload FROM cases WHERE id = 'case-1'").fetchone()[0]
    assert b"transcript" not in encrypted
    assert "Секретный".encode("utf-8") not in encrypted


def test_reviewer_updates_workflow_and_reads_audit(api):
    client, _ = api
    client.put("/cases/case-1", headers=auth("analyst-token"), json=case_payload())
    loaded = client.get("/cases/case-1", headers=auth("reviewer-token"))
    assert loaded.status_code == 200
    assert loaded.json()["id"] == "case-1"
    updated = client.patch(
        "/cases/case-1/workflow",
        headers=auth("reviewer-token"),
        json={
            "status": "escalated",
            "assignedTo": "Team A",
            "evidenceBundleReady": True,
            "decision": "Escalate",
            "expectedUpdatedAt": loaded.json().get("updatedAt"),
        },
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "escalated"
    assert updated.json()["flags"]["evidenceBundleReady"] is True
    audit = client.get("/audit-log?caseId=case-1", headers=auth("reviewer-token"))
    assert audit.status_code == 200
    assert {item["action"] for item in audit.json()["items"]} >= {"case_created", "workflow_changed"}

    analyst_overwrite = case_payload()
    analyst_overwrite["status"] = "closed"
    analyst_overwrite["assignedTo"] = "Attacker"
    assert client.put("/cases/case-1", headers=auth("analyst-token"), json=analyst_overwrite).status_code == 200
    preserved = client.get("/cases?status=escalated", headers=auth("reviewer-token")).json()["items"][0]
    assert preserved["status"] == "escalated"
    assert preserved["assignedTo"] == "Team A"


def test_workflow_patch_rejects_stale_reviewer_version(api):
    client, _ = api
    client.put("/cases/case-1", headers=auth("analyst-token"), json={**case_payload(), "updatedAt": "2026-07-11T00:00:00Z"})
    current = client.get("/cases/case-1", headers=auth("reviewer-token")).json()
    assert current["updatedAt"] == "2026-07-11T00:00:00Z"

    first = client.patch(
        "/cases/case-1/workflow",
        headers=auth("reviewer-token"),
        json={"status": "reviewing", "expectedUpdatedAt": "2026-07-11T00:00:00Z"},
    )
    assert first.status_code == 200

    stale = client.patch(
        "/cases/case-1/workflow",
        headers=auth("reviewer-token"),
        json={"status": "closed", "expectedUpdatedAt": "2026-07-11T00:00:00Z"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == "Case was updated by another reviewer"


def test_audio_job_completes_without_retaining_audio(api):
    client, database_path = api
    accepted = client.post(
        "/transcribe-audio",
        headers=auth("analyst-token"),
        files={"audio": ("call.wav", b"fake-audio", "audio/wav")},
    )
    assert accepted.status_code == 202
    job = client.get(f"/audio-jobs/{accepted.json()['jobId']}", headers=auth("analyst-token"))
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    assert job.json()["transcriptConfidence"] == 91
    assert job.json()["ml"]["verdict"] == "fraud"
    with sqlite3.connect(database_path) as connection:
        retained_audio = connection.execute("SELECT audio FROM audio_jobs").fetchone()[0]
    assert retained_audio is None


def test_rejects_large_or_unsupported_audio(api):
    client, _ = api
    unsupported = client.post(
        "/transcribe-audio", headers=auth("analyst-token"), files={"audio": ("call.txt", b"voice", "text/plain")}
    )
    assert unsupported.status_code == 415
    too_large = client.post(
        "/transcribe-audio", headers=auth("analyst-token"), files={"audio": ("call.wav", b"x" * 65, "audio/wav")}
    )
    assert too_large.status_code == 413
