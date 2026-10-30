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
venv\Scripts\python scripts\build_db.py --source seed
set DB_PATH=..\data\app.db
venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000

# macOS / Linux
venv/bin/pip install -r requirements.txt -r requirements-dev.txt
venv/bin/python scripts/build_db.py --source seed
DB_PATH=../data/app.db venv/bin/uvicorn app.api.main:create_app --factory --port 8000
```

`build_db.py` writes the repository-level `data/app.db`; the explicit `DB_PATH` makes the
API read that file when uvicorn is launched from `backend/`.

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:8000`, so the app uses same-origin
URLs by default. Set `VITE_API_BASE` only when the browser must call a different API origin.

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
  server.py              Vercel FastAPI entrypoint
  db_seed/               committed Elexon CSVs (baked into the image)
  tests/                 pytest suite
frontend/
  src/components/        AppShell, ControlRail, MainChart, KpiStrip, AccuracyStrip, Glossary
  src/hooks/useApi.ts    fetch hook with loading/error/retry
  src/lib/format.ts      number, date and percentage formatting
vercel.json              Vercel Services routing: /api backend, all other paths frontend
data/seed/               committed seed CSVs for local/offline builds
docker-compose.yml       backend + nginx frontend parity stack
```

## Tests

```bash
cd backend  && venv\Scripts\pytest      # 39 tests
cd frontend && npm test                 # 26 tests
cd frontend && npm run lint && npm run build
```

## Deployment

The repository is configured as one **Vercel Services** project. The root `vercel.json`
builds two services on one domain:

- `backend` — FastAPI at `backend/`, exposed only under `/api/*`.
- `frontend` — Vite at `frontend/`, exposed at every other path.

`/api/*` is routed to the backend, and the client uses same-origin URLs, so no API host or
service binding is required in the browser. The backend build creates `backend/data/app.db`
from the committed seed CSVs and bundles it into the function; at runtime it is copied to
the instance's temporary directory because Vercel's function bundle is read-only.

Run the full stack locally with `vercel dev --local`, or deploy the repository as one
Vercel project. No `VITE_API_BASE`, `DB_PATH` or `ALLOWED_ORIGINS` is needed for the default
same-origin deployment. Set `VITE_API_BASE` only if the frontend must use an external API,
and `DB_PATH` only if the API should read a different database.

## Known limitations

- January 2026, GB national wind only — no other fuel types, regions or months.
- Post-delivery revisions (`D`, `D+1`) may cover only part of the day; the chart labels the
  coverage (`N of 24 h`) rather than hiding the vintage.
- SQLite is used as a single-file read store; this is a pilot, not a multi-writer service.

## AI tools disclosure

AI assistance was limited to planning, code review and test scaffolding. The
decision-revision logic, product scope and deployment configuration were authored and
verified by the project author.
