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
    # check_same_thread=False: the API shares one app-lifetime connection
    # across FastAPI's threadpool (read-only workload, single-worker deploy).
    con = sqlite3.connect(db_path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)
    con.commit()
