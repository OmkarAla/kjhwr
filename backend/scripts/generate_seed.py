from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.etl.ingest import IngestConfig, fetch_fuelhh, fetch_windfor

OUT = Path(__file__).resolve().parents[2] / "data" / "seed"

FUEL_COLS = ["startTime", "publishTime", "settlementDate", "settlementPeriod", "fuelType", "generation"]
WIND_COLS = ["publishTime", "startTime", "generation"]


def main() -> None:
    cfg = IngestConfig(db_path=Path("nonexistent.db"))
    OUT.mkdir(parents=True, exist_ok=True)
    fuel = fetch_fuelhh(cfg)
    with (OUT / "fuelhh_wind_jan2026.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FUEL_COLS)
        w.writeheader()
        for r in fuel:
            w.writerow({k: r.get(k) for k in FUEL_COLS})
    wind = fetch_windfor(cfg)
    with (OUT / "windfor_jan2026.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=WIND_COLS)
        w.writeheader()
        for r in wind:
            w.writerow({k: r.get(k) for k in WIND_COLS})
    print(f"wrote {len(fuel)} fuel rows, {len(wind)} wind rows -> {OUT}")


if __name__ == "__main__":
    main()
