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
                ("2026-01-02", "2026-01-01T11:30:00Z", 200.0, 200.0, 6.559, 200.0,
                 3250.0, 3050.0, 2, 2, ""))
    con.execute("INSERT INTO metrics_month VALUES (?,?,?,?,?,?,?)",
                ("2026-01", 200.0, 200.0, 6.559, 200.0, 1, 2))
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
    assert b["days"][0] == {"date": "2026-01-02", "mae": 200.0, "rmse": 200.0,
                            "mape": 6.559, "bias": 200.0}


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


def test_day_metrics_match_calendar_row(client):
    b = client.get("/api/day/2026-01-02").json()
    d = client.get("/api/calendar").json()["days"][0]
    assert b["metrics"] == {"mae": d["mae"], "rmse": d["rmse"],
                            "mape": d["mape"], "bias": d["bias"], "n_hours": 2}
    assert b["metrics"]["mae"] == 200.0 and d["mape"] == 6.559


def test_day_all_actuals_below_floor_serves_empty_metrics(tmp_path):
    db = tmp_path / "zf.db"
    con = connect(db)
    init_db(con)
    con.execute("INSERT INTO actuals_hourly VALUES ('2026-01-02T00:00:00Z', 0.5)")
    con.execute("INSERT INTO forecast_revisions VALUES "
                "('2026-01-01T11:30:00Z','2026-01-02T00:00:00Z', 3200.0)")
    con.execute("INSERT INTO metrics_day VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                ("2026-01-02", "2026-01-01T11:30:00Z", None, None, None, None,
                 None, None, 0, 1, "no_metric_window"))
    con.commit()
    con.close()
    app = make_app(db_path=db, allowed_origins=["http://localhost:5173"])
    with TestClient(app) as tc:
        b = tc.get("/api/day/2026-01-02").json()
        assert b["metrics"] == {"mae": None, "rmse": None, "mape": None,
                                "bias": None, "n_hours": 0}
        assert b["hourly"] == [{"t": "2026-01-02T00:00:00Z", "forecast": 3200.0,
                                "actual": 0.5, "err": 3199.5, "abs_err": 3199.5,
                                "pct_err": None}]
