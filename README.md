# GB Wind Day-Ahead Portal

Web portal (pilot) for a UK energy utility team: view the **decision-time** national wind
generation forecast for each January 2026 delivery day, and **quantify its accuracy**
(MAE / RMSE / MAPE / Bias) against Elexon BMRS actuals — the two numbers a day-ahead
trading desk must reason with.

**AI tools disclosure:** built with assistance from an AI coding agent (opencode CLI,
GLM-class models) used for planning, code generation, and test scaffolding. Domain rules
(the decision-revision rule), product design, and deployment choices were human-directed
and are documented in `docs/`.

## Project structure
    project.md                    challenge brief
    plan.md                       implementation plan (this build followed it)
    docs/                         design spec, video outlines
    data/seed/                    committed seed CSVs pulled from Elexon (offline fallback)
    backend/
      app/api/main.py             FastAPI endpoints (health, calendar, day, month)
      app/db.py                   SQLite schema + connection
      app/etl/align.py            30-min → hourly actual alignment
      app/etl/metrics.py          MAE / RMSE / MAPE / Bias (+ floor rule)
      app/etl/decision.py         decision-revision selection (13:00 UTC cutoff rule)
      app/etl/ingest.py           chunked Elexon ingest + SQLite writes (+ seed CSV loader)
      scripts/                    generate_seed.py · build_db.py · build_db_docker.py
      db_seed/                    committed copies of the seed CSVs (baked at image build)
      tests/                      pytest suite (36 tests)
      Dockerfile                  python:3.12-slim, bakes app.db from seed CSVs
    frontend/
      src/                        React 19 + TS: AppShell, ControlRail, MainChart,
                                  KpiStrip, AccuracyStrip, States, api client (18 vitest tests)
      Dockerfile                  node build → nginx serve (compose parity)
      vercel.json                 SPA rewrites
    docker-compose.yml            backend + frontend, local parity stack

## How to run (local docker)
    docker compose up --build -d
    # backend image bakes app.db from the committed seed CSVs; compose mounts ./data — the CMD copies the baked db in when data/app.db is absent
    # UI:   http://localhost:8080   (nginx serves React; browser fetches the API on :8000)
    # API:  http://localhost:8000/api/health

## How to run (dev)
Backend (Windows):
    cd backend
    python -m venv venv
    venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
    venv\Scripts\pytest                       # full test suite (36)
    venv\Scripts\python scripts\build_db.py   # rebuild data/app.db (--source seed for offline)
    venv\Scripts\uvicorn app.api.main:create_app --factory --port 8000
Frontend:
    cd frontend
    npm install
    npm run dev        # http://localhost:5173 (VITE_API_BASE defaults to :8000)
    npm test           # 18 tests
    npm run build / npm run lint

## Data rules (the important ones)
- Actuals: Elexon **FUELHH** (`fuelType=WIND`), 30-min rows, deduped to the latest
  `publishTime` per `startTime`; the hourly actual is the mean of its two half-hours.
- Forecasts: Elexon **WINDFOR** hourly revisions; all January revisions ingested.
- **Decision revision** = latest revision published on D-1 with `publishTime ≤ 13:00 UTC`
  whose covered `startTime`s span the full delivery day; fallback chain (earliest covering
  publish < D-1 — the in-force view → earliest covering publish on D-1 after the gate →
  flagged gap) lives in `app/etl/decision.py`.
- MAPE/RMSE/MAE/Bias are computed over hours where actual ≥ 1 MW; `n_hours` carries the count.
- Month aggregate is the hour-weighted mean of the daily values. **Note:** the month RMSE
  is an approximation (hour-weighted mean of daily RMSEs), not the exact month-long RMSE
  recomputed from hourly residuals.

## API
    GET /api/health                       → {status, ingested_at, day_count}
    GET /api/calendar                     → per-day meta (picker + heatmap)
    GET /api/day/{YYYY-MM-DD}?revision=&overlay=  → full payload incl. ALL revisions
    GET /api/month                        → month aggregate + per-day rows

## Live deployment
    UI:  https://<vercel>.vercel.app           (set VITE_API_BASE at build; SPA rewrites)
    API: https://<render-host>.onrender.com/api/health   (Render free cold start ≈ 50 s)

Deploy placement: backend = Render Web Service (root `backend`, Docker runtime, health
check `/api/health`, env `ALLOWED_ORIGINS=https://<vercel>.vercel.app`); frontend = Vercel
(root `frontend`, env `VITE_API_BASE=https://<render-host>.onrender.com`).
