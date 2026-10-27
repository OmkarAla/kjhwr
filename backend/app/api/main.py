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
            if metrics["n_hours"] == 0:
                metrics = dict(EMPTY_METRICS)

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
