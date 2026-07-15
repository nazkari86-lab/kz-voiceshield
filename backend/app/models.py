from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Role = Literal["analyst", "reviewer", "admin"]
CaseStatus = Literal["new", "reviewing", "escalated", "closed"]
MlVerdict = Literal["fraud", "safe", "needs_review"]
JobStatus = Literal["queued", "processing", "completed", "failed"]


class MlAssessment(BaseModel):
    verdict: MlVerdict
    score: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    model: str
    embeddingModel: str | None = None
    signals: list[str] = Field(default_factory=list)


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


class KnowledgeGraphPayload(BaseModel):
    schemaVersion: str = Field(pattern=r"^voiceshield\.knowledge\.v1$")
    appVersion: str = Field(min_length=1, max_length=32)
    graph: dict[str, Any] = Field(default_factory=dict)
    clientUpdatedAt: str | None = None


class AudioJobResponse(BaseModel):
    jobId: str
    status: JobStatus
    transcript: str | None = None
    transcriptConfidence: int | None = Field(default=None, ge=0, le=100)
    ml: MlAssessment | None = None
    error: str | None = None
