import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend import db
from backend.agents.outreach import run_outreach
from backend.agents.prioritize import run_prioritize
from backend.agents.sync import run_sync
from backend.auth import require_staff
from backend.config import settings
from backend.recall_rules import DEFAULT_RULES, compute_recall, validate_rules
from backend.record_linking import normalize_phone
from backend.replies import classify
from backend.schedule import display_date, recall_presentation
from backend.search import run_search
from backend.models import (
    ErrorResponse,
    OutreachDraft,
    PatientDetail,
    PatientSummary,
    RecallItem,
    RecallRule,
    ReplyIn,
    ReplyResult,
    SearchIn,
    SearchResult,
    SendResult,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    if settings.scheduler_enabled:
        from backend.scheduler import loop

        task = asyncio.create_task(loop())
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Smaran API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "X-Staff-Key"],
)

api = APIRouter(prefix="/api", dependencies=[Depends(require_staff)])

STATIC_DIR = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {"index.html", "app.js", "styles.css", "cockpit-rules.js", "cockpit-keywords.json"}


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
    if p.get("escalated_at"):
        return p.get("status") or "due", "Escalated to doctor"
    status, label = recall_presentation(p.get("next_recall"), p.get("status") or "due", threshold)
    return status, label or (p.get("label") or "")


def _build_summary(p: dict, labs: list, threshold: int) -> PatientSummary:
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
        escalated=bool(p.get("escalated_at")),
    )


def _build_detail(p: dict, threshold: int) -> PatientDetail:
    all_labs = db.fetch_all_labs(p["id"])
    usable = _usable_labs([lab for lab in all_labs if lab.get("test_type") == "hba1c"])
    trend = hba1c_slope(usable)
    events = db.fetch_events(p["id"])
    signals = db.fetch_signals(p["id"])
    status, label = _status_label(p, threshold)
    pair = db.fetch_outreach_pair(p["id"])
    recall = compute_recall(all_labs, db.fetch_recall_rules())
    linked, weakest = db.link_stats(p["id"])

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
        confidence=weakest,
        linked_ids=linked or 1,
        a1c=_lab_models(usable),
        a1c_trend=TrendInfo(**trend),
        signals=[Signal(text=s["text"], confidence=s.get("confidence"), sub_text=s.get("sub_text")) for s in signals],
        events=[
            TimelineEvent(date=display_date(e["event_date"]), title=e["title"], detail=e.get("detail") or "")
            for e in events
        ],
        outreach=OutreachDraft(**pair) if pair else None,
        escalated=bool(p.get("escalated_at")),
        recall_items=[RecallItem(**item) for item in recall["items"]],
    )


def _sync_summary(run: dict, default_status: str) -> SyncRunSummary:
    return SyncRunSummary(
        id=run["id"],
        started_at=str(run.get("started_at", "")),
        completed_at=str(run.get("completed_at", "")) if run.get("completed_at") else None,
        records_processed=run.get("records_processed", 0),
        records_linked=run.get("records_linked", 0),
        signals_generated=run.get("signals_generated", 0),
        status=run.get("status", default_status),
    )


def _require_patient(patient_id: str) -> dict:
    p = db.fetch_patient(patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


@app.get("/api/health")
def health():
    return {"status": "ok"}


@api.get("/patients", response_model=List[PatientSummary])
def list_patients():
    threshold = _threshold()
    patients = db.fetch_patients()
    labs = db.fetch_labs_by_patient([p["id"] for p in patients])
    return [_build_summary(p, labs.get(p["id"], []), threshold) for p in patients]


@api.post("/patients/{patient_id}/contact")
def contact_patient(patient_id: str):
    _require_patient(patient_id)
    db.mark_contacted(patient_id)
    return {"status": "contacted", "patient_id": patient_id}


@api.get("/patients/{patient_id}", response_model=PatientDetail)
def get_patient(patient_id: str):
    return _build_detail(_require_patient(patient_id), _threshold())


@api.post("/patients/{patient_id}/reply", response_model=ReplyResult)
def log_reply(patient_id: str, body: ReplyIn):
    """Read a patient's reply, then update their queue status or escalate."""
    p = _require_patient(patient_id)
    from backend.agents.understand import llm_classify_reply

    plan = classify(body.text, llm_classify=llm_classify_reply)
    if p.get("escalated_at"):
        # Stays on the list until the doctor has seen the escalation.
        plan = {**plan, "leaves_queue": False}
    db.record_reply(patient_id, body.text, plan)
    db.insert_event(patient_id, f"Reply · {plan['label']}", body.text[:140], "reply")
    if plan["escalate"]:
        db.insert_signal(patient_id, "Reply needs the doctor's attention.", sub_text=f"Mentioned: {plan['matched'] or 'see reply'}.", source="system")
    logger.info("Reply for %s classified %s by %s", patient_id, plan["intent"], plan["by"])
    return ReplyResult(**plan)


@api.post("/search", response_model=SearchResult)
def search(body: SearchIn):
    """Plain-language queue search, e.g. 'critical and reachable this week'."""
    from backend.agents.understand import llm_parse_query

    threshold = _threshold()
    rows = []
    for p in db.fetch_patients():
        status, _ = _status_label(p, threshold)
        rows.append({**p, "status": status})
    result = run_search(rows, body.q, llm_parse=llm_parse_query)
    return SearchResult(ids=result["ids"], applied=result["applied"], by=result["by"])


@api.post("/outreach/{patient_id}", response_model=OutreachDraft)
def generate_outreach(patient_id: str):
    _require_patient(patient_id)
    try:
        draft = run_outreach(patient_id)
    except Exception:
        logger.exception("Outreach failed for %s", patient_id)
        raise HTTPException(503, "AI draft generation failed. All models unavailable. Please try again.")
    if not draft:
        raise HTTPException(503, "AI draft generation failed. All models unavailable. Please try again.")
    return draft


@api.post("/outreach/{patient_id}/approve")
def approve_outreach(patient_id: str):
    updated = db.approve_outreach(patient_id)
    if not updated:
        raise HTTPException(409, "No draft to approve")
    return {"status": "approved", "patient_id": patient_id, "updated": updated}


@api.post("/outreach/{patient_id}/send", response_model=SendResult)
def send_outreach(patient_id: str, lang: Optional[str] = None):
    """Approve the draft and return a WhatsApp or SMS link. A person presses send."""
    p = _require_patient(patient_id)
    pair = db.fetch_outreach_pair(patient_id)
    if not pair:
        raise HTTPException(409, "No draft to send")
    phone = normalize_phone(p.get("phone") or "")
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(409, "No usable phone number on file")
    db.approve_outreach(patient_id)
    message = pair.get(lang or p.get("lang") or "en") or pair.get("en") or ""
    channel = (db.fetch_settings().get("outreach_channel") or "whatsapp").lower()
    if channel == "sms":
        link = f"sms:+91{phone}?body={quote(message)}"
    else:
        channel = "whatsapp"
        link = f"https://wa.me/91{phone}?text={quote(message)}"
    db.mark_outreach_sent(patient_id)
    db.insert_event(patient_id, f"Reminder opened in {channel.upper() if channel == 'sms' else 'WhatsApp'}", "Approved by care team", "outreach")
    return SendResult(status="ready", channel=channel, link=link)


@api.post("/sync", response_model=SyncRunSummary)
def trigger_sync():
    run_sync()
    run = db.fetch_latest_sync()
    if not run:
        return SyncRunSummary(id=0, status="failed", error="No sync run created")
    return _sync_summary(run, "completed")


@api.get("/sync/latest", response_model=Optional[SyncRunSummary])
def latest_sync():
    run = db.fetch_latest_sync()
    return _sync_summary(run, "unknown") if run else None


@api.post("/prioritize")
def prioritize():
    results = run_prioritize()
    return {"updated": len(results), "priorities": [r.model_dump() for r in results]}


@api.get("/settings", response_model=SettingsResponse)
def get_settings():
    s = db.fetch_settings()
    return SettingsResponse(**s)


@api.put("/settings", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        s = db.fetch_settings()
    else:
        s = db.update_settings(updates)
    return SettingsResponse(**s)


@api.get("/recall-rules", response_model=List[RecallRule])
def get_recall_rules():
    return db.fetch_recall_rules() or DEFAULT_RULES


@api.put("/recall-rules", response_model=List[RecallRule])
def put_recall_rules(rules: List[RecallRule]):
    """Doctor-editable intervals. The next sync recomputes every recall."""
    try:
        clean = validate_rules([r.model_dump(exclude_none=True) for r in rules])
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return db.save_recall_rules(clean) or clean


app.include_router(api)


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
