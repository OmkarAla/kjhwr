from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import BASE, IngestConfig, _retry_fetch, default_seed_http_get, run_ingest

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    ap = argparse.ArgumentParser(description="Build data/app.db from Elexon (or seed CSVs)")
    ap.add_argument("--source", choices=["api", "seed"], default="api")
    ap.add_argument("--db", default=str(ROOT / "data" / "app.db"))
    args = ap.parse_args()

    cfg = IngestConfig(db_path=Path(args.db))
    if args.source == "api":
        probe = _retry_fetch(f"{BASE}/datasets/FUELHH/stream",
                             {"settlementDateFrom": "2026-01-01",
                              "settlementDateTo": "2026-01-01"}, cfg)
        if not probe:
            raise SystemExit("BMRS unreachable — use --source seed for offline build")
    if args.source == "seed":
        cfg.http_get = default_seed_http_get(ROOT / "data" / "seed")

    summary = run_ingest(cfg)
    print(summary)
    if summary["days_with_decision"] < 28:
        raise SystemExit(f"expected >=28 scored January days, got {summary['days_with_decision']}")


if __name__ == "__main__":
    main()
