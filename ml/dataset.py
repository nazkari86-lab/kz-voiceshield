from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

ALLOWED_LABELS = {"true_positive", "false_positive", "needs_review"}
SCHEMA_VERSION = "voiceshield.dataset.v2"


@dataclass(frozen=True)
class TrainingCase:
    case_id: str
    transcript: str
    label: str
    rule_score: int
    fingerprint: str


def fingerprint(text: str) -> str:
    normalized = re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", text.lower(), flags=re.UNICODE)).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def load_trusted_cases(path: Path) -> tuple[list[TrainingCase], list[str]]:
    accepted: list[TrainingCase] = []
    rejected: list[str] = []
    seen: set[str] = set()

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
            transcript = str(payload.get("transcript", "")).strip()
            label = payload.get("label")
            provenance = payload.get("provenance") or {}
            if payload.get("schemaVersion") != SCHEMA_VERSION:
                raise ValueError("unsupported schema")
            if provenance.get("trusted") is not True:
                raise ValueError("untrusted provenance")
            if label not in ALLOWED_LABELS:
                raise ValueError("unsupported label")
            if len(transcript.split()) < 3:
                raise ValueError("transcript is too short")
            digest = fingerprint(transcript)
            if digest in seen:
                raise ValueError("duplicate transcript")
            seen.add(digest)
            accepted.append(
                TrainingCase(
                    case_id=str(payload.get("id", f"line-{line_number}")),
                    transcript=transcript,
                    label=label,
                    rule_score=max(0, min(100, int(payload.get("score", 0)))),
                    fingerprint=digest,
                )
            )
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            rejected.append(f"line {line_number}: {error}")

    return accepted, rejected
