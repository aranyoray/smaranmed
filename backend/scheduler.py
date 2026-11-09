"""Run the sync pipeline at the clinic's configured time (settings.sync_schedule).

In the API process this runs as a background task. For a separate cron
service (Railway cron, system cron) use: python -m backend.scheduler --once
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from backend import db
from backend.config import settings
from backend.observability import logger

CHECK_SECONDS = 30


def slot_due(schedule: str, now: datetime) -> str | None:
    """The run key for this minute if a sync is due, else None."""
    schedule = (schedule or "").strip().lower()
    if schedule == "hourly":
        return now.strftime("%Y-%m-%d %H") if now.minute == 0 else None
    if now.strftime("%H:%M") == schedule:
        return now.strftime("%Y-%m-%d %H:%M")
    return None


def run_once():
    from backend.agents.sync import run_sync

    logger.info("Scheduled sync starting")
    run_sync()


async def loop():
    last_key = None
    zone = ZoneInfo(settings.clinic_timezone)
    while True:
        try:
            schedule = db.fetch_settings().get("sync_schedule") or "06:10"
            key = slot_due(schedule, datetime.now(zone))
            if key and key != last_key:
                last_key = key
                await asyncio.to_thread(run_once)
        except Exception:
            logger.exception("Scheduled sync failed")
        await asyncio.sleep(CHECK_SECONDS)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="run one sync now and exit")
    if parser.parse_args().once:
        run_once()
    else:
        asyncio.run(loop())
