# GB Wind Day-Ahead Portal — Design Spec

**Status:** Approved by user, 2026-10-25
**Source brief:** `project.md` (Full Stack SWE challenge, UK energy utility client)
**Time budget:** 16 h total (build + deploy + video)

## 1. Problem & Users

A UK energy utility team buys the residual electricity — beyond forecast wind generation — for delivery on day D, one day ahead (D-1). The portal serves two purposes for that desk:

1. **Understand decision-time forecasts** — clearly see the latest wind generation forecasts that were available when the D-1 purchase decision had to be made.
2. **Quantify forecast accuracy** — evaluate forecast error numerically so decisions carry a quantified error band.

**Scope guardrails (from brief):** national-level wind only; actuals + forecasts **from Elexon BMRS alone**; delivery days **January 2026**; no auth; no other data sources.

**Users:** (a) the utility trading team — client-facing pitch audience; (b) the internal technical lead — architecture/code review audience.

## 2. Verified data facts (checked live 2026-10-25)

- **Actuals:** `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?settlementDateFrom=D&settlementDateTo=D&fuelType=WIND` → 48 rows/day, 30-min resolution. Fields: `publishTime, startTime, settlementDate, settlementPeriod, fuelType, generation` (MW). Jan 2026 archive is complete.
- **Forecasts:** `GET …/datasets/WINDFOR/stream?publishDateTimeFrom=F&publishDateTimeTo=T` → rows keyed by `publishTime` and hourly `startTime` + `generation` (MW). ~8–11 publishes/day; each revision spans ≈72 h from ≈5.5 h before publish. Filters exist **only on publish time** (not startTime).
- **Resolution mismatch:** forecasts are hourly; actuals are half-hourly → align by **hourly mean of the two half-hours** (no invented data; no interpolation).
- **Rate limiting:** 429 documented → ingest must chunk + back off.

## 3. Architecture (approved)

```
ingest.py ──chunked GETs──► Elexon BMRS v1
   ├─ resample actuals 30-min → hourly (mean of 2)
   ├─ label decision revision per delivery day (rule §4)
   ├─ compute MAE / RMSE / MAPE / Bias per day + month
   └─ write data/app.db (SQLite; committed seed CSVs as build fallback)

backend/ FastAPI (Docker → Render free) ──4 read endpoints──┐
                                                            ▼
frontend/ Vite+React+TS (Docker→same pair local; Vercel free)
```

- All math happens **once at ingest**; the API is a thin read layer (cold-start-proof, deterministic demos).
- SQLite (≈1 MB) over Postgres; SQLAlchemy-style clean seam via repository module; simple to swap later.
- Docker: 2 images + `docker-compose.yml`; identical images run on Render.

## 4. Decision-revision rule (approved)

For delivery day **D**:

1. Candidates = revisions published on **D-1** (UK calendar date, times in `Z`) whose `startTime` range **covers all 24 h of D** (00:00 inclusive → next day 00:00 exclusive).
2. Decision revision = **latest candidate with publishTime ≤ 13:00 UTC** (January UK = GMT = UTC; no DST in the window). Rationale: the day-ahead auction gate ≈11:00 and results midday; a 13:00 cutoff includes the ~11:30/12:30 pre-afternoon publishes but excludes evening near-real-time fixes (e.g. 22:30), which would leak information not available at real decision time.
3. Fallbacks, in order: earliest covering revision published **before D-1** (the view already in force at decision time) → earliest covering on **D-1 after 13:00 UTC** (nothing was in force before the gate — the "all hands on deck" number) → `no_decision_forecast` gap flag (never a silent blank). Prefer an earlier in-force view over a post-gate D-1 publish: the latter was not available when the decision was made.
4. Revision scrubber lists **all revisions D-1 00:00 → D 24:00** for that delivery day; decision revision is default-highlighted "auto"; others labelled as time-ahead of delivery start.

## 5. SQLite schema

```sql
actuals_halfhour(t TEXT PRIMARY KEY, mw REAL)        -- FUELHH WIND, half-hourly
actuals_hourly   (t TEXT PRIMARY KEY, mw REAL)       -- mean of the 2 half-hours
forecast_revisions(publish_time TEXT, t TEXT, mw REAL,
                   PRIMARY KEY(publish_time, t))     -- WINDFOR, all revisions
metrics_day(delivery_date TEXT PRIMARY KEY,
            decision_publish_time TEXT,             -- NULL if gap day
            mae REAL, rmse REAL, mape REAL, bias REAL,
            forecast_mean REAL, actual_mean REAL, n_hours INTEGER,
            n_revisions INTEGER, gap_flag TEXT)
metrics_month(month TEXT PRIMARY KEY, mae REAL, rmse REAL, mape REAL, bias REAL,
              n_days INTEGER, n_hours INTEGER)
```

MAPE definition: mean over hours with actual ≥ 1 MW of |error|/actual ×100; excluded-hour count lives in `n_hours`. Metrics are computed for **both** the decision revision (stored) and the month aggregate.

## 6. API contract (FastAPI, JSON, CORS-pinned)

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{status:"ok", ingested_at, day_count}` |
| `GET /api/calendar` | `{days:[{date, gap_flag, n_revisions, decision_publish_time, mae, rmse, mape, bias, forecast_mean, actual_mean}]}` (all Jan-2026 delivery days — drives picker + heatmap) |
| `GET /api/day/{date}?overlay=<publish_time>&revision=<publish_time>` | `{date, gap_flag, decision_publish_time, metrics:{mae,rmse,mape,bias,n_hours,forecast_mean,actual_mean}, revisions:[{publish_time, points:[{t,mw}]}], actuals:[{t,mw}], hourly:[{t, forecast, actual, err, abs_err, pct_err}]}` — `hourly`/`metrics` computed for `revision` if given else decision revision; `revisions` always ALL revisions of that day |
| `GET /api/month` | `{month:{mae,rmse,mape,bias,n_days,n_hours}, days:[{date,mae,rmse,mape,bias}]}` |

Boundary note: stored aggregates cover the **decision revision** and the **month** only. The per-revision `hourly` array on `/api/day` is simple arithmetic (forecast − actual) over already-stored series — cheap, deterministic, and keeps revision-switching instant; it does not open a path to per-revision stored metrics.

Errors: `404` unknown date · `422` bad params · `503` DB missing/unhealthy. Env: `ALLOWED_ORIGINS`, `DB_PATH` (default `data/app.db`).

## 7. Frontend design (approved "C-tuned" workbench)

Vite + React 18 + TypeScript + Recharts; no router; state in URL query (`?date=&rev=&overlay=`) for deep links.

```
┌ top bar: brand | ingest timestamp                                   ┐
│ CONTROL RAIL (left)         MAIN COLUMN                             │
│ · delivery-day picker       · MainChart: hourly wind MW             │
│   (calendar data)             actuals amber / decision cyan (+bold) │
│ · decision-revision chip      / overlay violet dashed; hover deltas │
│   + scrubber chips          · KpiStrip: MAE RMSE MAPE Bias (day)    │
│ · overlay-revision select   · AccuracyStrip:                        │
│ · DAY KPIs (MAE/RMSE/         [signed per-hour error bars]          │
│   MAPE/Bias)                  [Jan day-MAPE calendar heatmap —      │
│ · JANUARY KPIs (MAE/MAPE)      click cell → navigate]               │
└ <1100 px: rail collapses to horizontal bar                          ┘
```

Components: `AppShell` → `ControlRail`, `MainChart`, `KpiStrip`, `AccuracyStrip` (ErrorBars + MonthCalendar), `States` (skeletons / error banner with retry / gap-day chip). Data: single `useApi(path)` hook with abort + retry; **all revisions arrive in the one `/api/day` payload**, so scrubber switching is instant and local.

Palette: base `#0c1222`, panels `#101a30`, lines `#223255`, forecast cyan `#22d3ee`, actuals amber `#f59e0b`, overlay violet, over-forecast red / under-forecast blue in the error strip. Numerals monospace.

## 8. Testing strategy (TDD)

- **pytest** — decision rule edges: Jan-1 (D-1 = Dec 31); 22:30 publish must NOT be picked; no covering revision → gap; fallback chain order. Alignment: 2×30-min→hourly, partial-hour edge. MAPE guard: <1 MW exclusion. Metrics vs hand-computed golden fixtures. API: shapes, 404/422, calendar↔day consistency.
- **vitest + React Testing Library** — KPI formatting, auto-chip highlight, heatmap click navigation, error-retry flow, skeleton rendering.
- **Stretch** — one Playwright happy-path e2e.
- No CI runners (16-h budget): README documents `pytest`, `npm run lint`, `npm test`, `docker compose up`.

## 9. Deployment

- **Vercel (frontend):** root `frontend/`, build `npm run build`, env `VITE_API_BASE=<render URL>`.
- **Render (backend):** Docker web service root `backend/`, free tier, health path `/api/health`, env `ALLOWED_ORIGINS=<vercel domain>`.
- Cold-start (~50 s first request): documented; UI error banner retries gracefully.
- Repo: public, anonymous name (random string), `.superpowers/` ignored.

## 10. Deliverables mapping (brief §3)

| Brief requirement | Where handled |
|---|---|
| Video (≤10 min; 5-min pitch + 5-min tech review) | scripted outlines in `docs/` (plan tasks) |
| Public GitHub repo (anonymous) | created at execution time; README lists files |
| README: files & dirs · how to start · vercel/heroku link | plan task + **explicit AI-tools disclosure** (required) |
| Form + incognito verification | final checklist task |

## 11. Budget (≈15.5 h of 16)

scaffold 1 · ETL+metrics 3.5 · API 2 · FE core 3.5 · FE accuracy strip 2 · deploy+README 1.5 · video outlines 1 · buffer 1.

## 12. Risks

- **Elexon 429/blank publish on some Jan days** → chunked retry + committed seed CSVs keep ingest deterministic.
- **Render cold start in demo** → UI retry banner; record video from local Compose if needed.
- **MAPE blow-ups at near-zero-wind hours** → 1 MW floor + `n_hours` transparency.
- **January actuals gaps** → validated at ingest, surfaced as gap flags in calendar.
