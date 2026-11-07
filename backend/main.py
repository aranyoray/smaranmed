from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend import db
from backend.agents.outreach import run_outreach
from backend.agents.prioritize import run_prioritize
from backend.agents.sync import run_sync
from backend.schedule import display_date, recall_presentation
from backend.models import (
    ErrorResponse,
    OutreachDraft,
    PatientDetail,
    PatientSummary,
    SettingsResponse,
    SettingsUpdate,
    SyncRunSummary,
    LabResult,
    TrendInfo,
    Signal,
    TimelineEvent,
)
from backend.record_linking import hba1c_slope
from backend.observability import logger

app = FastAPI(title="Smaran API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {"index.html", "app.js", "styles.css"}


def _threshold() -> int:
    try:
        return int(db.fetch_settings().get("overdue_days") or 90)
    except Exception:
        logger.exception("Using the default overdue threshold")
        return 90


def _usable_labs(labs: list) -> list:
    return [lab for lab in labs if lab.get("value") is not None and lab.get("result_date")]


def _lab_models(labs: list) -> List[LabResult]:
    return [
        LabResult(date=display_date(lab["result_date"]), value=float(lab["value"]))
        for lab in _usable_labs(labs)
    ]


def _status_label(p: dict, threshold: int):
    status, label = recall_presentation(p.get("next_recall"), p.get("status") or "due", threshold)
    return status, label or (p.get("label") or "")


def _build_summary(p: dict, threshold: int) -> PatientSummary:
    labs = db.fetch_labs(p["id"])
    usable = _usable_labs(labs)
    trend = hba1c_slope(usable)
    status, label = _status_label(p, threshold)
    return PatientSummary(
        id=p["id"],
        name=p["name"],
        age=p.get("age"),
        phone_last4=p.get("phone_last4"),
        lang=p.get("lang", "en"),
        status=status,
        label=label,
        a1c=_lab_models(usable),
        a1c_trend=TrendInfo(**trend),
    )


def _build_detail(p: dict, threshold: int) -> PatientDetail:
    labs = db.fetch_labs(p["id"])
    usable = _usable_labs(labs)
    trend = hba1c_slope(usable)
    events = db.fetch_events(p["id"])
    signals = db.fetch_signals(p["id"])
    source_recs = db.get_db().table("source_records").select("id").eq("patient_id", p["id"]).execute()
    status, label = _status_label(p, threshold)
    pair = db.fetch_outreach_pair(p["id"])

    return PatientDetail(
        id=p["id"],
        name=p["name"],
        age=p.get("age"),
        phone_last4=p.get("phone_last4"),
        lang=p.get("lang", "en"),
        status=status,
        label=label,
        last_visit=display_date(p.get("last_visit")) or None,
        next_recall=display_date(p.get("next_recall")) or None,
        recall_reason=p.get("recall_reason"),
        confidence=None,
        linked_ids=len(source_recs.data) if source_recs.data else 1,
        a1c=_lab_models(usable),
        a1c_trend=TrendInfo(**trend),
        signals=[Signal(text=s["text"], confidence=s.get("confidence"), sub_text=s.get("sub_text")) for s in signals],
        events=[
            TimelineEvent(date=display_date(e["event_date"]), title=e["title"], detail=e.get("detail") or "")
            for e in events
        ],
        outreach=OutreachDraft(**pair) if pair else None,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/patients", response_model=List[PatientSummary])
def list_patients():
    threshold = _threshold()
    patients = db.fetch_patients()
    return [_build_summary(p, threshold) for p in patients]


@app.post("/api/patients/{patient_id}/contact")
def contact_patient(patient_id: str):
    p = db.fetch_patient(patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    db.mark_contacted(patient_id)
    return {"status": "contacted", "patient_id": patient_id}


@app.get("/api/patients/{patient_id}", response_model=PatientDetail)
def get_patient(patient_id: str):
    p = db.fetch_patient(patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    return _build_detail(p, _threshold())


@app.post("/api/outreach/{patient_id}", response_model=OutreachDraft)
def generate_outreach(patient_id: str):
    p = db.fetch_patient(patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    try:
        draft = run_outreach(patient_id)
    except Exception:
        logger.exception("Outreach failed for %s", patient_id)
        raise HTTPException(503, "AI draft generation failed. All models unavailable. Please try again.")
    if not draft:
        raise HTTPException(503, "AI draft generation failed. All models unavailable. Please try again.")
    return draft


@app.post("/api/outreach/{patient_id}/approve")
def approve_outreach(patient_id: str):
    updated = db.approve_outreach(patient_id)
    if not updated:
        raise HTTPException(409, "No draft to approve")
    return {"status": "approved", "patient_id": patient_id, "updated": updated}


@app.post("/api/sync", response_model=SyncRunSummary)
def trigger_sync():
    run_sync()
    run = db.fetch_latest_sync()
    if not run:
        return SyncRunSummary(id=0, status="failed", error="No sync run created")
    return SyncRunSummary(
        id=run["id"],
        started_at=str(run.get("started_at", "")),
        completed_at=str(run.get("completed_at", "")) if run.get("completed_at") else None,
        records_processed=run.get("records_processed", 0),
        records_linked=run.get("records_linked", 0),
        signals_generated=run.get("signals_generated", 0),
        status=run.get("status", "completed"),
    )


@app.get("/api/sync/latest", response_model=Optional[SyncRunSummary])
def latest_sync():
    run = db.fetch_latest_sync()
    if not run:
        return None
    return SyncRunSummary(
        id=run["id"],
        started_at=str(run.get("started_at", "")),
        completed_at=str(run.get("completed_at", "")) if run.get("completed_at") else None,
        records_processed=run.get("records_processed", 0),
        records_linked=run.get("records_linked", 0),
        signals_generated=run.get("signals_generated", 0),
        status=run.get("status", "unknown"),
    )


@app.post("/api/prioritize")
def prioritize():
    results = run_prioritize()
    return {"updated": len(results), "priorities": [r.model_dump() for r in results]}


@app.get("/api/settings", response_model=SettingsResponse)
def get_settings():
    s = db.fetch_settings()
    return SettingsResponse(**s)


@app.put("/api/settings", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        s = db.fetch_settings()
    else:
        s = db.update_settings(updates)
    return SettingsResponse(**s)


@app.get("/")
def index_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{path:path}")
def serve_static(path: str):
    name = path.strip("/")
    if name not in PUBLIC_FILES:
        raise HTTPException(404, "Not found")
    file_path = STATIC_DIR / name
    if not file_path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(file_path)
