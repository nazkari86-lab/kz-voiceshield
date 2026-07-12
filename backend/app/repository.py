from __future__ import annotations

import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .security import PayloadCipher


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class CaseVersionConflict(RuntimeError):
    pass


class Repository:
    def __init__(self, path: Path, cipher: PayloadCipher) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._cipher = cipher
        self._lock = threading.RLock()
        self._migrate()
        self._fail_interrupted_audio_jobs()

    def _migrate(self) -> None:
        with self._connection:
            self._connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                PRAGMA foreign_keys=ON;
                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    assigned_to TEXT NOT NULL,
                    payload BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS cases_status_updated_idx ON cases(status, updated_at DESC);
                CREATE TABLE IF NOT EXISTS audit_log (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    case_id TEXT,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    detail BLOB NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS audit_case_sequence_idx ON audit_log(case_id, sequence DESC);
                CREATE TABLE IF NOT EXISTS audio_jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    audio BLOB,
                    result BLOB,
                    error BLOB,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    def _fail_interrupted_audio_jobs(self) -> None:
        rows = self._connection.execute(
            "SELECT id FROM audio_jobs WHERE status IN ('queued', 'processing')"
        ).fetchall()
        for row in rows:
            self.update_audio_job(row["id"], "failed", error="Server restarted before transcription completed")

    def close(self) -> None:
        self._connection.close()

    def health_check(self) -> bool:
        with self._lock:
            row = self._connection.execute("SELECT 1 AS ok").fetchone()
        return bool(row and row["ok"] == 1)

    def audit(self, actor: str, action: str, detail: dict[str, Any], case_id: str | None = None) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO audit_log(case_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
                (case_id, actor, action, self._cipher.encrypt_json(detail), utc_now()),
            )

    def upsert_case(self, case_id: str, payload: dict[str, Any], actor: str) -> str:
        now = utc_now()
        status = str(payload.get("status", "new"))
        assigned_to = str(payload.get("assignedTo", "Unassigned"))
        with self._lock, self._connection:
            existing = self._connection.execute("SELECT created_at FROM cases WHERE id = ?", (case_id,)).fetchone()
            created_at = existing["created_at"] if existing else now
            self._connection.execute(
                """INSERT INTO cases(id, status, assigned_to, payload, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET status=excluded.status, assigned_to=excluded.assigned_to,
                   payload=excluded.payload, updated_at=excluded.updated_at""",
                (case_id, status, assigned_to, self._cipher.encrypt_json(payload), created_at, now),
            )
        self.audit(actor, "case_updated" if existing else "case_created", {"status": status, "assignedTo": assigned_to}, case_id)
        return now

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("SELECT payload FROM cases WHERE id = ?", (case_id,)).fetchone()
        return self._cipher.decrypt_json(row["payload"]) if row else None

    def list_cases(self, status: str | None, limit: int) -> list[dict[str, Any]]:
        with self._lock:
            if status:
                rows = self._connection.execute(
                    "SELECT payload FROM cases WHERE status = ? ORDER BY updated_at DESC LIMIT ?", (status, limit)
                ).fetchall()
            else:
                rows = self._connection.execute("SELECT payload FROM cases ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [self._cipher.decrypt_json(row["payload"]) for row in rows]

    def patch_case(self, case_id: str, patch: dict[str, Any], actor: str) -> dict[str, Any] | None:
        expected_updated_at = patch.pop("expectedUpdatedAt", None)
        with self._lock:
            row = self._connection.execute("SELECT payload FROM cases WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            return None
        payload = self._cipher.decrypt_json(row["payload"])
        if expected_updated_at and payload.get("updatedAt") != expected_updated_at:
            raise CaseVersionConflict("Case was updated by another reviewer")
        if patch.get("status") is not None:
            payload["status"] = patch["status"]
        if patch.get("assignedTo") is not None:
            payload["assignedTo"] = patch["assignedTo"]
        flags = dict(payload.get("flags") or {})
        for key in ("bankContactNeeded", "evidenceBundleReady", "customerCallbackNeeded"):
            if patch.get(key) is not None:
                flags[key] = patch[key]
        payload["flags"] = flags
        if patch.get("decision"):
            history = list(payload.get("decisionHistory") or [])
            history.append({"at": utc_now(), "actor": actor, "action": "reviewer_decision", "detail": patch["decision"]})
            payload["decisionHistory"] = history
        payload["updatedAt"] = utc_now()
        self.upsert_case(case_id, payload, actor)
        self.audit(actor, "workflow_changed", patch, case_id)
        return payload

    def preserve_workflow(self, payload: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
        protected = dict(payload)
        if existing is None:
            protected["status"] = "new"
            protected["assignedTo"] = "Unassigned"
            protected["decisionHistory"] = []
            return protected
        for key in ("status", "assignedTo", "flags", "decisionHistory"):
            if key in existing:
                protected[key] = existing[key]
        return protected

    def list_audit(self, case_id: str | None, limit: int) -> list[dict[str, Any]]:
        with self._lock:
            if case_id:
                rows = self._connection.execute(
                    "SELECT * FROM audit_log WHERE case_id = ? ORDER BY sequence DESC LIMIT ?", (case_id, limit)
                ).fetchall()
            else:
                rows = self._connection.execute("SELECT * FROM audit_log ORDER BY sequence DESC LIMIT ?", (limit,)).fetchall()
        return [
            {
                "sequence": row["sequence"], "caseId": row["case_id"], "actor": row["actor"],
                "action": row["action"], "detail": self._cipher.decrypt_json(row["detail"]), "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def create_audio_job(self, job_id: str, content_type: str, audio: bytes | None, actor: str) -> None:
        now = utc_now()
        encrypted_audio = self._cipher.encrypt_bytes(audio) if audio is not None else None
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO audio_jobs(id, status, content_type, audio, created_by, created_at, updated_at) VALUES (?, 'queued', ?, ?, ?, ?, ?)",
                (job_id, content_type, encrypted_audio, actor, now, now),
            )
        self.audit(actor, "audio_job_created", {"jobId": job_id, "contentType": content_type})

    def update_audio_job(self, job_id: str, status: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE audio_jobs SET status = ?, result = ?, error = ?, updated_at = ? WHERE id = ?",
                (
                    status,
                    self._cipher.encrypt_json(result) if result is not None else None,
                    self._cipher.encrypt_json({"message": error}) if error else None,
                    utc_now(),
                    job_id,
                ),
            )

    def get_audio_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("SELECT * FROM audio_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return None
        error = self._cipher.decrypt_json(row["error"])["message"] if row["error"] else None
        return {
            "jobId": row["id"], "status": row["status"],
            **(self._cipher.decrypt_json(row["result"]) if row["result"] else {}),
            "error": error,
        }
