from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, default_seed_http_get, run_ingest


def main() -> None:
    cfg = IngestConfig(
        db_path=Path("/srv/data/app.db"),
        http_get=default_seed_http_get("/srv/db_seed"),
    )
    summary = run_ingest(cfg)
    print(summary)
    if summary["days_with_decision"] < 28:
        raise SystemExit("seed bake: too few covering january days")


if __name__ == "__main__":
    main()
