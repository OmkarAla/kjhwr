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
