# GB Wind Day-Ahead Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship the full-stack portal (React + FastAPI) that shows January-2026 decision-time GB wind forecasts (Elexon BMRS) and quantifies their accuracy (MAE/RMSE/MAPE/bias).

**Architecture:** One-time chunked ETL (FUELHH 30-min + WINDFOR revisions) → pre-computed SQLite (`data/app.db`) → thin FastAPI (4 endpoints; Docker → Render free) → Vite/React/TS "C-tuned" workbench UI (Vercel free). URL holds app state; one `/api/day` payload carries all revisions for instant scrubbing.

**Tech Stack:** Python 3.12 · FastAPI · SQLite · pytest · React 18 + TypeScript + Vite · Recharts (chart only; error bars & heatmap are pure CSS) · vitest + RTL · Docker Compose · Vercel + Render.

**Spec:** `docs/superpowers/specs/2026-10-25-wind-forecast-portal-design.md` — read before starting.

## Ground rules for every task

- All timestamps UTC ISO-8601 with `Z`, stored as TEXT. January 2026 UK = GMT = UTC (no DST in window — do not add DST logic).
- Commit after every green test run. Never commit red.
- `pytest` paths are run from `D:\REint\backend`; `npm` from `D:\REint\frontend`.
- Tests never hit the live network: fake HTTP callables / seed CSVs only.
- Every frontend task finishes with `npm run lint && npm run build && npm test` before its commit.

---

## Task 0: Backend scaffold

**Files:**
- Create: `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/pytest.ini`, `backend/app/__init__.py`, `backend/app/etl/__init__.py`, `backend/app/api/__init__.py` (empty), `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/README.md`

- [ ] **Step 1: Create directories**

```bash
mkdir -p backend/app/etl backend/app/api backend/tests backend/scripts
```

- [ ] **Step 2: Write dependency + config files**

`backend/requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
requests==2.32.3
```

`backend/requirements-dev.txt`:
```
pytest==8.3.4
httpx==0.28.1
```

`backend/pytest.ini`:
```ini
[pytest]
testpaths = tests
addopts = -q
```

`backend/tests/conftest.py`:
```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

Create empty: `backend/app/__init__.py`, `backend/app/etl/__init__.py`, `backend/app/api/__init__.py`, `backend/tests/__init__.py`.

`backend/README.md`:
```
# Backend

FastAPI service + ETL for the GB wind day-ahead portal.

Windows:
  python -m venv venv
  venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
  venv\Scripts\pytest
  venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000
```

- [ ] **Step 3: Install deps and confirm tooling**

```bash
cd backend && python -m venv venv && venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt && venv\Scripts\pytest
```
Expected: `no tests ran` (exit 5) — acceptable here.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: backend scaffold (fastapi, pytest)"
```

---

## Task 1: Alignment module (30-min → hourly)

**Files:**
- Create: `backend/app/etl/align.py`
- Test: `backend/tests/test_align.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_align.py`:
```python
from app.etl.align import hourly_actuals


def _row(t: str, publish: str, mw: float):
    return {"startTime": t, "publishTime": publish, "generation": mw}


def test_two_half_hours_average_into_one_hour():
    rows = [
        _row("2026-01-02T00:00:00Z", "2026-01-02T03:00:00Z", 1000.0),
        _row("2026-01-02T00:30:00Z", "2026-01-02T03:30:00Z", 2000.0),
        _row("2026-01-02T01:00:00Z", "2026-01-02T04:00:00Z", 4000.0),
        _row("2026-01-02T01:30:00Z", "2026-01-02T04:30:00Z", 6000.0),
    ]
    out = hourly_actuals(rows)
    assert out == [
        {"t": "2026-01-02T00:00:00Z", "mw": 1500.0},
        {"t": "2026-01-02T01:00:00Z", "mw": 5000.0},
    ]


def test_dedupes_to_latest_revision():
    rows = [
        _row("2026-01-02T00:00:00Z", "2026-01-02T03:00:00Z", 100.0),
        _row("2026-01-02T00:00:00Z", "2026-01-02T13:00:00Z", 900.0),
        _row("2026-01-02T00:30:00Z", "2026-01-02T13:30:00Z", 1100.0),
    ]
    assert hourly_actuals(rows) == [{"t": "2026-01-02T00:00:00Z", "mw": 1000.0}]


def test_partial_hour_keeps_single_half_hour_value():
    rows = [_row("2026-01-02T02:00:00Z", "2026-01-02T05:00:00Z", 800.0)]
    assert hourly_actuals(rows) == [{"t": "2026-01-02T02:00:00Z", "mw": 800.0}]


def test_output_sorted_by_time():
    rows = [
        _row("2026-01-02T01:30:00Z", "2026-01-02T04:30:00Z", 6000.0),
        _row("2026-01-02T00:00:00Z", "2026-01-02T03:00:00Z", 1000.0),
        _row("2026-01-02T01:00:00Z", "2026-01-02T04:00:00Z", 4000.0),
        _row("2026-01-02T00:30:00Z", "2026-01-02T03:30:00Z", 2000.0),
    ]
    out = hourly_actuals(rows)
    assert [o["t"] for o in out] == ["2026-01-02T00:00:00Z", "2026-01-02T01:00:00Z"]
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_align.py
```
Expected: FAIL `ModuleNotFoundError: No module named 'app.etl.align'`

- [ ] **Step 3: Implement**

`backend/app/etl/align.py`:
```python
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
```

- [ ] **Step 4: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_align.py
```
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/etl/align.py backend/tests/test_align.py
git commit -m "feat(etl): align 30-min fuelhh actuals to hourly"
```

---

## Task 2: Metrics module

**Files:**
- Create: `backend/app/etl/metrics.py`
- Test: `backend/tests/test_metrics.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_metrics.py`:
```python
import math

from app.etl.metrics import compute_metrics, forecast_hourly_error


def _pt(t: str, mw: float) -> dict:
    return {"t": t, "mw": mw}


def test_metrics_hand_computed():
    hours = ["2026-01-05T00:00:00Z", "2026-01-05T01:00:00Z", "2026-01-05T02:00:00Z", "2026-01-05T03:00:00Z"]
    actual_mw = [100.0, 200.0, 0.5, 400.0]
    fc_mw = [150.0, 100.0, 400.0, 400.0]
    # hour index 2 excluded (actual < 1 MW)
    errs = [50.0, -100.0, 0.0]
    m = compute_metrics([_pt(h, a) for h, a in zip(hours, actual_mw)], [_pt(h, f) for h, f in zip(hours, fc_mw)])
    assert m == {
        "mae": round(sum(abs(e) for e in errs) / 3, 3),
        "rmse": round(math.sqrt(sum(e * e for e in errs) / 3), 3),
        "mape": round((50 / 100 + 100 / 200 + 0 / 400) / 3 * 100, 3),
        "bias": round(sum(errs) / 3, 3),
        "n_hours": 3,
    }


def test_hours_without_forecast_or_actual_are_skipped():
    actuals = [_pt("2026-01-05T00:00:00Z", 300.0)]
    fc = [_pt("2026-01-05T01:00:00Z", 999.0)]
    m = compute_metrics(actuals, fc)
    assert m["n_hours"] == 0
    assert m["mae"] == 0.0
    m2 = compute_metrics([_pt("2026-01-05T00:00:00Z", 250.0)], [_pt("2026-01-05T00:00:00Z", 250.0)])
    assert m2["n_hours"] == 1 and m2["mae"] == 0.0


def test_hourly_error_rows_including_missing_sides():
    hourly = forecast_hourly_error(
        [_pt("2026-01-05T00:00:00Z", 250.0), _pt("2026-01-05T01:00:00Z", 500.0)],
        [_pt("2026-01-05T00:00:00Z", 300.0)],
    )
    assert hourly == [
        {"t": "2026-01-05T00:00:00Z", "forecast": 300.0, "actual": 250.0,
         "err": 50.0, "abs_err": 50.0, "pct_err": 20.0},
        {"t": "2026-01-05T01:00:00Z", "forecast": None, "actual": 500.0,
         "err": None, "abs_err": None, "pct_err": None},
    ]


def test_mape_guard_below_floor():
    m = compute_metrics([_pt("2026-01-05T00:00:00Z", 0.5)], [_pt("2026-01-05T00:00:00Z", 999.0)])
    assert m["n_hours"] == 0
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_metrics.py
```
Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`backend/app/etl/metrics.py`:
```python
from __future__ import annotations

import math
from typing import Iterable

ACTUAL_FLOOR_MW = 1.0


def _join(actuals: Iterable[dict], forecast: Iterable[dict]) -> dict[str, dict]:
    fa = {a["t"]: a["mw"] for a in actuals}
    ff = {f["t"]: f["mw"] for f in forecast}
    return {t: {"forecast": ff.get(t), "actual": fa.get(t)}
            for t in sorted(set(fa) | set(ff))}


def compute_metrics(actuals: Iterable[dict], forecast: Iterable[dict]) -> dict:
    """MAE, RMSE, MAPE, bias over hours present in BOTH series with actual >= floor."""
    errs: list[float] = []
    pcts: list[float] = []
    for v in _join(actuals, forecast).values():
        if v["actual"] is None or v["forecast"] is None:
            continue
        if v["actual"] < ACTUAL_FLOOR_MW:
            continue
        err = v["forecast"] - v["actual"]
        errs.append(err)
        pcts.append(abs(err) / v["actual"] * 100.0)
    n = len(errs)
    if n == 0:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "bias": 0.0, "n_hours": 0}
    return {
        "mae": round(sum(abs(e) for e in errs) / n, 3),
        "rmse": round(math.sqrt(sum(e * e for e in errs) / n), 3),
        "mape": round(sum(pcts) / n, 3),
        "bias": round(sum(errs) / n, 3),
        "n_hours": n,
    }


def forecast_hourly_error(actuals: Iterable[dict], forecast: Iterable[dict]) -> list[dict]:
    """Row per joined hour; err/abs_err=None on a missing side; pct_err=None below floor."""
    out = []
    for t, v in _join(actuals, forecast).items():
        f, a = v["forecast"], v["actual"]
        pct = None
        if f is not None and a is not None and a >= ACTUAL_FLOOR_MW:
            pct = round(abs(f - a) / a * 100.0, 3)
        err = None if (f is None or a is None) else round(f - a, 3)
        out.append({"t": t, "forecast": f, "actual": a,
                    "err": err, "abs_err": None if err is None else abs(err), "pct_err": pct})
    return out
```

- [ ] **Step 4: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_metrics.py
```
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/etl/metrics.py backend/tests/test_metrics.py
git commit -m "feat(etl): mae/rmse/mape/bias metrics with mape floor"
```

---

## Task 3: Decision-revision rule

**Files:**
- Create: `backend/app/etl/decision.py`
- Test: `backend/tests/test_decision.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_decision.py`:
```python
from datetime import date

from app.etl.decision import decision_revision


def _rev(publish: str, first: str, last: str) -> dict:
    return {"publishTime": publish, "start_time_first": first, "start_time_last": last}


D3 = date(2026, 1, 3)
W_FIRST = "2026-01-03T00:00:00Z"
W_LAST = "2026-01-03T23:00:00Z"


def test_latest_publish_before_1300_utc_wins():
    revs = [
        _rev("2026-01-02T07:30:00Z", W_FIRST, W_LAST),
        _rev("2026-01-02T11:30:00Z", W_FIRST, W_LAST),
        _rev("2026-01-02T22:30:00Z", W_FIRST, W_LAST),
    ]
    assert decision_revision(revs, D3)["publishTime"] == "2026-01-02T11:30:00Z"


def test_evening_publish_is_never_default():
    revs = [
        _rev("2026-01-02T11:30:00Z", W_FIRST, W_LAST),
        _rev("2026-01-02T22:30:00Z", W_FIRST, W_LAST),
    ]
    assert decision_revision(revs, D3)["publishTime"] == "2026-01-02T11:30:00Z"


def test_jan1_uses_dec31_publish():
    revs = [_rev("2025-12-31T11:30:00Z", "2026-01-01T00:00:00Z", "2026-01-01T23:00:00Z")]
    assert decision_revision(revs, date(2026, 1, 1))["publishTime"] == "2025-12-31T11:30:00Z"


def test_full_day_coverage_required():
    revs = [_rev("2026-01-02T11:30:00Z", W_FIRST, "2026-01-03T22:00:00Z")]
    assert decision_revision(revs, D3) is None


def test_fallback_1_earliest_covering_on_d_minus_1():
    revs = [
        _rev("2026-01-02T18:30:00Z", W_FIRST, W_LAST),
        _rev("2026-01-02T22:30:00Z", W_FIRST, W_LAST),
    ]
    assert decision_revision(revs, D3)["publishTime"] == "2026-01-02T18:30:00Z"


def test_fallback_2_earliest_covering_on_d_minus_2():
    revs = [
        _rev("2026-01-01T22:30:00Z", W_FIRST, W_LAST),
        _rev("2026-01-02T15:30:00Z", W_FIRST, W_LAST),
    ]
    assert decision_revision(revs, D3)["publishTime"] == "2026-01-01T22:30:00Z"
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_decision.py
```
Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`backend/app/etl/decision.py`:
```python
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
    else earliest covering on D-1 (late); else None (gap day)."""
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
```

- [ ] **Step 4: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_decision.py
```
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/etl/decision.py backend/tests/test_decision.py
git commit -m "feat(etl): decision-revision selection with fallback chain"
```
---

## Task 4: Ingestion ETL (SQLite write + chunked fetch)

**Files:**
- Create: `backend/app/db.py`, `backend/app/etl/ingest.py`
- Test: `backend/tests/test_ingest.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ingest.py`:
```python
import sqlite3

from app.etl.ingest import IngestConfig, run_ingest


def _fuel(start: str, publish: str, period: int, mw: float) -> dict:
    return {"dataset": "FUELHH", "publishTime": publish, "startTime": start,
            "settlementDate": "2026-01-02", "settlementPeriod": period,
            "fuelType": "WIND", "generation": mw}


def _fc(publish: str, start: str, mw: float) -> dict:
    return {"dataset": "WINDFOR", "publishTime": publish, "startTime": start, "generation": mw}


FUEL = [
    _fuel("2026-01-02T11:30:00Z", "2026-01-02T14:30:00Z", 24, 5000),
    _fuel("2026-01-02T12:00:00Z", "2026-01-02T15:00:00Z", 25, 4000),
]
FUEL_LATE = [
    _fuel("2026-01-02T11:30:00Z", "2026-01-02T18:00:00Z", 24, 5100),
    _fuel("2026-01-02T12:00:00Z", "2026-01-02T18:30:00Z", 25, 4100),
]
WIND = [
    _fc("2026-01-01T11:30:00Z", "2026-01-02T00:00:00Z", 4500),
    _fc("2026-01-01T11:30:00Z", "2026-01-02T12:00:00Z", 3800),
    _fc("2026-01-01T11:30:00Z", "2026-01-02T23:00:00Z", 5100),
    _fc("2026-01-01T22:30:00Z", "2026-01-02T00:00:00Z", 4700),
]


def fake_http(kind: str, _params: dict) -> list:
    rows = FUEL + FUEL_LATE if kind == "fuelhh" else WIND
    return rows if kind in ("fuelhh", "windfor") else []


def test_run_ingest_writes_db_end_to_end(tmp_path):
    db = tmp_path / "t.db"
    summary = run_ingest(IngestConfig(db_path=db, http_get=fake_http))

    assert summary["days_with_decision"] == 1
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row

    hourly = [dict(r) for r in con.execute("SELECT * FROM actuals_hourly ORDER BY t")]
    # late revision wins: 11:30→5100, 12:00→4100
    assert [r["t"] for r in hourly] == ["2026-01-02T11:00:00Z", "2026-01-02T12:00:00Z"]
    assert hourly[0]["mw"] == 5100.0 and hourly[1]["mw"] == 4100.0

    n_revs = con.execute("SELECT COUNT(*) AS c FROM forecast_revisions").fetchone()["c"]
    assert n_revs == 4

    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert day["n_revisions"] == 2
    assert day["gap_flag"] == ""
    assert day["n_hours"] == 1
    assert day["mae"] == 200.0        # |3800 - 4000| at 12:00 hour only (11:00 hour has no forecast)
    assert day["bias"] == -200.0

    month = dict(con.execute("SELECT * FROM metrics_month").fetchone())
    assert month["month"] == "2026-01"
    assert month["n_days"] == 1 and month["n_hours"] == 1
    assert month["mae"] == 200.0

    meta = dict(con.execute("SELECT * FROM ingest_meta WHERE key='ingested_at'").fetchone())
    assert meta["value"].endswith("Z")
    con.close()


def test_run_ingest_gap_day_flagged(tmp_path):
    wind_only_morning = [
        _fc("2026-01-01T11:30:00Z", "2026-01-02T00:00:00Z", 4500),
        _fc("2026-01-01T11:30:00Z", "2026-01-02T12:00:00Z", 3800),   # does NOT cover full day
    ]

    def gappy_http(kind: str, _p: dict) -> list:
        return (FUEL if kind == "fuelhh" else wind_only_morning)

    db = tmp_path / "g.db"
    summary = run_ingest(IngestConfig(db_path=db, http_get=gappy_http))
    assert summary["days_with_decision"] == 0
    con = sqlite3.connect(db)
    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["gap_flag"] == "no_decision_forecast"
    assert day["decision_publish_time"] is None
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_ingest.py
```
Expected: FAIL `ModuleNotFoundError: No module named 'app.etl.ingest'`

- [ ] **Step 3: Implement `backend/app/db.py`**

```python
from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS actuals_halfhour (
    t TEXT PRIMARY KEY, publish_time TEXT NOT NULL,
    settlement_date TEXT NOT NULL, settlement_period INTEGER NOT NULL, mw REAL NOT NULL);
CREATE TABLE IF NOT EXISTS actuals_hourly (
    t TEXT PRIMARY KEY, mw REAL NOT NULL);
CREATE TABLE IF NOT EXISTS forecast_revisions (
    publish_time TEXT NOT NULL, t TEXT NOT NULL, mw REAL NOT NULL,
    PRIMARY KEY (publish_time, t));
CREATE TABLE IF NOT EXISTS metrics_day (
    delivery_date TEXT PRIMARY KEY, decision_publish_time TEXT,
    mae REAL, rmse REAL, mape REAL, bias REAL,
    forecast_mean REAL, actual_mean REAL, n_hours INTEGER,
    n_revisions INTEGER, gap_flag TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS metrics_month (
    month TEXT PRIMARY KEY, mae REAL, rmse REAL, mape REAL, bias REAL,
    n_days INTEGER, n_hours INTEGER);
CREATE TABLE IF NOT EXISTS ingest_meta (
    key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect(db_path: str | Path) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def init_db(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)
    con.commit()
```

- [ ] **Step 4: Implement `backend/app/etl/ingest.py`**

```python
from __future__ import annotations

import datetime as dt
import time as ttime
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import requests

from app.db import connect, init_db
from app.etl.align import hourly_actuals
from app.etl.decision import decision_revision
from app.etl.metrics import compute_metrics

BASE = "https://data.elexon.co.uk/bmrs/api/v1"
TIMEOUT = 60


@dataclass
class IngestConfig:
    db_path: Path
    days: list[dt.date] | None = None
    wind_window_hours: int = 12
    max_retries: int = 4
    backoff_s: tuple = (2, 5, 10, 20)
    polite_delay_s: float = 0.5
    http_get: Callable[[str, dict], list] | None = None


def _default_days() -> list[dt.date]:
    return [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(31)]


def _windows(first: dt.datetime, last: dt.datetime, hours: int) -> list[tuple[str, str]]:
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    out = []
    fm = first
    while fm < last:
        nxt = min(fm + dt.timedelta(hours=hours), last)
        out.append((fm.strftime(fmt), nxt.strftime(fmt)))
        fm = nxt
    return out


def _retry_fetch(url: str, params: dict, cfg: IngestConfig) -> list:
    for attempt in range(cfg.max_retries + 1):
        try:
            r = requests.get(url, params=params, timeout=TIMEOUT)
            if r.status_code == 200:
                data = r.json()
                return data if isinstance(data, list) else []
            if r.status_code not in (429, 500, 502, 503, 504):
                return []
        except requests.RequestException:
            pass
        if attempt < cfg.max_retries:
            ttime.sleep(cfg.backoff_s[min(attempt, len(cfg.backoff_s) - 1)])
    return []


def fetch_fuelhh(cfg: IngestConfig) -> list[dict]:
    days = cfg.days if cfg.days is not None else _default_days()
    out: list[dict] = []
    for d in days:
        params = {"settlementDateFrom": d.isoformat(),
                  "settlementDateTo": d.isoformat(),
                  "fuelType": "WIND"}
        if cfg.http_get is not None:
            out += [r for r in cfg.http_get("fuelhh", params) if r.get("fuelType") == "WIND"]
        else:
            out += _retry_fetch(f"{BASE}/datasets/FUELHH/stream", params, cfg)
            ttime.sleep(cfg.polite_delay_s)
    return out


def fetch_windfor(cfg: IngestConfig) -> list[dict]:
    windows = _windows(dt.datetime(2025, 12, 31), dt.datetime(2026, 1, 31, 23, 59),
                       cfg.wind_window_hours)
    out: list[dict] = []
    for fm, to in windows:
        params = {"publishDateTimeFrom": fm, "publishDateTimeTo": to}
        if cfg.http_get is not None:
            out += cfg.http_get("windfor", params)
        else:
            out += _retry_fetch(f"{BASE}/datasets/WINDFOR/stream", params, cfg)
            ttime.sleep(cfg.polite_delay_s)
    return out


def _dedupe_latest(rows: list[dict]) -> list[dict]:
    latest: dict[str, dict] = {}
    for r in rows:
        t = r["startTime"]
        if t not in latest or r["publishTime"] > latest[t]["publishTime"]:
            latest[t] = r
    return [latest[k] for k in sorted(latest)]


def run_ingest(cfg: IngestConfig) -> dict:
    fuel_raw = fetch_fuelhh(cfg)
    wind_raw = fetch_windfor(cfg)

    con = connect(cfg.db_path)
    init_db(con)
    for table in ("actuals_halfhour", "actuals_hourly",
                  "forecast_revisions", "metrics_day", "metrics_month", "ingest_meta"):
        con.execute(f"DELETE FROM {table}")

    fuel_rows = _dedupe_latest(fuel_raw)
    con.executemany(
        "INSERT INTO actuals_halfhour VALUES (?,?,?,?,?)",
        [(r["startTime"], r["publishTime"], r["settlementDate"],
          r["settlementPeriod"], round(float(r["generation"]), 3))
         for r in fuel_rows])

    hourly = hourly_actuals([
        {"startTime": r["startTime"], "publishTime": r["publishTime"], "generation": r["generation"]}
        for r in fuel_rows])
    con.executemany("INSERT INTO actuals_hourly VALUES (?,?)",
                    [(r["t"], r["mw"]) for r in hourly])
    hourly_by_t = {r["t"]: r["mw"] for r in hourly}

    revs = sorted({(r["publishTime"], r["startTime"], round(float(r["generation"]), 3))
                   for r in wind_raw})
    con.executemany("INSERT INTO forecast_revisions VALUES (?,?,?)", revs)

    by_pub: dict[str, list[tuple[str, float]]] = {}
    for p, t, g in revs:
        by_pub.setdefault(p, []).append((t, g))

    digest = []
    for p, series in by_pub.items():
        digest.append({"publishTime": p, "series": series,
                       "start_time_first": min(t for t, _ in series),
                       "start_time_last": max(t for t, _ in series)})

    days = cfg.days if cfg.days is not None else _default_days()
    day_out: list[dict] = []
    for day in days:
        decision = decision_revision(digest, day)
        if decision is None:
            con.execute(
                "INSERT INTO metrics_day VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (day.isoformat(), None, None, None, None, None,
                 None, None, 0, len(by_pub), "no_decision_forecast"))
            day_out.append({"day": day, "metrics": None, "n_hours": 0})
            continue

        d = day.isoformat()
        series = dict(decision["series"])
        act = [{"t": f"{d}T{h:02d}:00:00Z",
                "mw": hourly_by_t.get(f"{d}T{h:02d}:00:00Z")} for h in range(24)]
        act = [{"t": x["t"], "mw": x["mw"]} for x in act if x["mw"] is not None]
        fc = [{"t": t, "mw": mw} for t, mw in sorted(series.items()) if t.startswith(d)]
        m = compute_metrics(act, fc)
        gap = "" if m["n_hours"] > 0 else "no_metric_window"
        con.execute(
            "INSERT INTO metrics_day VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (d, decision["publishTime"],
             m["mae"], m["rmse"], m["mape"], m["bias"],
             round(sum(p["mw"] for p in fc) / len(fc), 3) if fc else None,
             round(sum(a["mw"] for a in act) / len(act), 3) if act else None,
             m["n_hours"], len(by_pub), gap))
        day_out.append({"day": day, "metrics": m, "n_hours": m["n_hours"]})

    scored = [r for r in day_out if r["metrics"] and r["n_hours"] > 0]
    if scored:
        total = sum(r["n_hours"] for r in scored)
        w = lambda key: sum(r["metrics"][key] * r["n_hours"] for r in scored) / total
        con.execute(
            "INSERT INTO metrics_month VALUES (?,?,?,?,?,?,?)",
            ("2026-01", round(w("mae"), 3), round(w("rmse"), 3), round(w("mape"), 3),
             round(w("bias"), 3), len(scored), total))

    ingested = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    con.execute("INSERT INTO ingest_meta VALUES (?,?)", ("ingested_at", ingested))
    con.commit()
    con.close()
    return {
        "ingested_at": ingested,
        "actual_halfhours": len(fuel_rows),
        "actual_hours": len(hourly),
        "forecast_revisions": len(by_pub),
        "days": len(day_out),
        "days_with_decision": len([r for r in day_out if r["metrics"] is not None]),
    }
```

Note: the month `rmse` weight is an hour-weighted mean of daily RMSE values (approximation documented in README §Data model). Per-hour month RMSE would require re-reading hour rows — acceptable, transparent.

- [ ] **Step 5: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_ingest.py
```
Expected: 2 passed. Fix until green — do not commit red.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db.py backend/app/etl/ingest.py backend/tests/test_ingest.py
git commit -m "feat(etl): chunked elexon ingest with sqlite write + decision metrics"
```

---

## Task 5: Seed CSVs (offline fallback)

**Files:**
- Create: `backend/scripts/generate_seed.py`
- Create (generated, committed): `data/seed/fuelhh_wind_jan2026.csv`, `data/seed/windfor_jan2026.csv`

- [ ] **Step 1: Write the generator script**

`backend/scripts/generate_seed.py`:
```python
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, fetch_fuelhh, fetch_windfor

OUT = Path(__file__).resolve().parents[2] / "data" / "seed"

FUEL_COLS = ["startTime", "publishTime", "settlementDate", "settlementPeriod", "fuelType", "generation"]
WIND_COLS = ["publishTime", "startTime", "generation"]


def main() -> None:
    cfg = IngestConfig(db_path=Path("nonexistent.db"))
    OUT.mkdir(parents=True, exist_ok=True)
    fuel = fetch_fuelhh(cfg)
    with (OUT / "fuelhh_wind_jan2026.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FUEL_COLS)
        w.writeheader()
        for r in fuel:
            w.writerow({k: r.get(k) for k in FUEL_COLS})
    wind = fetch_windfor(cfg)
    with (OUT / "windfor_jan2026.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=WIND_COLS)
        w.writeheader()
        for r in wind:
            w.writerow({k: r.get(k) for k in WIND_COLS})
    print(f"wrote {len(fuel)} fuel rows, {len(wind)} wind rows -> {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it once against the live API (~2-3 min: 31 + 62 requests with 0.5 s pauses)**

```bash
cd backend && venv\Scripts\python scripts\generate_seed.py
```
Expected: `wrote 1488 fuel rows, ~10000-13000 wind rows -> D:\REint\data\seed` (verify counts ≥1400 and ≥8000; if far lower, re-run — 429 backoff can drop windows).

- [ ] **Step 3: Spot-check and commit the CSVs**

```bash
head -3 D:\REint\data\seed\fuelhh_wind_jan2026.csv
head -3 D:\REint\data\seed\windfor_jan2026.csv
git add data/seed && git commit -m "data: seed csvs for jan 2026 (offline ingest fallback)"
```

- [ ] **Step 4: Commit the script**

```bash
git add backend/scripts/generate_seed.py
git commit -m "feat(etl): seed csv generator script"
```

---

## Task 6: API layer (FastAPI)

**Files:**
- Create: `backend/app/api/main.py` (`backend/app/api/__init__.py` already empty)
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_api.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.api.main import make_app
from app.db import connect, init_db


@pytest.fixture()
def client(tmp_path):
    db = tmp_path / "api.db"
    con = connect(db)
    init_db(con)
    con.execute("INSERT INTO actuals_hourly VALUES ('2026-01-02T00:00:00Z', 3000.0)")
    con.execute("INSERT INTO actuals_hourly VALUES ('2026-01-02T01:00:00Z', 3100.0)")
    con.executemany("INSERT INTO actuals_halfhour VALUES (?,?,?,?,?)",
                    [("2026-01-02T00:00:00Z", "2026-01-02T03:00:00Z", "2026-01-02", 1, 2950.0),
                     ("2026-01-02T00:30:00Z", "2026-01-02T03:30:00Z", "2026-01-02", 2, 3050.0)])
    con.executemany("INSERT INTO forecast_revisions VALUES (?,?,?)",
                    [("2026-01-01T11:30:00Z", "2026-01-02T00:00:00Z", 3200.0),
                     ("2026-01-01T11:30:00Z", "2026-01-02T01:00:00Z", 3300.0),
                     ("2026-01-01T22:30:00Z", "2026-01-02T00:00:00Z", 3100.0)])
    con.execute("INSERT INTO metrics_day VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                ("2026-01-02", "2026-01-01T11:30:00Z", 200.0, 220.0, 6.5, 200.0,
                 3250.0, 3050.0, 2, 2, ""))
    con.execute("INSERT INTO metrics_month VALUES (?,?,?,?,?,?,?)",
                ("2026-01", 200.0, 220.0, 6.5, 200.0, 1, 2))
    con.execute("INSERT INTO ingest_meta VALUES ('ingested_at','2026-02-01T00:00:00Z')")
    con.commit()
    con.close()
    app = make_app(db_path=db, allowed_origins=["http://localhost:5173"])
    with TestClient(app) as tc:
        yield tc


def test_health(client):
    b = client.get("/api/health").json()
    assert b == {"status": "ok", "ingested_at": "2026-02-01T00:00:00Z", "day_count": 1}


def test_calendar(client):
    days = client.get("/api/calendar").json()["days"]
    assert len(days) == 1
    d = days[0]
    assert d["date"] == "2026-01-02"
    assert d["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert d["n_revisions"] == 2
    assert d["mae"] == 200.0
    assert d["gap_flag"] == ""


def test_day_payload_shape(client):
    b = client.get("/api/day/2026-01-02").json()
    assert b["date"] == "2026-01-02"
    assert b["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert [r["publishTime"] for r in b["revisions"]] == ["2026-01-01T11:30:00Z", "2026-01-01T22:30:00Z"]
    assert b["metrics"]["mae"] == 200.0
    assert len(b["hourly"]) == 2
    h0 = b["hourly"][0]
    assert h0 == {"t": "2026-01-02T00:00:00Z", "forecast": 3200.0, "actual": 3000.0,
                  "err": 200.0, "abs_err": 200.0, "pct_err": 6.667}
    assert b["actuals"][0] == {"t": "2026-01-02T00:00:00Z", "mw": 3000.0}


def test_day_requested_revision_recomputes(client):
    b = client.get("/api/day/2026-01-02", params={"revision": "2026-01-01T22:30:00Z"}).json()
    assert b["requested_revision"] == "2026-01-01T22:30:00Z"
    assert b["hourly"][0]["forecast"] == 3100.0
    assert b["hourly"][0]["err"] == 100.0


def test_day_unknown_date_404(client):
    assert client.get("/api/day/2030-05-05").status_code == 404


def test_day_bad_format_422(client):
    assert client.get("/api/day/2026-13-77").status_code == 422


def test_day_unknown_revision_422(client):
    r = client.get("/api/day/2026-01-02", params={"revision": "2026-01-01T09:00:00Z"})
    assert r.status_code == 422


def test_month(client):
    b = client.get("/api/month").json()
    assert b["mae"] == 200.0
    assert b["n_hours"] == 2
    assert b["days"][0] == {"date": "2026-01-02", "mae": 200.0, "rmse": 220.0,
                            "mape": 6.5, "bias": 200.0}


def test_cors_preflight(client):
    r = client.options("/api/health", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_other_origin_denied(client):
    r = client.options("/api/health", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") is None
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_api.py
```
Expected: FAIL `ModuleNotFoundError: No module named 'app.api.main'`

- [ ] **Step 3: Implement `backend/app/api/main.py`**

```python
from __future__ import annotations

import os
import sqlite3
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.db import connect, init_db
from app.etl.metrics import compute_metrics, forecast_hourly_error

EMPTY_METRICS = {"mae": None, "rmse": None, "mape": None, "bias": None, "n_hours": 0}


def make_app(db_path: str | os.PathLike, allowed_origins: list[str] | None = None) -> FastAPI:
    app = FastAPI(title="GB Wind Day-Ahead Portal API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if allowed_origins is not None else ["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    con = connect(db_path)
    init_db(con)

    def q(sql: str, params=()) -> list[sqlite3.Row]:
        return con.execute(sql, params).fetchall()

    @app.get("/api/health")
    def health():
        ingested = q("SELECT value FROM ingest_meta WHERE key='ingested_at'")
        return {"status": "ok",
                "ingested_at": ingested[0]["value"] if ingested else None,
                "day_count": len(q("SELECT delivery_date FROM metrics_day"))}

    @app.get("/api/calendar")
    def calendar():
        return {"days": [_day_row(r) for r in
                         q("SELECT * FROM metrics_day ORDER BY delivery_date")]}

    def _day_row(r: sqlite3.Row) -> dict:
        return {"date": r["delivery_date"], "gap_flag": r["gap_flag"],
                "decision_publish_time": r["decision_publish_time"],
                "n_revisions": r["n_revisions"],
                "mae": r["mae"], "rmse": r["rmse"], "mape": r["mape"], "bias": r["bias"],
                "forecast_mean": r["forecast_mean"], "actual_mean": r["actual_mean"]}

    @app.get("/api/day/{day}")
    def day(day: str, revision: str | None = None, overlay: str | None = None):
        try:
            day_date = date.fromisoformat(day)
        except ValueError:
            raise HTTPException(422, "invalid date, expected YYYY-MM-DD")
        rows = q("SELECT * FROM metrics_day WHERE delivery_date=?", (day_date.isoformat(),))
        if not rows:
            raise HTTPException(404, "day not found")
        meta = rows[0]

        act = [{"t": r["t"], "mw": r["mw"]} for r in
               q("SELECT t, mw FROM actuals_hourly ORDER BY t")]
        act_day = [a for a in act if a["t"].startswith(day_date.isoformat())]

        rev_rows = q(
            "SELECT publish_time, t, mw FROM forecast_revisions "
            "WHERE t >= ? AND t <= ? ORDER BY publish_time, t",
            (f"{day_date}T00:00:00Z", f"{day_date}T23:59:59Z"))
        revs: dict[str, list[dict]] = {}
        for r in rev_rows:
            revs.setdefault(r["publish_time"], []).append({"t": r["t"], "mw": r["mw"]})

        target = revision or meta["decision_publish_time"]
        if target is None:
            metrics, hourly = dict(EMPTY_METRICS), []
        elif target not in revs:
            raise HTTPException(422, f"revision {target} has no points on this day")
        else:
            fc_day = [p for p in revs[target] if p["t"].startswith(day_date.isoformat())]
            hourly = forecast_hourly_error(act_day, fc_day)
            metrics = compute_metrics(act_day, fc_day)

        return {
            "date": day_date.isoformat(),
            "gap_flag": meta["gap_flag"],
            "decision_publish_time": meta["decision_publish_time"],
            "requested_revision": revision,
            "overlay": overlay,
            "metrics": metrics,
            "revisions": [{"publishTime": p, "points": pts} for p, pts in sorted(revs.items())],
            "actuals": act,
            "hourly": hourly,
        }

    @app.get("/api/month")
    def month():
        rows = q("SELECT * FROM metrics_month ORDER BY month")
        m = dict(rows[0]) if rows else {"month": None, "mae": None, "rmse": None,
                                        "mape": None, "bias": None, "n_days": 0, "n_hours": 0}
        days = q("SELECT * FROM metrics_day ORDER BY delivery_date")
        m["days"] = [{"date": r["delivery_date"], "mae": r["mae"], "rmse": r["rmse"],
                      "mape": r["mape"], "bias": r["bias"]} for r in days]
        return m

    return app


def create_app() -> FastAPI:
    origins = os.environ.get("ALLOWED_ORIGINS", "")
    return make_app(
        db_path=os.environ.get("DB_PATH", "data/app.db"),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()] or None,
    )
```

- [ ] **Step 4: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_api.py
```
Expected: 10 passed

- [ ] **Step 5: Full suite + commit**

```bash
cd backend && venv\Scripts\pytest
```
Expected: 26 passed (4 align + 4 metrics + 6 decision + 2 ingest + 10 api). Then:
```bash
git add backend/app/api && git commit -m "feat(api): fastapi health/calendar/day/month endpoints with cors"
```

---

## Task 7: Backend containerization

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `docker-compose.yml`

- [ ] **Step 1: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV DB_PATH=/srv/data/app.db
CMD ["sh", "-c", "uvicorn app.api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
```

- [ ] **Step 2: Write `backend/.dockerignore` and root `docker-compose.yml`**

`backend/.dockerignore`:
```
venv/
tests/
scripts/
.pytest_cache/
__pycache__/
README.md
```

`docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DB_PATH=/srv/data/app.db
      - ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173,http://localhost:8080
    volumes:
      - ./data:/srv/data
```

- [ ] **Step 3: Smoke-run the backend image**

```bash
docker compose build backend && docker compose up backend -d
curl -s http://localhost:8000/api/health
```
Expected (after a local db exists from Task 5 later — at this stage an empty schema DB is built on the fly so) `{"status":"ok","ingested_at":null,"day_count":0}`. Then:
```bash
docker compose down
```

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore docker-compose.yml
git commit -m "chore: backend docker image + compose service"
```
---

## Task 8: Frontend scaffold + typed API client + useApi hook

**Files:**
- Create: `frontend/` (Vite template), `frontend/src/api.ts`, `frontend/src/types.ts`, `frontend/src/hooks/useApi.ts`, `frontend/src/setupTests.ts`
- Test: `frontend/src/hooks/useApi.test.tsx`

- [ ] **Step 1: Scaffold Vite app and install deps**

```bash
cd D:\REint && npm create vite@latest frontend -- --template react-ts
cd frontend && npm install && npm install recharts && npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Configure vitest**

Replace `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: "./src/setupTests.ts",
    globals: true,
  },
})
```

Create `frontend/src/setupTests.ts`:
```typescript
import '@testing-library/jest-dom'
```

Update `frontend/tsconfig.app.json` — inside `compilerOptions` add:
```json
    "types": ["vitest/globals"],
```

Replace `scripts` block in `frontend/package.json`:
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Write the failing hook test**

`frontend/src/hooks/useApi.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApi } from './useApi'

describe('useApi', () => {
  it('loads json data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    }))
    const { result } = renderHook(() => useApi<{ hello: string }>('/api/health'))
    await waitFor(() => expect(result.current.data).toEqual({ hello: 'world' }))
    expect(result.current.error).toBeNull()
  })

  it('exposes error state on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { result } = renderHook(() => useApi('/api/day/9999'))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.data).toBeNull()
  })
})
```

- [ ] **Step 4: Run to verify red**

```bash
cd frontend && npm test
```
Expected: FAIL `Failed to resolve import "./useApi"`

- [ ] **Step 5: Implement types + client + hook**

`frontend/src/types.ts`:
```typescript
export interface Point { t: string; mw: number | null }
export interface HourPoint {
  t: string
  forecast: number | null
  actual: number | null
  err: number | null
  abs_err: number | null
  pct_err: number | null
}
export interface Metrics {
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  n_hours: number
}
export interface Revision { publishTime: string; points: Point[] }
export interface DayRow {
  date: string
  gap_flag: string
  decision_publish_time: string | null
  n_revisions: number
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  forecast_mean: number | null
  actual_mean: number | null
}
export interface DayResponse {
  date: string
  gap_flag: string
  decision_publish_time: string | null
  requested_revision: string | null
  overlay: string | null
  metrics: Metrics
  revisions: Revision[]
  actuals: Point[]
  hourly: HourPoint[]
}
export interface MonthResponse {
  month: string | null
  mae: number | null
  rmse: number | null
  mape: number | null
  bias: number | null
  n_days: number
  n_hours: number
  days: { date: string; mae: number | null; rmse: number | null; mape: number | null; bias: number | null }[]
}
```

`frontend/src/api.ts`:
```typescript
const BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

export const apiUrl = (path: string): string => `${BASE}${path}`

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}
```

`frontend/src/hooks/useApi.ts`:
```typescript
import { useCallback, useEffect, useState } from 'react'
import { getJson } from '../api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(!!path)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!path) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      getJson<T>(path, ctl.signal)
        .then(setData)
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setError(String((e as Error).message))
        })
        .finally(() => setLoading(false))
    }, 150)
    return () => { ctl.abort(); clearTimeout(timer) }
  }, [path, tick])

  return { data, error, loading, refetch }
}
```

- [ ] **Step 6: Run to verify green**

```bash
cd frontend && npm test
```
Expected: 2 passed

- [ ] **Step 7: Lint + build + commit**

```bash
cd frontend && npm run lint && npm run build
git add frontend && git commit -m "feat(fe): vite scaffold, typed api client, useApi hook"
```
(Eslint may flag unused template files `App.css`/`assets` — delete `src/App.css`, `src/assets/react.svg`, then build again.)

---

## Task 9: KPI strip + formatting helpers

**Files:**
- Create: `frontend/src/lib/format.ts`, `frontend/src/components/KpiStrip.tsx`
- Test: `frontend/src/components/KpiStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/src/components/KpiStrip.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiStrip } from './KpiStrip'

const metrics = { mae: 1089.4, rmse: 1492.2, mape: 14.667, bias: -411.0, n_hours: 24 }

describe('KpiStrip', () => {
  it('renders formatted values', () => {
    render(<KpiStrip metrics={metrics} title="DAY · Tue 02 Jan" />)
    expect(screen.getByText('MAE')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-mae')).toHaveTextContent('1,089.4 MW')
    expect(screen.getByTestId('kpi-rmse')).toHaveTextContent('1,492.2 MW')
    expect(screen.getByTestId('kpi-mape')).toHaveTextContent('14.67 %')
    expect(screen.getByTestId('kpi-bias')).toHaveTextContent('-411.0 MW')
  })

  it('renders dashes for missing metrics', () => {
    render(<KpiStrip metrics={{ mae: null, rmse: null, mape: null, bias: null, n_hours: 0 }} title="DAY · gap" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run to verify red**

```bash
cd frontend && npm test
```
Expected: FAIL unresolved import `./KpiStrip`

- [ ] **Step 3: Implement**

`frontend/src/lib/format.ts`:
```typescript
export const fmtNum = (v: number | null | undefined, digits = 1): string =>
  v == null ? '—' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtPercent = (v: number | null | undefined): string =>
  v == null ? '—' : fmtNum(v, 2)

export const fmtTimeShort = (iso: string | null): string =>
  iso == null ? '—' : iso.slice(11, 16)

export const fmtDate = (iso: string): string => {
  // "2026-01-27" → "Tue 27 Jan 2026" (UTC arithmetic only — January GMT, no DST)
  return new Date(iso + 'T00:00:00Z').toLocaleString('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}
```

`frontend/src/components/KpiStrip.tsx`:
```tsx
import type { Metrics } from '../types'
import { fmtNum, fmtPercent } from '../lib/format'

type MetricKey = 'mae' | 'rmse' | 'mape' | 'bias'

const CARDS: { key: MetricKey; label: string; unit: string; sub: string }[] = [
  { key: 'mae', label: 'MAE', unit: 'MW', sub: 'mean |error|' },
  { key: 'rmse', label: 'RMSE', unit: 'MW', sub: 'root mean sq err' },
  { key: 'mape', label: 'MAPE', unit: '%', sub: 'mean |pct error|' },
  { key: 'bias', label: 'Bias', unit: 'MW', sub: 'forecast−actual (over = red)' },
]

export function KpiStrip({ metrics, title }: { metrics: Metrics; title: string }) {
  return (
    <section aria-label="accuracy metrics" className="kpi-row">
      {CARDS.map((c) => (
        <div key={c.key} className={`kpi-card ${c.key === 'bias' && metrics.bias != null && metrics.bias > 0 ? 'kpi-warn' : ''}`}>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value" data-testid={`kpi-${c.key}`}>
            {c.key === 'mape' ? fmtPercent(metrics.mape) : fmtNum(metrics[c.key])}
            {metrics[c.key] != null && <span className="kpi-unit"> {c.unit}</span>}
          </div>
          <div className="kpi-sub">{c.sub}</div>
        </div>
      ))}
    </section>
  )
}
```
(The `title` prop is intentionally accepted but rendered by the AppShell heading, not inside the strip — keep the prop for future flexibility; it is unused in markup.)

- [ ] **Step 4: Run to verify green**

```bash
cd frontend && npm test
```
Expected: 4 passed (2 hook + 2 kpi)

- [ ] **Step 5: Lint + commit**

```bash
cd frontend && npm run lint && npm run build
git add frontend/src && git commit -m "feat(fe): kpi strip with formatting utils"
```

---

## Task 10: MainChart (Recharts) + AccuracyStrip

**Files:**
- Create: `frontend/src/components/MainChart.tsx`, `frontend/src/components/AccuracyStrip.tsx`
- Test: `frontend/src/components/AccuracyStrip.test.tsx`

- [ ] **Step 1: Write failing AccuracyStrip test**

`frontend/src/components/AccuracyStrip.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccuracyStrip } from './AccuracyStrip'
import type { HourPoint } from '../types'

const hourly: HourPoint[] = [
  { t: '2026-01-02T00:00:00Z', forecast: 3200, actual: 3000, err: 200, abs_err: 200, pct_err: 6.667 },
  { t: '2026-01-02T01:00:00Z', forecast: 3300, actual: 3500, err: -200, abs_err: 200, pct_err: 5.714 },
  { t: '2026-01-02T02:00:00Z', forecast: 3400, actual: 3600, err: -200, abs_err: 200, pct_err: 5.556 },
]

const days = Array.from({ length: 31 }, (_, i) => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  mae: 100 + i, rmse: 200 + i, mape: 10 + i * 0.5, bias: i % 3,
}))

describe('AccuracyStrip', () => {
  it('renders signed error bars with tooltips', () => {
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={() => {}} selectedDate="2026-01-02" />)
    expect(screen.getByTitle('00:00 · forecast−actual: +200 MW (+6.7%')).className).toContain('err-over')
    expect(screen.getByTitle('01:00 · forecast−actual: -200 MW (-5.7%')).className).toContain('err-under')
  })

  it('renders 31 heatmap cells and fires day pick', () => {
    const onPick = vi.fn()
    render(<AccuracyStrip hourly={hourly} dates={days} onPickDay={onPick} selectedDate="2026-01-02" />)
    expect(screen.getAllByRole('button', { name: /MAPE/ }).length).toBe(31)
    fireEvent.click(screen.getByTitle('2026-01-27 · MAPE 23.0%'))
    expect(onPick).toHaveBeenCalledWith('2026-01-27')
  })
})
```

- [ ] **Step 2: Run to verify red**

```bash
cd frontend && npm test
```
Expected: FAIL unresolved import `./AccuracyStrip`

- [ ] **Step 3: Implement MainChart**

`frontend/src/components/MainChart.tsx`:
```tsx
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DayResponse } from '../types'

export function MainChart({ day, selectedRev, overlayRev }: {
  day: DayResponse
  selectedRev: string | null
  overlayRev: string | null
}) {
  const fc = day.revisions.find((r) => r.publishTime === selectedRev)
  const ov = day.revisions.find((r) => r.publishTime === overlayRev)

  const data = day.actuals
    .filter((a) => a.t.startsWith(day.date))
    .map((a) => ({
      t: a.t,
      actual: a.mw,
      forecast: fc?.points.find((p) => p.t === a.t)?.mw ?? null,
      overlay: ov?.points.find((p) => p.t === a.t)?.mw ?? null,
    }))

  return (
    <section className="panel panel-main" aria-label="wind generation chart">
      <h4>HOURLY WIND GENERATION · MW</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#22303e" strokeDasharray="3 3" />
          <XAxis dataKey="t" tickFormatter={(t: string) => t.slice(11, 16)} stroke="#8ea3c4" fontSize={11} />
          <YAxis domain={[0, 'auto']} stroke="#8ea3c4" fontSize={11} width={56} />
          <Tooltip
            formatter={(v: number | string | null, name: string) =>
              v == null ? ['—', name] : [`${Math.round(Number(v)).toLocaleString('en-GB')} MW`, name]}
            contentStyle={{ background: '#101a30', border: '1px solid #223255', color: '#c8d3e8' }}
          />
          <Legend wrapperStyle={{ color: '#8ea3c4', fontSize: 11 }} />
          <Line name="Actual" dataKey="actual" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line name="Decision forecast" dataKey="forecast" stroke="#22d3ee" strokeWidth={2.6} dot={false} connectNulls />
          {ov && <Line name="Overlay revision" dataKey="overlay" stroke="#a5b4fc" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
```
(Amendment: XAxis `ticks` omitted — recharts v3.10.1 explicit ticks cannot map these category strings at runtime; auto axis renders 12 labels every 2 h. Verified by jsdom probe.)

- [ ] **Step 4: Implement AccuracyStrip**

`frontend/src/components/AccuracyStrip.tsx`:
```tsx
import type { HourPoint } from '../types'

const hh = (t: string) => t.slice(11, 16)

const HEAT = ['#06283e', '#0c4a6e', '#0e7490', '#0891b2', '#22d3ee', '#67e8f9']

function heatColor(mape: number | null, max: number): string {
  if (mape == null) return '#141d33'
  const f = Math.min(1, Math.max(0, mape) / Math.max(max, 1e-6))
  return HEAT[Math.min(HEAT.length - 1, Math.floor(f * HEAT.length))]
}

export interface DayAccuracyRow { date: string; mape: number | null }

export function AccuracyStrip({ hourly, dates, selectedDate, onPickDay }: {
  hourly: HourPoint[]
  dates: DayAccuracyRow[]
  selectedDate: string
  onPickDay: (d: string) => void
}) {
  const maxAbs = Math.max(1e-9, ...hourly.map((h) => h.abs_err ?? 0))
  const maxMape = Math.max(1e-9, ...dates.map((d) => d.mape ?? 0))

  return (
    <div className="acc-strip">
      <section className="panel" aria-label="signed error by hour">
        <h4>SIGNED ERROR BY HOUR · forecast−actual (MW)</h4>
        <div className="err-bars">
          {hourly.map((h) => {
            if (h.err == null) {
              return <div key={h.t} className="err-gap" title={`${hh(h.t)} · no forecast`} />
            }
            const over = h.err > 0
            const hpx = Math.max(2, Math.round((Math.abs(h.err) / maxAbs) * 56))
            const pct = h.pct_err == null ? null : `${h.err > 0 ? '+' : '-'}${Math.abs(h.pct_err).toFixed(1)}%`
            const sign = h.err > 0 ? '+' : '-'
            return (
              <div key={h.t}
                title={`${hh(h.t)} · forecast−actual: ${sign}${Math.abs(h.err).toFixed(0)} MW (${pct ?? '—'})`}
                className={over ? 'err-over' : 'err-under'}
                style={{ height: `${hpx}px`, width: '7px' }} />
            )
          })}
        </div>
        <div className="err-legend">over-forecast <span className="sw-over" /> · under-forecast <span className="sw-under" /></div>
      </section>

      <section className="panel" aria-label="day mape calendar">
        <h4>JANUARY DAY-MAPE CALENDAR</h4>
        <div className="heatmap">
          {dates.map((d) => (
            <button key={d.date}
              title={`${d.date} · MAPE ${d.mape == null ? '—' : d.mape.toFixed(1)}%`}
              aria-label={`Day ${d.date} MAPE ${d.mape == null ? 'unknown' : d.mape.toFixed(1)} percent`}
              className={`cell ${d.date === selectedDate ? 'cell-sel' : ''}`}
              style={{ background: heatColor(d.mape, maxMape) }}
              onClick={() => onPickDay(d.date)} />
          ))}
        </div>
        <div className="heat-note">hover = exact MAPE · click = open day</div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Run to verify green**

```bash
cd frontend && npm test
```
Expected: 6 passed (tooltip format: err -200 → "-200 MW (-5.7%)" check fixture err 6.7 label `+200 MW (+6.7%)`)

- [ ] **Step 6: Lint + commit**

```bash
cd frontend && npm run lint && npm run build
git add frontend/src && git commit -m "feat(fe): recharts main chart + signed error bars + mape calendar"
```
(If `hourTicks` type-safety nags: type the ticks const as `string[]`.)

---

## Task 11: AppShell + ControlRail + States + styles

**Files:**
- Create: `frontend/src/components/AppShell.tsx`, `frontend/src/components/ControlRail.tsx`, `frontend/src/components/States.tsx`, `frontend/src/styles.css`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/index.html`
- Test: `frontend/src/components/AppShell.test.tsx`

- [ ] **Step 1: Write failing AppShell test**

`frontend/src/components/AppShell.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const calendar = {
  days: ['2026-01-02', '2026-01-03'].map((date) => ({
    date, gap_flag: '', n_revisions: 2,
    decision_publish_time: '2026-01-01T11:30:00Z',
    mae: 200, rmse: 220, mape: 6.5, bias: 150,
    forecast_mean: 3200, actual_mean: 3050,
  })),
}

const dayPayload = (date: string) => ({
  date,
  gap_flag: '',
  decision_publish_time: '2026-01-01T11:30:00Z',
  requested_revision: null,
  overlay: null,
  metrics: { mae: 200, rmse: 220, mape: 6.5, bias: 150, n_hours: 24 },
  revisions: [
    { publishTime: '2026-01-01T11:30:00Z', points: [{ t: `${date}T00:00:00Z`, mw: 3200 }] },
    { publishTime: '2026-01-01T22:30:00Z', points: [{ t: `${date}T00:00:00Z`, mw: 3100 }] },
  ],
  actuals: [{ t: `${date}T00:00:00Z`, mw: 3000 }],
  hourly: [{ t: `${date}T00:00:00Z`, forecast: 3200, actual: 3000, err: 200, abs_err: 200, pct_err: 6.667 }],
})

const month = {
  month: '2026-01', mae: 210, rmse: 230, mape: 7.2, bias: 90, n_days: 2, n_hours: 48,
  days: calendar.days.map((d) => ({ date: d.date, mae: d.mae, rmse: d.rmse, mape: d.mape, bias: d.bias })),
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('/api/calendar')) return Promise.resolve({ ok: true, json: () => Promise.resolve(calendar) })
    if (url.includes('/api/month')) return Promise.resolve({ ok: true, json: () => Promise.resolve(month) })
    const m = url.match(/api\/day\/(\d{4}-\d{2}-\d{2})/) as RegExpMatchArray
    return Promise.resolve({ ok: true, json: () => Promise.resolve(dayPayload(m[1])) })
  }))
})

describe('AppShell', () => {
  it('renders rail, kpis and heat cells', async () => {
    render(<AppShell />)
    await waitFor(() => expect(screen.getByText('DELIVERY DAY')).toBeInTheDocument())
    expect(screen.getByTestId('kpi-mae')).toHaveTextContent('200.0 MW')
    const list = screen.getByRole('listbox', { name: 'revisions' })
    expect(within(list).getAllByRole('option').length).toBe(3)
    expect(screen.getAllByRole('button', { name: /MAPE/ }).length).toBe(2)
  })

  it('clicking a revision chip marks it selected', async () => {
    const user = userEvent.setup()
    render(<AppShell />)
    const list = await screen.findByRole('listbox', { name: 'revisions' })
    await user.click(within(list).getByRole('option', { name: '22:30' }))
    expect(screen.getByTestId('selected-rev')).toHaveTextContent('22:30')
  })

  it('heatmap click switches delivery day', async () => {
    const user = userEvent.setup()
    render(<AppShell />)
    const cell = await screen.findByTitle('2026-01-03 · MAPE 6.5%')
    await user.click(cell)
    await waitFor(() => expect(screen.getByTestId('state-date')).toHaveValue('2026-01-03'))
    expect(window.location.search).toContain('date=2026-01-03')
  })
})
```

- [ ] **Step 2: Run to verify red**

```bash
cd frontend && npm test
```
Expected: FAIL unresolved `./AppShell`

- [ ] **Step 3: Implement States**

`frontend/src/components/States.tsx`:
```tsx
export function Skeleton() {
  return (
    <div className="skeleton-root" aria-busy="true">
      <div className="sk sk-line w40" />
      <div className="sk sk-block" />
      <div className="sk sk-row" />
      <div className="sk sk-block h120" />
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  )
}

export function GapChip({ flag }: { flag: string }) {
  return (
    <div className="gap-chip" role="status">
      ⚠ no usable forecast for this day ({flag}) — accuracy unavailable
    </div>
  )
}
```

- [ ] **Step 4: Implement ControlRail**

`frontend/src/components/ControlRail.tsx`:
```tsx
import type { DayResponse, DayRow, MonthResponse } from '../types'
import { fmtDate, fmtNum, fmtPercent, fmtTimeShort } from '../lib/format'

export function ControlRail({ dates, date, onChangeDate, day, month, rev, overlayRev,
                              onSelectRev, onSelectOverlay }: {
  dates: DayRow[]
  date: string
  onChangeDate: (d: string) => void
  day: DayResponse
  month: MonthResponse | null
  rev: string | null
  overlayRev: string | null
  onSelectRev: (r: string | null) => void
  onSelectOverlay: (r: string | null) => void
}) {
  const isAuto = rev == null || rev === day.decision_publish_time

  return (
    <aside className="rail">
      <label className="rail-label" htmlFor="day-picker">DELIVERY DAY</label>
      <select id="day-picker" data-testid="state-date" value={date}
        onChange={(e) => onChangeDate(e.target.value)}>
        {dates.map((d) => (
          <option key={d.date} value={d.date}>
            {d.date}{d.gap_flag ? ' · gap' : ''}
          </option>
        ))}
      </select>
      <div className="rail-date-long">{fmtDate(date)}</div>

      <div className="rail-label">DECISION REVISION</div>
      <div data-testid="selected-rev" className="rail-decision">
        {isAuto ? `${fmtTimeShort(day.decision_publish_time)} · D-1 ● auto` : fmtTimeShort(rev)}
      </div>
      <div className="chips" role="listbox" aria-label="revisions">
        {day.revisions.map((r) => {
          const isDecision = r.publishTime === day.decision_publish_time
          return (
            <button key={r.publishTime} type="button" role="option"
              aria-selected={r.publishTime === rev}
              className={`chip ${r.publishTime === rev ? 'chip-on' : ''} ${isDecision ? 'chip-decision' : ''}`}
              onClick={() => onSelectRev(r.publishTime)}>
              {fmtTimeShort(r.publishTime)}{isDecision ? ' ●' : ''}
            </button>
          )
        })}
        <button type="button" role="option" aria-selected={isAuto}
          className={`chip chip-auto ${isAuto ? 'chip-on' : ''}`}
          onClick={() => onSelectRev(null)}>
          auto
        </button>
      </div>

      <div className="rail-label">OVERLAY REVISION</div>
      <select aria-label="overlay revision" value={overlayRev ?? ''}
        onChange={(e) => onSelectOverlay(e.target.value || null)}>
        <option value="">none</option>
        {day.revisions
          .filter((r) => r.publishTime !== (rev ?? day.decision_publish_time))
          .map((r) => <option key={r.publishTime} value={r.publishTime}>{fmtTimeShort(r.publishTime)}</option>)}
      </select>

      <div className="rail-label">DAY KPIs</div>
      <div className="rail-grid">
        <div>MAE <b>{fmtNum(day.metrics.mae)}</b></div>
        <div>RMSE <b>{fmtNum(day.metrics.rmse)}</b></div>
        <div>MAPE <b>{fmtPercent(day.metrics.mape)}</b></div>
        <div>Bias <b>{fmtNum(day.metrics.bias)}</b></div>
      </div>

      {month && (
        <>
          <div className="rail-label">JANUARY KPIs</div>
          <div className="rail-grid">
            <div>MAE <b>{fmtNum(month.mae)}</b></div>
            <div>MAPE <b>{fmtPercent(month.mape)}</b></div>
          </div>
        </>
      )}

      <div className="rail-note">
        {day.gap_flag
          ? `gap: ${day.gap_flag}`
          : `${day.revisions.length} revisions · decision ${fmtTimeShort(day.decision_publish_time)}`}
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Implement AppShell + entry files**

`frontend/src/components/AppShell.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi'
import type { DayResponse, DayRow, MonthResponse } from '../types'
import { ControlRail } from './ControlRail'
import { MainChart } from './MainChart'
import { KpiStrip } from './KpiStrip'
import { AccuracyStrip } from './AccuracyStrip'
import { ErrorBanner, GapChip, Skeleton } from './States'

function parseState(): { date: string | null; rev: string | null; overlayRev: string | null } {
  const p = new URLSearchParams(window.location.search)
  return { date: p.get('date'), rev: p.get('rev'), overlayRev: p.get('rev2') }
}

export function AppShell() {
  const init = useMemo(parseState, [])
  const [date, setDate] = useState<string | null>(init.date)
  const [rev, setRev] = useState<string | null>(init.rev)
  const [overlayRev, setOverlayRev] = useState<string | null>(init.overlayRev)

  const calendar = useApi<{ days: DayRow[] }>('/api/calendar')
  const month = useApi<MonthResponse>('/api/month')

  const dates = calendar.data?.days ?? []
  const activeDate = date && dates.some((d) => d.date === date) ? date : dates[0]?.date ?? null

  const dayPath = useMemo(
    () => (activeDate ? `/api/day/${activeDate}${rev ? `?revision=${rev}` : ''}` : null),
    [activeDate, rev])
  const day = useApi<DayResponse>(dayPath)

  useEffect(() => {
    const p = new URLSearchParams()
    if (activeDate) p.set('date', activeDate)
    if (rev) p.set('rev', rev)
    if (overlayRev) p.set('rev2', overlayRev)
    window.history.replaceState(null, '', `?${p.toString()}`)
  }, [activeDate, rev, overlayRev])

  const onPickDay = useCallback((d: string) => { setDate(d); setRev(null); setOverlayRev(null) }, [])
  const selectedRev = rev ?? day.data?.decision_publish_time ?? null

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">GB WIND · DAY-AHEAD PORTAL</span>
        <span className="brand-sub">delivery-day wind &amp; forecast accuracy · Elexon BMRS · Jan 2026</span>
      </header>

      {calendar.error && <ErrorBanner message={`calendar: ${calendar.error}`} onRetry={calendar.refetch} />}

      <div className="shell-body">
        {day.data && activeDate && (
          <ControlRail
            dates={dates}
            date={activeDate}
            onChangeDate={onPickDay}
            day={day.data}
            month={month.data}
            rev={rev}
            overlayRev={overlayRev}
            onSelectRev={setRev}
            onSelectOverlay={setOverlayRev} />
        )}
        <main>
          {day.error && <ErrorBanner message={`day: ${day.error}`} onRetry={day.refetch} />}
          {(day.loading || !day.data) && !day.error && <Skeleton />}
          {day.data && day.data.gap_flag !== '' && <GapChip flag={day.data.gap_flag} />}
          {day.data && day.data.gap_flag !== 'no_decision_forecast' && (
            <>
              <h3 className="day-title">{activeDate}</h3>
              <KpiStrip metrics={day.data.metrics} title="DAY" />
              <MainChart day={day.data} selectedRev={selectedRev} overlayRev={overlayRev} />
              <AccuracyStrip
                hourly={day.data.hourly}
                dates={(month.data?.days ?? []).map((d) => ({ date: d.date, mape: d.mape }))}
                selectedDate={activeDate ?? ''}
                onPickDay={onPickDay} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}
```

(Amendments: overlay dropdown excludes the EFFECTIVE revision (`rev ?? decision_publish_time`); picking a day also resets the overlay selection.)

Replace `frontend/src/App.tsx`:
```tsx
import { AppShell } from './components/AppShell'

export default function App() {
  return <AppShell />
}
```

Replace `frontend/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`frontend/index.html`: set `<title>GB Wind · Day-Ahead Portal</title>`.

- [ ] **Step 6: Write styles.css**

`frontend/src/styles.css`:
```css
:root {
  --bg: #0c1222; --panel: #101a30; --panel2: #0e1526; --line: #223255;
  --text: #c8d3e8; --muted: #8ea3c4; --accent: #22d3ee; --amber: #f59e0b;
  --red: #f87171; --blue: #60a5fa; --violet: #a5b4fc;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.5 Inter, system-ui, sans-serif; }
b { font-variant-numeric: tabular-nums; }

.app-shell { min-height: 100vh; }
.topbar { display: flex; align-items: baseline; gap: 14px;
  padding: 10px 16px; border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; color: #7dd3fc; letter-spacing: .4px; }
.brand-sub { color: var(--muted); font-size: 11px; }

.shell-body { display: flex; gap: 12px; padding: 12px 16px; }
.rail { flex: 0 0 230px; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: 12px; height: fit-content; }
.rail-label { display: block; margin-top: 12px; font-size: 10px; letter-spacing: 1px;
  color: var(--muted); }
.rail select { width: 100%; background: var(--panel2); color: var(--text);
  border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; margin-top: 6px; }
.rail-date-long { color: var(--muted); font-size: 11px; margin-top: 4px; }
.rail-decision { color: #e2eaf7; margin: 4px 0 6px; font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chip { background: #1b2a47; color: #9db1d0; border: 1px solid #243755;
  border-radius: 5px; padding: 2px 7px; cursor: pointer; font-size: 11px; }
.chip-on { background: #0891b2; color: #04141d; font-weight: 700; border-color: #22d3ee; }
.chip-decision { border-color: #22d3ee; }
.chip-auto { border-style: dashed; }
.rail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; }
.rail-grid b { color: #e2eaf7; }
.rail-note { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line);
  color: var(--muted); font-size: 11px; }

main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.day-title { margin: 0; color: #e2eaf7; font-size: 16px; }
.panel { background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: 12px; }
.panel h4 { margin: 0 0 6px; font-size: 11px; color: var(--muted); letter-spacing: 1px; }

.kpi-row { display: flex; gap: 10px; }
.kpi-card { flex: 1; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; padding: 10px; }
.kpi-label { font-size: 10px; color: var(--muted); letter-spacing: 1px; }
.kpi-value { font-size: 22px; font-weight: 700; color: #e2eaf7; }
.kpi-unit { font-size: 11px; color: var(--muted); font-weight: 400; }
.kpi-sub { font-size: 10px; color: #66799c; margin-top: 2px; }
.kpi-warn .kpi-value { color: var(--amber); }

.acc-strip { display: flex; gap: 10px; }
.err-bars { display: flex; align-items: flex-end; gap: 2px; height: 80px;
  border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.err-over { background: var(--red); border-radius: 2px 2px 0 0; }
.err-under { background: var(--blue); border-radius: 2px 2px 0 0; }
.err-gap { width: 6px; height: 3px; background: #2c3c5e; }
.err-legend { font-size: 10px; color: var(--muted); margin-top: 6px; }
.sw-over, .sw-under { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin: 0 4px; }
.sw-over { background: var(--red); }
.sw-under { background: var(--blue); }
.heatmap { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cell { aspect-ratio: 1; border: none; border-radius: 3px; cursor: pointer; }
.cell-sel { outline: 2px solid var(--amber); }
.heat-note { font-size: 9px; color: #66799c; margin-top: 6px; }

.error-banner { background: #3b1020; border: 1px solid #7f1d3f; color: #fecdd3;
  border-radius: 8px; padding: 10px; display: flex; gap: 12px; align-items: center; }
.error-banner button { background: #7f1d3f; color: #fff; border: none;
  border-radius: 6px; padding: 4px 12px; cursor: pointer; }

.gap-chip { background: #3a2c12; border: 1px solid #854d0e; color: #fde68a;
  border-radius: 8px; padding: 8px 12px; font-size: 12px; }

.skeleton-root { display: flex; flex-direction: column; gap: 10px; }
.sk { background: linear-gradient(90deg, #101a30 25%, #16223c 50%, #101a30 75%);
  background-size: 200% 100%; animation: shine 1.2s infinite; border-radius: 8px; }
.sk-line { height: 14px; } .w40 { width: 40%; }
.sk-block { height: 180px; } .h120 { height: 120px; }
.sk-row { height: 74px; }
@keyframes shine { to { background-position: -200% 0; } }

@media (max-width: 1100px) {
  .shell-body { flex-direction: column; }
  .rail { flex: none; width: 100%; }
  .acc-strip { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
```

- [ ] **Step 7: Run to verify green + lint + build**

```bash
cd frontend && npm test && npm run lint && npm run build
```
Expected: 9 passed (2 hook + 2 kpi + 2 accstrip + 3 appshell). Fix test races until green.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(fe): appshell with control rail, kpi strip, charts, url state"
```
---

## Task 12: Seed-CSV fallback loader + local database build

**Files:**
- Modify: `backend/app/etl/ingest.py` (append factory)
- Create: `backend/scripts/build_db.py`
- Test: `backend/tests/test_seed.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_seed.py`:
```python
import sqlite3
from pathlib import Path

from app.etl.ingest import IngestConfig, default_seed_http_get, run_ingest

FUEL_CSV = """startTime,publishTime,settlementDate,settlementPeriod,fuelType,generation
2026-01-02T11:30:00Z,2026-01-02T14:30:00Z,2026-01-02,24,WIND,5000
2026-01-02T12:00:00Z,2026-01-02T15:00:00Z,2026-01-02,25,WIND,4000
"""

WIND_CSV = """publishTime,startTime,generation
2026-01-01T11:30:00Z,2026-01-02T00:00:00Z,4500
2026-01-01T11:30:00Z,2026-01-02T12:00:00Z,3800
2026-01-01T11:30:00Z,2026-01-02T23:00:00Z,5100
"""


def test_seed_http_end_to_end(tmp_path):
    (Path(tmp_path) / "fuelhh_wind_jan2026.csv").write_text(FUEL_CSV, encoding="utf-8")
    (Path(tmp_path) / "windfor_jan2026.csv").write_text(WIND_CSV, encoding="utf-8")

    http = default_seed_http_get(tmp_path)
    db = Path(tmp_path) / "seed.db"
    summary = run_ingest(IngestConfig(db_path=db, http_get=http))

    assert summary["actual_hours"] == 2
    assert summary["days_with_decision"] == 1
    con = sqlite3.connect(db)
    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert day["mae"] == 200.0
```

- [ ] **Step 2: Run to verify red**

```bash
cd backend && venv\Scripts\pytest tests\test_seed.py
```
Expected: FAIL ImportError `default_seed_http_get`

- [ ] **Step 3: Append the factory to `backend/app/etl/ingest.py`**

```python
def default_seed_http_get(seed_dir: str | Path) -> Callable[[str, dict], list]:
    """Clause for offline deployments: reads the seed CSVs instead of hitting BMRS."""
    seed = Path(seed_dir)

    def http_get(kind: str, _params: dict) -> list:
        name = "fuelhh_wind_jan2026.csv" if kind == "fuelhh" else "windfor_jan2026.csv"
        import csv
        with (seed / name).open(newline="", encoding="utf-8") as f:
            return [dict(row) for row in csv.DictReader(f)]

    return http_get
```

(Place `import csv` at the top of the module instead of inside the closure — cleaner:)

Final module top-of-file import line: `import csv` added alongside `import requests`.

- [ ] **Step 4: Run to verify green**

```bash
cd backend && venv\Scripts\pytest tests\test_seed.py
```
Expected: 1 passed

- [ ] **Step 5: Write `backend/scripts/build_db.py`**

```python
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, default_seed_http_get, run_ingest

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    ap = argparse.ArgumentParser(description="Build data/app.db from Elexon (or seed CSVs)")
    ap.add_argument("--source", choices=["api", "seed"], default="api")
    ap.add_argument("--db", default=str(ROOT / "data" / "app.db"))
    args = ap.parse_args()

    cfg = IngestConfig(db_path=Path(args.db))
    if args.source == "seed":
        cfg.http_get = default_seed_http_get(ROOT / "data" / "seed")

    summary = run_ingest(cfg)
    print(summary)
    assert summary["days_with_decision"] >= 28, \
        f"expected >=28 scored January days, got {summary['days_with_decision']}"


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Build the real database (live API first, ~3 min)**

```bash
cd backend && venv\Scripts\python scripts\build_db.py
```
Expected printed summary like `{"ingested_at": "...", "actual_halfhours": ~1488, "actual_hours": ~744, "forecast_revisions": ~90, "days": 31, "days_with_decision": 31}`. If API flaky: `venv\Scripts\python scripts\build_db.py --source seed`.

- [ ] **Step 7: Sanity-check the db**

```bash
cd backend && venv\Scripts\python -c "import sqlite3, json; c = sqlite3.connect(r'..\data\app.db'); rows = [dict(r) for r in c.execute('SELECT d.delivery_date, d.n_hours, d.n_revisions, d.gap_flag FROM metrics_day d ORDER BY d.delivery_date')]; print(json.dumps(rows[:31], indent=0))"
```
Expected: 31 rows, every `n_hours` close to 24 (≈22–24; occasional 21h on near-zero-wind hours), zero `gap_flag` entries. If a day shows `no_decision_forecast`, investigate `decision_publish_time` for that date before moving on (fixture data is complete in the seed).

- [ ] **Step 8: Commit**

```bash
git add backend/app/etl/ingest.py backend/scripts/build_db.py backend/tests/test_seed.py
git commit -m "feat(etl): seed csv loader + local db build script"
```
(`data/app.db` stays uncommitted: already in `.gitignore`.)

---

## Task 13: Frontend containerization + full-stack compose smoke

**Files:**
- Create: `frontend/Dockerfile`, `frontend/nginx.conf`, `.dockerignore` (root, if needed)
- Modify: `docker-compose.yml` (frontend service)

- [ ] **Step 1: Write `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 2: Write `frontend/nginx.conf`**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
  }
}
```

- [ ] **Step 3: Extend `docker-compose.yml` (final)**

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DB_PATH=/srv/data/app.db
      - ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173,http://localhost:8080
    volumes:
      - ./data:/srv/data

  frontend:
    build: ./frontend
    ports: ["8080:80"]
    depends_on:
      - backend
```

- [ ] **Step 4: Full-stack smoke run**

```bash
docker compose up --build -d
curl -s http://localhost:8080/api/health
```
Expected: `{"status":"ok","ingested_at":"...","day_count":31}` (Task 12 db is mounted into backend).

- [ ] **Step 5: Browser check via Playwright (human-visible proof)**

Open `http://localhost:8080` — verify: rail shows 31 days (Jan 1-31), day KPIs filled, main chart renders actuals+forecast lines, MAPE calendar shows 31 cells, URL shows `?date=2026-01-02`. Try `http://localhost:8080/?date=2026-01-27`.

- [ ] **Step 6: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf docker-compose.yml
git commit -m "chore: frontend docker image + full compose stack"
docker compose down
```

---

## Task 14: Deploy + README + video outlines + final checks

**Files:**
- Modify: `backend/Dockerfile` (bake db from seed at build), `backend/scripts/build_db_docker.py`
- Create: `frontend/vercel.json`, `README.md`, `docs/video-part1-client-pitch.md`, `docs/video-part2-tech-review.md`
- Create (committed copies): `backend/db_seed/fuelhh_wind_jan2026.csv`, `backend/db_seed/windfor_jan2026.csv`
- Modify: `backend/.dockerignore` (remove `scripts/` exclusion)

- [ ] **Step 1: Bake the db into the backend image (Render free = ephemeral disk)**

Copy seeds into the image context:
```bash
mkdir backend/db_seed && cp data/seed/*.csv backend/db_seed/
```

`backend/scripts/build_db_docker.py`:
```python
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, default_seed_http_get, run_ingest


def main() -> None:
    cfg = IngestConfig(
        db_path=Path("/srv/data/app.db"),
        http_get=default_seed_http_get("/srv/db_seed"),
    )
    summary = run_ingest(cfg)
    print(summary)
    assert summary["days_with_decision"] >= 28, "seed bake: too few covering january days"


if __name__ == "__main__":
    main()
```

Final `backend/Dockerfile` (replaces Task 7 file):
```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts
COPY db_seed ./db_seed
ENV DB_PATH=/srv/data/app.db
RUN mkdir -p /srv/data && python scripts/build_db_docker.py
CMD ["sh", "-c", "uvicorn app.api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
```

`backend/.dockerignore` (remove the `scripts/` line — scripts must bake):
```
venv/
tests/
.pytest_cache/
__pycache__/
README.md
```

Rebuild to prove the bake works:
```bash
docker compose build backend
docker compose run --rm backend python scripts/build_db_docker.py
```
Expected: printed summary with `days_with_decision` ≥ 28.

- [ ] **Step 2: `frontend/vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 3: Push repo and deploy Render + Vercel (manual, ~15 min)**

```bash
git add -A && git commit -m "chore: baked-db backend image, vercel config"
```
Then:
```bash
gh repo create k7xq2m-wind-da --public --source=. --push
```
Render: New Web Service → connect the repo → root `backend` → runtime auto-Docker → instance `Free` → env `ALLOWED_ORIGINS=https://<vercel>.vercel.app` → health check path `/api/health` → deploy. Wait for green; verify `curl -s https://<render-host>/api/health`.

Vercel: Add New Project → import repo → root `frontend` → framework auto-Vite → env `VITE_API_BASE=https://<render-host>.onrender.com` → deploy. Verify https://<vercel>.vercel.app renders the默认 day (first load may wait ~50 s Render cold start — the error banner's Retry covers it; click Retry once).

Update README placeholders `<render-host>` / `<vercel>` after both URLs are live.

- [ ] **Step 4: README.md (root, final)**

````markdown
# GB Wind Day-Ahead Portal

Web portal (pilot) for a UK energy utility team: view the **decision-time** national wind
generation forecast for each January 2026 delivery day, and **quantify its accuracy**
(MAE / RMSE / MAPE / Bias) against Elexon BMRS actuals — the two numbers a day-ahead
trading desk must reason with.

**AI tools disclosure:** built with assistance from AI coding tools (opencode agent,
GLM/Claude-class models) for code generation, planning, and test scaffolding. Domain
rules (§ decision-revision rule), product design, and deployment choices were
human-directed and are documented in `docs/`.

## Project structure
    project.md                    challenge brief
    plan.md                       implementation plan (this build followed it)
    docs/                         design spec, video outlines
    data/seed/                    committed seed CSVs pulled from Elexon (offline fallback)
    backend/
      app/api/main.py             FastAPI endpoints (health, calendar, day, month)
      app/db.py                   SQLite schema + connection
      app/etl/align.py            30-min → hourly actual alignment
      app/etl/metrics.py          MAE / RMSE / MAPE / Bias (+ floor rule)
      app/etl/decision.py         decision-revision selection (13:00 UTC cutoff rule)
      app/etl/ingest.py           chunked Elexon ingest + SQLite writes
      app/etl/seed loader         default_seed_http_get (offline deploy path)
      scripts/                    generate_seed.py · build_db.py · build_db_docker.py
      tests/                      pytest suite (28 tests)
      Dockerfile                  python:3.12-slim, bakes app.db from seed CSVs
    frontend/
      src/                        React 18 + TS: AppShell, ControlRail, MainChart,
                                  KpiStrip, AccuracyStrip, States, api client, tests
      Dockerfile                  node build → nginx serve (compose parity)
      vercel.json                 SPA rewrites
    docker-compose.yml            backend + frontend, local parity stack

## How to run (local docker)
    docker compose up --build -d
    # UI:   http://localhost:8080   (nginx serves React, proxies /api)
    # API:  http://localhost:8000/api/health

## How to run (dev)
Backend (Windows):
    cd backend
    python -m venv venv
    venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
    venv\Scripts\pytest                       # full test suite
    venv\Scripts\python scripts\build_db.py   # rebuild data/app.db (uses seed if API flaky: --source seed)
    venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000
Frontend:
    cd frontend
    npm install
    npm run dev        # http://localhost:5173 (VITE_API_BASE defaults to :8000)
    npm test / npm run build / npm run lint

## Data rules (the important ones)
- Actuals: Elexon **FUELHH** (`fuelType=WIND`), 30-min rows, deduped to latest `publishTime`
  per `startTime`; hourly actual = mean of the two half-hours.
- Forecasts: Elexon **WINDFOR** hourly revisions; ALL January revisions ingested.
- **Decision revision** = latest revision published on D-1 with `publishTime ≤ 13:00 UTC`
  whose `startTime` coverage spans the full delivery day; fallback chain (earliest covering
  published ≤ D-2, the in-force view → earliest covering on D-1 after the gate → flagged gap)
  in `app/etl/decision.py`.
- MAPE/RMSE/MAE/Bias computed over hours where actual ≥ 1 MW; `n_hours` carries the count.
- Month aggregate: hour-weighted mean of daily MAE/RMSE/MAPE/Bias.

## API
    GET /api/health                      → {status, ingested_at, day_count}
    GET /api/calendar                    → per-day meta (picker + heatmap)
    GET /api/day/{YYYY-MM-DD}?revision=&overlay=  → full payload incl. ALL revisions
    GET /api/month                       → month aggregate + per-day rows

## Live deployment
    UI:  https://<vercel>.vercel.app            ← verify in incognito
    API: https://<render-host>.onrender.com/api/health   (Render free cold start ≈ 50 s)
````

- [ ] **Step 5: Video outlines**

`docs/video-part1-client-pitch.md`:
```markdown
# Part 1 — Client pitch (≤5 min, unlisted YouTube)

0:00 Hook: "You buy the non-wind hours; the wind forecast error is your surprise bill."
0:25 Knowledge view: pick 27 Jan, decision revision 11:30 D-1 — "this is exactly what
     the market told you the morning you bid."
1:15 Precision: overlay 22:30 revision vs decision — "look how confident maidens got
     closer to the day." Hourly error bars show over/under buying hour by hour.
2:30 Trust: MAPE calendar — the month's worst days light up; click into 14 Jan.
     KPI cards quantify: monthly MAE ≈ 1.3 GW MAPE ≈ 20%.
3:45 Confidence: seeded data, validated coverage, every figure reproducible from
     BMRS alone; deep links (?date=…) put any day two clicks away.
4:30 Close: bulletin-quick — "the portal turns forecast error into an operating number."
```

`docs/video-part2-tech-review.md`:
```markdown
# Part 2 — Tech review (≤5 min, unlisted YouTube)

0:00 Architecture: docs/spec diagram — ETL → SQLite → FastAPI (Render/Docker) →
     React (Vercel); JSON contract in docs.
0:45 Ingest: chunked day/window requests (31 + 62), retry/backoff on 429,
     dedupe latest publishTime, committed seed CSVs = offline parity.
1:30 Decision rule: backend/app/etl/decision.py walkthrough + 6 tests covering
     the 13:00 cutoff, late-open hour coverage, fallback chain, Jan-1 edge.
2:15 Metrics: floor rule and hand-computed golden test (test_metrics).
2:45 API: 4 endpoints, CORS pinned, TestClient suite (10 tests), all-revisions
     response design → instantaneous scrubbing in UI.
3:30 Frontend: URL-state deep links, AppShell composition, 9 vitest tests,
     skeleton + error and gap states, responsive rail.
4:15 Practices: TDD commit history, Docker parity local↔Render, plan+spec in docs,
     README AI-tool disclosure.
```

- [ ] **Step 6: Final checks**

```bash
cd backend && venv\Scripts\pytest
cd ..\frontend && npm test && npm run lint && npm run build
git add -A && git commit -m "docs: readme + video outlines; chore: final config"
```
Expected: backend 29 passed (28 incl. seed test) · frontend 9 passed · build green.

- [ ] **Step 7: Submission hygiene (brief §3.3)**

Open in incognito: Vercel URL loads with chart (allow 50 s first-hit) · Render health JSON readable · GitHub repo public & viewable · README links verified. Fill the submission form with all four URLs.

---

## Budget mapping (≈15.5 h of 16)

| Task | Hours |
|---|---|
| 0 scaffold | 0.5 |
| 1-3 align/metrics/decision | 2.0 |
| 4 ingest | 1.5 |
| 5 seeds | 0.5 |
| 6 API | 1.5 |
| 7 backend docker | 0.5 |
| 8 FE scaffold | 1.0 |
| 9-10 KPI + charts | 1.5 |
| 11 shell | 1.5 |
| 12 db build | 0.5 |
| 13 FE docker | 0.5 |
| 14 deploy + docs | 2.0 |
| buffer/debug | 2.0 |
| **total** | **15.5** |

Video recording + form submission is human time on top of the build (the brief's 16 h reads as development effort; the outlines keep it tight).

## Plan self-review

- Spec §4 rule ↔ Task 3 tests (incl. 22:30-negative, Jan-1, fallbacks, full-coverage).
- Spec §6 contract ↔ Task 6 endpoint shapes ↔ frontend `types.ts` (field names identical).
- Metrics floor (≤1 MW) consistent in Task 2 + README + UI `n_hours` display.
- No live network in tests: fake http_get callables (Task 4/12) or committed seed CSVs (Task 12).
- Month RMSE is an hour-weighted mean of daily RMSE (documented approximation in ingest + README).
- Docker images: backend bakes seeded DB (Render-ephemeral-safe); frontend nginx proxies `/api` locally, Vercel uses `VITE_API_BASE` — difference documented in README.
- Type check pass: `Forecast revision` object keys (`publishTime`,`points`) everywhere; `HourPoint` naming identical across components.
