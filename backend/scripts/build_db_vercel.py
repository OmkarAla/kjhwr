from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, default_seed_http_get, run_ingest

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    cfg = IngestConfig(
        db_path=BACKEND_ROOT / "data" / "app.db",
        http_get=default_seed_http_get(BACKEND_ROOT / "db_seed"),
    )
    summary = run_ingest(cfg)
    print(summary)
    if summary["days_with_decision"] < 28:
        raise SystemExit("Vercel seed build: too few covering January days")


if __name__ == "__main__":
    main()
