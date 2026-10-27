from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

CUTOFF = time(13, 0)


def _parse(t: str) -> datetime:
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def covering_candidates(revisions: list[dict], delivery_day: date) -> list[dict]:
    ws = datetime(delivery_day.year, delivery_day.month, delivery_day.day, tzinfo=timezone.utc)
    last_hour = ws + timedelta(days=1) - timedelta(hours=1)
    out = []
    for r in revisions:
        if _parse(r["start_time_first"]) <= ws and _parse(r["start_time_last"]) >= last_hour:
            out.append(r)
    return out


def decision_revision(revisions: list[dict], delivery_day: date) -> dict | None:
    """Spec §4 rule: latest covering revision on D-1 with publishTime <= 13:00 UTC;
    else earliest covering published <= D-2 (in force at decision time);
    else earliest covering on D-1 (late); else None (gap day).
    Revisions: dicts with publishTime/start_time_first/start_time_last (ISO 8601, Z)."""
    d1 = delivery_day - timedelta(days=1)
    covering = covering_candidates(revisions, delivery_day)

    on_d1 = [r for r in covering if _parse(r["publishTime"]).date() == d1]
    early = [r for r in on_d1 if _parse(r["publishTime"]).time() <= CUTOFF]
    if early:
        return max(early, key=lambda r: _parse(r["publishTime"]))

    before = [r for r in covering if _parse(r["publishTime"]).date() < d1]
    if before:
        return min(before, key=lambda r: _parse(r["publishTime"]))

    if on_d1:
        return min(on_d1, key=lambda r: _parse(r["publishTime"]))
    return None
