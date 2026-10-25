from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable


def _parse(t: str) -> datetime:
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hourly_actuals(half_hourly: Iterable[dict]) -> list[dict]:
    """Dedup FUELHH rows to latest publishTime per startTime, then average the
    two half-hours of each clock hour into one hourly MW value."""
    latest: dict[str, tuple[datetime, float]] = {}
    for row in half_hourly:
        t = row["startTime"]
        publish = _parse(row["publishTime"])
        mw = float(row["generation"])
        if t not in latest or publish > latest[t][0]:
            latest[t] = (publish, mw)

    buckets: dict[str, list[float]] = {}
    for t, (_, mw) in latest.items():
        hour = _parse(t).replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(_iso(hour), []).append(mw)

    return [{"t": k, "mw": round(sum(v) / len(v), 3)} for k, v in sorted(buckets.items())]
