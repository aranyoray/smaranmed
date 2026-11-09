from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class LabResult(BaseModel):
    date: str
    value: float


class TrendInfo(BaseModel):
    direction: str
    slope_per_month: float
    latest: Optional[float] = None
    first: Optional[float] = None


class Signal(BaseModel):
    text: str
    confidence: Optional[float] = None
    sub_text: Optional[str] = None


class TimelineEvent(BaseModel):
    date: str
    title: str
    detail: str


class PatientSummary(BaseModel):
    id: str
    name: str
    age: Optional[int] = None
    phone_last4: Optional[str] = None
    lang: str
    status: str
    label: str
    a1c: List[LabResult] = []
    a1c_trend: Optional[TrendInfo] = None


class PatientDetail(BaseModel):
    id: str
    name: str
    age: Optional[int] = None
    phone_last4: Optional[str] = None
    lang: str
    status: str
    label: str
    last_visit: Optional[str] = None
    next_recall: Optional[str] = None
    recall_reason: Optional[str] = None
    confidence: Optional[float] = None
    linked_ids: int = 1
    a1c: List[LabResult] = []
    a1c_trend: Optional[TrendInfo] = None
    signals: List[Signal] = []
    events: List[TimelineEvent] = []
    outreach: Optional[OutreachDraft] = None


class OutreachDraft(BaseModel):
    en: str = Field(description="English outreach message, 2-3 sentences")
    bn: str = Field(description="Bengali outreach message, 2-3 sentences")
    references_visit: bool = Field(default=True, description="Whether the message references specific visit history")
    contains_medical_advice: bool = Field(default=False, description="Must be false")


class QualityCheck(BaseModel):
    passes: bool
    issues: List[str] = []


class SyncRunSummary(BaseModel):
    id: int
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    records_processed: int = 0
    records_linked: int = 0
    signals_generated: int = 0
    status: str = "running"
    error: Optional[str] = None


class SettingsUpdate(BaseModel):
    sync_schedule: Optional[str] = None
    default_lang: Optional[str] = None
    overdue_days: Optional[int] = Field(None, ge=30, le=365)
    outreach_channel: Optional[str] = None


class SettingsResponse(BaseModel):
    sync_schedule: str
    default_lang: str
    overdue_days: int
    outreach_channel: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    fallback_used: bool = False


PatientDetail.model_rebuild()
