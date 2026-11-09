from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from postgrest.exceptions import APIError
from supabase import create_client, Client

from backend.config import settings

_client: Optional[Client] = None


def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _missing_row(exc: APIError) -> bool:
    text = " ".join(str(part) for part in (getattr(exc, "message", ""), getattr(exc, "details", "")))
    return "0 rows" in text or "PGRST116" in text


def fetch_patients():
    db = get_db()
    rows = (
        db.table("patients")
        .select("*")
        .is_("contacted_at", "null")
        .order("priority_score", desc=True)
        .execute()
    )
    return rows.data


def fetch_patient(patient_id: str):
    db = get_db()
    try:
        row = db.table("patients").select("*").eq("id", patient_id).maybe_single().execute()
    except APIError as exc:
        if _missing_row(exc):
            return None
        raise
    if not row:
        return None
    return row.data


def fetch_labs(patient_id: str):
    db = get_db()
    rows = db.table("lab_results").select("*").eq("patient_id", patient_id).eq("test_type", "hba1c").order("result_date").execute()
    return rows.data


def fetch_events(patient_id: str):
    db = get_db()
    rows = db.table("events").select("*").eq("patient_id", patient_id).order("event_date", desc=True).execute()
    return rows.data


def fetch_signals(patient_id: str):
    db = get_db()
    rows = db.table("signals").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
    return rows.data


_DEFAULT_SETTINGS = {
    "sync_schedule": "06:10",
    "default_lang": "auto",
    "overdue_days": 90,
    "outreach_channel": "whatsapp",
}


def fetch_settings():
    db = get_db()
    try:
        row = db.table("settings").select("*").eq("id", 1).maybe_single().execute()
    except APIError as exc:
        if _missing_row(exc):
            return dict(_DEFAULT_SETTINGS)
        raise
    if not row or not row.data:
        return dict(_DEFAULT_SETTINGS)
    return row.data


def update_settings(data: dict):
    db = get_db()
    row = db.table("settings").update(data).eq("id", 1).execute()
    if row.data:
        return row.data[0]
    return fetch_settings()


def save_outreach_draft(patient_id: str, lang: str, message: str, agent_run_id: Optional[str] = None):
    db = get_db()
    row = db.table("outreach_drafts").insert({
        "patient_id": patient_id,
        "lang": lang,
        "message": message,
        "agent_run_id": agent_run_id,
    }).execute()
    return row.data[0] if row.data else None


def approve_outreach(patient_id: str) -> int:
    db = get_db()
    pending = (
        db.table("outreach_drafts")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("status", "draft")
        .execute()
    )
    rows = pending.data or []
    if not rows:
        return 0
    db.table("outreach_drafts").update({"status": "approved"}).eq("patient_id", patient_id).eq("status", "draft").execute()
    return len(rows)


def fetch_outreach_pair(patient_id: str):
    db = get_db()
    rows = (
        db.table("outreach_drafts")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    found = {"en": None, "bn": None}
    for row in rows.data or []:
        lang = row.get("lang")
        if lang in found and found[lang] is None:
            found[lang] = row.get("message") or ""
    if found["en"] is None and found["bn"] is None:
        return None
    return {
        "en": found["en"] or "",
        "bn": found["bn"] or "",
        "references_visit": True,
        "contains_medical_advice": False,
    }


def mark_contacted(patient_id: str):
    db = get_db()
    db.table("patients").update({"contacted_at": _utc_now()}).eq("id", patient_id).execute()


def delete_ai_signals(patient_id: str):
    db = get_db()
    db.table("signals").delete().eq("patient_id", patient_id).eq("source", "ai").execute()


def fetch_unlinked_records():
    db = get_db()
    rows = db.table("source_records").select("*").is_("patient_id", "null").execute()
    return rows.data


def link_record(record_id: int, patient_id: str, confidence: float):
    db = get_db()
    db.table("source_records").update({
        "patient_id": patient_id,
        "confidence": confidence,
        "linked_at": _utc_now(),
    }).eq("id", record_id).execute()


def insert_signal(patient_id: str, text: str, confidence: Optional[float] = None, sub_text: Optional[str] = None, source: str = "ai"):
    db = get_db()
    db.table("signals").insert({
        "patient_id": patient_id,
        "text": text,
        "confidence": confidence,
        "sub_text": sub_text,
        "source": source,
    }).execute()


def update_patient_status(patient_id: str, status: str, label: str):
    db = get_db()
    db.table("patients").update({"status": status, "label": label}).eq("id", patient_id).execute()


def update_patient_priority(patient_id: str, score: float):
    db = get_db()
    db.table("patients").update({"priority_score": score}).eq("id", patient_id).execute()


def create_sync_run():
    db = get_db()
    row = db.table("sync_runs").insert({"status": "running"}).execute()
    return row.data[0] if row.data else None


def complete_sync_run(run_id: int, records_processed: int, records_linked: int, signals_generated: int, status: str = "completed", error: Optional[str] = None):
    db = get_db()
    db.table("sync_runs").update({
        "completed_at": _utc_now(),
        "records_processed": records_processed,
        "records_linked": records_linked,
        "signals_generated": signals_generated,
        "status": status,
        "error": error,
    }).eq("id", run_id).execute()


def fetch_latest_sync():
    db = get_db()
    rows = db.table("sync_runs").select("*").order("started_at", desc=True).limit(1).execute()
    return rows.data[0] if rows.data else None


def fetch_recent_outreach(patient_id: str, limit: int = 3):
    db = get_db()
    rows = db.table("outreach_drafts").select("*").eq("patient_id", patient_id).order("created_at", desc=True).limit(limit).execute()
    return rows.data
