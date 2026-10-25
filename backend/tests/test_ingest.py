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
    assert day["mae"] == 300.0        # |3800 - 4100| at 12:00 hour only (11:00 hour has no forecast)
    assert day["bias"] == -300.0

    month = dict(con.execute("SELECT * FROM metrics_month").fetchone())
    assert month["month"] == "2026-01"
    assert month["n_days"] == 1 and month["n_hours"] == 1
    assert month["mae"] == 300.0

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
    con.row_factory = sqlite3.Row
    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["gap_flag"] == "no_decision_forecast"
    assert day["decision_publish_time"] is None


def test_decision_day_without_measured_hours_writes_nulls(tmp_path):
    def no_actuals_http(kind: str, _p: dict) -> list:
        return WIND if kind == "windfor" else []

    db = tmp_path / "na.db"
    summary = run_ingest(IngestConfig(db_path=db, http_get=no_actuals_http))
    assert summary["days_with_decision"] == 0
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert day["mae"] is None and day["rmse"] is None and day["mape"] is None and day["bias"] is None
    assert day["n_hours"] == 0
    assert day["gap_flag"] == "no_metric_window"
    assert day["forecast_mean"] == round((4500 + 3800 + 5100) / 3, 3)
    assert day["actual_mean"] is None
    con.close()
