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
