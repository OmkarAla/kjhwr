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
