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
    """Row per joined hour; err/abs_err=None on a missing side; pct_err=None on a missing side or actual below floor."""
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
