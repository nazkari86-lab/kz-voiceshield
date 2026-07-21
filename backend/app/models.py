from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Role = Literal["analyst", "reviewer", "admin"]
CaseStatus = Literal["new", "reviewing", "escalated", "closed"]
MlVerdict = Literal["fraud", "safe", "needs_review"]
MlDisagreement = Literal["aligned", "rules_high_ml_low", "rules_low_ml_high", "unavailable"]
JobStatus = Literal["queued", "processing", "completed", "failed"]


class MlAssessment(BaseModel):
    verdict: MlVerdict
    score: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    model: str
    embeddingModel: str | None = None
    signals: list[str] = Field(default_factory=list)


class TranscriptAnalysisResponse(BaseModel):
    ml: MlAssessment | None = None
    mlAvailable: bool
    disagreement: MlDisagreement
    redactedTranscript: str
    language: str
    transcriptQuality: Literal["good", "degraded", "unusable"] = "good"
    transcriptQualityFlags: list[str] = Field(default_factory=list)


class TranscriptRequest(BaseModel):
    transcript: str = Field(min_length=3, max_length=100_000)
    ruleAnalysis: dict[str, Any] = Field(default_factory=dict)


class CasePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    status: CaseStatus = "new"
    assignedTo: str = Field(default="Unassigned", max_length=120)


class WorkflowPatch(BaseModel):
    status: CaseStatus | None = None
    assignedTo: str | None = Field(default=None, max_length=120)
    bankContactNeeded: bool | None = None
    evidenceBundleReady: bool | None = None
    customerCallbackNeeded: bool | None = None
    decision: str | None = Field(default=None, max_length=2_000)
    expectedUpdatedAt: str | None = None


class AudioJobResponse(BaseModel):
    jobId: str
    status: JobStatus
    transcript: str | None = None
    transcriptConfidence: int | None = Field(default=None, ge=0, le=100)
    transcriptQuality: Literal["good", "degraded", "unusable"] | None = None
    transcriptQualityFlags: list[str] = Field(default_factory=list)
    ml: MlAssessment | None = None
    error: str | None = None


class CrowdReport(BaseModel):
    id: str = Field(min_length=8, max_length=160, pattern=r"^[A-Za-z0-9._:-]+$")
    numberFingerprint: str = Field(min_length=8, max_length=160, pattern=r"^[A-Za-z0-9._:-]+$")
    feedback: Literal["confirmed_fraud", "not_fraud"]
    riskClass: Literal["SAFE", "UNKNOWN", "ALERT", "SPAM", "PHISHING", "FRAUD", "DANGER"]
    score: int = Field(ge=0, le=100)
    source: Literal["local_sms", "local_call"]
    createdAt: str = Field(min_length=10, max_length=64)
    appVersion: str = Field(min_length=1, max_length=32)


class CrowdReportBatch(BaseModel):
    reports: list[CrowdReport] = Field(min_length=1, max_length=100)


class AccountRegisterRequest(BaseModel):
    deviceId: str = Field(min_length=8, max_length=160, pattern=r"^[A-Za-z0-9._:-]+$")
    displayName: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=24)


class FamilyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class FamilyJoinRequest(BaseModel):
    inviteCode: str = Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9_-]+$")
