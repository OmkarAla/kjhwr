# GB Wind Day-Ahead Portal

A decision-support dashboard for a UK energy utility's day-ahead trading desk. It answers
two questions for every January 2026 delivery day:

1. **What wind forecast was actually available when the day-ahead decision had to be made?**
2. **How wrong was that forecast, in units the desk can trade against?**

The portal ingests Elexon BMRS wind forecasts (`WINDFOR`) and actual generation (`FUELHH`),
selects the forecast vintage in force at the decision cut-off, and reports MAE, RMSE, MAPE
and Bias alongside the hourly actual-vs-forecast curve.

## Features

- **Decision revision by default** — the latest full-day forecast published by 13:00 UTC
  on D-1 (11:30 UTC for every day in the sample month).
- **Revision explorer** — inspect any vintage from D-2 to D+1, grouped by issue date; the
  effective decision revision is marked.
- **Overlay comparison** — plot a second revision against the selected one.
- **Accuracy metrics** — day and month MAE / RMSE / MAPE / Bias, with the scored-hour count.
- **Signed error by hour** — over- and under-forecast magnitude for the selected day.
- **Monthly MAPE calendar** — one square per delivery day, click to open that day.
- **Plain-English glossary** — definitions for every domain and metric term in the UI.
- **Shareable URLs** — `?date=…&rev=…&rev2=…` restores the exact view.

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 19, TypeScript, Vite, Recharts, Vitest |
| Backend  | FastAPI, SQLite, pytest |
| Data     | Elexon BMRS `FUELHH` (actuals) and `WINDFOR` (forecasts) |
| Runtime  | Docker Compose locally; nginx for the built SPA |

## Quick start (Docker)

```bash
docker compose up --build -d
```

- UI: <http://localhost:8080>
- API health: <http://localhost:8000/api/health>

The backend image builds `app.db` from the committed seed CSVs at image-build time and
copies it into the mounted `./data` volume when no database is present. To rebuild from
live Elexon data instead, see [Rebuilding the database](#rebuilding-the-database).

## Local development

Backend (Python 3.11+):

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000
# macOS / Linux
venv/bin/pip install -r requirements.txt -r requirements-dev.txt
venv/bin/uvicorn app.api.main:create_app --factory --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

`VITE_API_BASE` defaults to `http://localhost:8000`; set it to point the dev UI at another
API host.

## Rebuilding the database

```bash
cd backend
venv\Scripts\python scripts\build_db.py --source api    # fetch from Elexon BMRS
venv\Scripts\python scripts\build_db.py --source seed   # offline, committed CSVs
```

`--source seed` is the deterministic offline path and the one used by the Docker image.
The generated database lives at `data/app.db` and is gitignored.

## Data rules

- **Actuals** — `FUELHH` rows for `fuelType=WIND`; 30-minute values deduplicated to the
  latest `publishTime` per `startTime`, then averaged into hourly actuals.
- **Forecasts** — all January `WINDFOR` revisions are retained, so any vintage can be
  inspected.
- **Decision revision** — latest revision published on D-1 at or before **13:00 UTC** whose
  coverage spans the whole delivery day. Fallbacks: earliest earlier covering revision,
  then earliest late revision on D-1, then a flagged gap day.
- **Scoring** — metrics use hours where both actual and forecast exist and actual ≥ 1 MW;
  `n_hours` records the count.
- **Month aggregate** — hour-weighted mean of daily values. The month RMSE is an
  hour-weighted mean of daily RMSEs, not a residual-level recomputation.

### January 2026 snapshot

| Metric | Value |
|--------|-------|
| Delivery days | 31 |
| Scored hours | 744 |
| Month MAE | 2,020.9 MW |
| Month RMSE | 2,189.1 MW |
| Month MAPE | 19.72% |
| Month Bias | +1,811.5 MW |
| Highest day MAPE | 8 Jan, 54.08% |
| Lowest day MAPE | 20 Jan, 6.42% |

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness, ingest timestamp, day count |
| `GET /api/calendar` | Per-day summary for the picker and heatmap |
| `GET /api/day/{YYYY-MM-DD}` | Day payload: metrics, hourly series, all revisions, actuals |
| `GET /api/month` | Month aggregate plus per-day rows |

`/api/day` accepts `revision` and `overlay` query parameters; the UI also keeps the overlay
selection in the URL as `rev2`.

## Project layout

```
backend/
  app/api/main.py        FastAPI endpoints
  app/db.py              SQLite schema and connection
  app/etl/               align, decision, ingest, metrics
  scripts/               seed generation and database builds
  db_seed/               committed Elexon CSVs (baked into the image)
  tests/                 pytest suite
frontend/
  src/components/        AppShell, ControlRail, MainChart, KpiStrip, AccuracyStrip, Glossary
  src/hooks/useApi.ts    fetch hook with loading/error/retry
  src/lib/format.ts      number, date and percentage formatting
  vercel.json            SPA rewrites for static hosting
data/seed/               committed seed CSVs for local/offline builds
docker-compose.yml       backend + nginx frontend parity stack
```

## Tests

```bash
cd backend  && venv\Scripts\pytest      # 36 tests
cd frontend && npm test                 # 25 tests
cd frontend && npm run lint && npm run build
```

## Deployment

- **Frontend — Vercel**: project root `frontend`; set `VITE_API_BASE` to the API URL at
  build time. `vercel.json` rewrites all routes to `index.html`.
- **Backend — Render**: Web Service from `backend/` using the Dockerfile; health check
  `/api/health`; set `ALLOWED_ORIGINS` to the Vercel origin and `DB_PATH` if you are not
  using the default. The image ships a baked database, so no external storage is required.
  Free instances cold-start in roughly 50 seconds.

## Known limitations

- January 2026, GB national wind only — no other fuel types, regions or months.
- Post-delivery revisions (`D`, `D+1`) may cover only part of the day; the chart labels the
  coverage (`N of 24 h`) rather than hiding the vintage.
- SQLite is used as a single-file read store; this is a pilot, not a multi-writer service.

## AI tools disclosure

Built with assistance from an AI coding agent (opencode CLI) for planning, code generation
and test scaffolding. The decision-revision rule, product scope and deployment choices were
human-directed.
