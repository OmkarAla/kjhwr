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
