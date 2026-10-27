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
    con.row_factory = sqlite3.Row
    day = dict(con.execute("SELECT * FROM metrics_day WHERE delivery_date='2026-01-02'").fetchone())
    assert day["decision_publish_time"] == "2026-01-01T11:30:00Z"
    assert day["mae"] == 200.0


def test_seed_window_filtering(tmp_path):
    (Path(tmp_path) / "fuelhh_wind_jan2026.csv").write_text(FUEL_CSV, encoding="utf-8")
    (Path(tmp_path) / "windfor_jan2026.csv").write_text(WIND_CSV, encoding="utf-8")
    http = default_seed_http_get(tmp_path)

    assert len(http("fuelhh", {"settlementDateFrom": "2026-01-03", "settlementDateTo": "2026-01-03"})) == 0
    assert len(http("fuelhh", {})) == 2
    assert len(http("windfor", {"publishDateTimeFrom": "2026-01-01T11:30:00Z",
                                "publishDateTimeTo": "2026-01-01T11:30:00Z"})) == 3
