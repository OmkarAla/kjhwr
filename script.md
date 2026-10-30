# GB Wind Day-Ahead Portal — Video Script

**Deliverable:** one unlisted YouTube video, maximum 10 minutes  
**Structure:** Part 1 client pitch (0:00–4:50), Part 2 technical review (4:50–9:40)  
**Audience:** Part 1 is for the UK utility's day-ahead trading desk; Part 2 is for the internal technical lead.

> Replace `<APP_URL>` with the deployed application URL before recording. If the deployment is not ready, rehearse against `http://localhost:8080`; do not claim that a local URL is publicly accessible.

## Before recording

1. Start the application and verify the data snapshot:

   ```bash
   docker compose up --build -d
   curl http://localhost:8000/api/health
   ```

   The health response should report `status: "ok"` and `day_count: 31`.

2. Open `<APP_URL>/?date=2026-01-27` in a clean browser window. Confirm that the day loads, the decision revision is `11:30 · D-1 · auto`, and the rail says `32 revisions · decision 11:30`.
3. Prepare a second tab with `<APP_URL>/?date=2026-01-27&rev2=2026-01-26T22%3A30%3A00Z`. This preselects the 22:30 D-1 overlay and avoids ambiguity between repeated time labels in the overlay dropdown.
4. For Part 2, prepare tabs for `backend/app/etl/decision.py`, `backend/app/etl/ingest.py`, `backend/app/api/main.py`, and `frontend/src/hooks/useApi.ts`. Increase the editor font size enough for video.
5. Record at 1920×1080, browser zoom 90–100%, with notifications disabled. Keep the mouse still while speaking except for the actions marked below.
6. The figures in this script come from the committed January 2026 snapshot: 31 delivery days, 744 scored hours, 256 forecast revisions, and no gap days. Re-check any figure that is regenerated from a newer data pull.

---

# Part 1 — Client pitch

## 0:00–0:30 — The commercial problem

**Screen:** Portal open on 27 January; briefly show the full page.

**Say:**

> When your desk buys tomorrow's power, the uncertain part is wind. If the forecast promises more wind than actually arrives, you buy too little in the day-ahead market and have to cover the shortfall later, usually on worse terms. This portal answers two questions for every delivery day: what forecast could you actually use when the decision had to be made, and how wrong was that forecast in units you can trade against?

## 0:30–1:20 — The forecast available at decision time

**Screen:** Point to the delivery-day picker, then the decision revision and the main chart.

**Say:**

> Here is Tuesday 27 January. The portal automatically selects the forecast issued at 11:30 on 26 January—the latest full-day revision available before our modelled 13:00 day-ahead cut-off. This distinction matters: we are not showing the best forecast in hindsight, and we are not using information published after the decision was locked.
>
> The grey line is actual national wind generation. The teal line is that decision-time forecast. You can see immediately that the forecast sits above actual generation for the whole day. The day scored 22.26% MAPE, with a mean absolute error of 3.54 gigawatts.

## 1:20–2:05 — Compare vintages without look-ahead bias

**Screen:** Switch to the prepared tab with the 22:30 D-1 overlay. Point to the dashed purple line, then return to the decision-revision label.

**Say:**

> Every vintage is retained, so we can inspect how the forecast evolved. This dashed line is the 22:30 revision from the same evening. It moves closer to actual generation, which is useful for understanding forecast convergence—but it was not available at 13:00, so it is not allowed to redefine the original decision.
>
> That is the core control in this product: revisions can be explored freely, while the default accuracy figure remains tied to the information set the desk genuinely had.

## 2:05–2:45 — Turn error into an operating signal

**Screen:** Scroll to **Signed error by hour**; hover over the 23:00 bar.

**Say:**

> The hourly strip converts the gap into signed megawatts. Positive means forecast minus actual is positive: more wind was promised than delivered. At 23:00, for example, the over-forecast is about 6.16 gigawatts, or 53.7%.
>
> For the desk, that is not just a chart colour. It is hour-by-hour evidence of where a day-ahead position would have been short, and where additional procurement or reserve would have been needed.

## 2:45–3:35 — Find the risky days across the month

**Screen:** Show the daily MAPE calendar. Hover over 8 January, 28 January, and 20 January; click 8 January, then return to 27 January if useful.

**Say:**

> The calendar gives the same view across January. Eight January is the worst percentage-error day at 54.1%; 28 January is close behind at 52.6%. Twenty January is the best at 6.4%.
>
> The percentage and megawatt views are deliberately both present. A high percentage on a low-wind day is not automatically the largest commercial exposure, so the desk can move from this calendar directly into the hourly MW detail rather than ranking days by one metric alone.

## 3:35–4:15 — The month-level finding

**Screen:** Show the January KPI values in the rail and the month calendar together.

**Say:**

> Across all 31 days and 744 hours, mean absolute error is 2.02 gigawatts, RMSE is 2.19 gigawatts, and MAPE is 19.72%. The most important number is bias: plus 1.81 gigawatts.
>
> Because bias is almost as large as mean absolute error, this is not mainly random error cancelling out around zero. January's decision-time forecasts persistently over-predicted wind. That is a systematic exposure the desk can investigate and allow for, rather than noise it simply has to accept.

## 4:15–4:50 — Trust and close

**Screen:** Open the glossary briefly, close it, then show the URL with `date=2026-01-27`.

**Say:**

> Everything here is derived only from Elexon BMRS: FUELHH for actual wind generation and WINDFOR for every forecast revision. The pilot ships with a reproducible January snapshot, plain-English definitions in the glossary, and shareable URLs that restore the exact day and revisions.
>
> The result is a defensible calibration tool: it shows what you knew at the day-ahead decision, quantifies the error, and exposes the systematic over-forecast that should shape the next procurement review.

---

# Part 2 — Technical review

## 4:50–5:20 — Architecture

**Screen:** Show the README project layout or a simple editor split with `docker-compose.yml`, then the running UI.

**Say:**

> The application is a read-only analytical pipeline. Elexon data passes through a Python ETL into SQLite, and FastAPI exposes four JSON endpoints. The frontend is React 19, TypeScript, Vite and Recharts. Docker Compose runs the API and an nginx-served frontend; deployment targets Render for the container and Vercel for the SPA.
>
> Metrics are computed at build time, so the UI reads compact day and month rows instead of scanning the revision history on every page load.

## 5:20–6:05 — Ingestion and alignment

**Screen:** Open `backend/app/etl/ingest.py`, then `backend/app/etl/align.py`.

**Say:**

> Ingestion pulls FUELHH one delivery day at a time and WINDFOR in 12-hour publish-time windows. Requests have timeouts and retries with backoff; deduplication absorbs overlapping windows.
>
> Actuals have two traps: FUELHH is half-hourly while forecasts are hourly, and actuals are revised. We keep only the latest publish time per start time, then average the two half-hours in each clock hour. Forecasts use the composite key publish time plus start time, preserving every vintage.
>
> The committed seed CSVs run through the same pipeline offline, making fresh Docker builds reproducible.

## 6:05–6:55 — Decision-revision rule

**Screen:** Open `backend/app/etl/decision.py`; highlight `covering_candidates`, `CUTOFF`, and `decision_revision`.

**Say:**

> This is the most important module. First, a candidate must cover the entire delivery day, from hour zero through hour 23. Partial revisions are not valid for a full-day decision.
>
> Second, we keep revisions published on D-1 at or before 13:00 UTC and choose the latest. If none exists, the fallback is the earliest covering revision already in force before D-1, then the earliest late covering revision on D-1. Only if all of those fail do we record a gap day.
>
> The rule selects 11:30 on D-1 for every January day. Tests pin the cut-off, coverage requirement, fallbacks and no-forecast case, so the anti-look-ahead behaviour is executable, not just documented.

## 6:55–7:35 — Metrics and storage

**Screen:** Open `backend/app/etl/metrics.py` and `backend/app/db.py`.

**Say:**

> For each scored hour, error is forecast minus actual. We compute MAE, RMSE, MAPE and signed bias only where both series exist and actual generation is at least one megawatt. That floor stops near-zero actuals from exploding percentage errors; `n_hours` records how many hours contributed.
>
> SQLite stores hourly actuals, all revision points, daily metrics and one month row. Month values are hour-weighted means of daily values. Month RMSE is disclosed as an approximation—it averages daily RMSEs rather than pooling all 744 squared residuals.
>
> With 18,688 revision points and 744 hourly actuals, a single-file read store fits this pilot.

## 7:35–8:15 — API contract

**Screen:** Open `backend/app/api/main.py`; optionally show `/api/health` JSON in the browser.

**Say:**

> The API has health, calendar, day and month endpoints. The day response includes the selected metrics and hourly errors plus every revision touching that day. That larger payload makes revision scrubbing and overlays instant client-side operations.
>
> An unknown day returns 404; an unavailable revision returns 422, and the UI recovers by returning to auto. CORS origins come from `ALLOWED_ORIGINS`, and the API exposes only GET endpoints.

## 8:15–8:55 — Frontend state and resilience

**Screen:** Open `frontend/src/components/AppShell.tsx` and `frontend/src/hooks/useApi.ts`, then click two revisions in the running UI.

**Say:**

> `AppShell` owns only three pieces of view state: date, selected revision and overlay revision. It mirrors them into the URL as `date`, `rev` and `rev2`, so every view is reload-safe and shareable.
>
> `useApi` debounces rapid changes by 150 milliseconds, aborts superseded requests, and prevents older responses from overwriting newer state. Rendering is gated during refetch to avoid stale KPI flashes.
>
> The rail handles selection; the chart labels decision versus selected revisions and partial coverage; the accuracy strip combines hourly error with the month calendar.

## 8:55–9:40 — Verification, practices and limits

**Screen:** Show the test commands and results, then finish on the README.

**Say:**

> Verification is 36 passing pytest tests and 25 passing Vitest tests, plus linting and a production build. Coverage includes alignment, decision logic, metric edge cases, API contracts, seed filtering, URL state and request cancellation.
>
> The build is idempotent and fails if fewer than 28 January days score instead of shipping an empty app. The backend image builds the database from seed data and copies it into the mounted directory only when none exists, so a fresh clone works offline.
>
> Limits are explicit: one month, GB wind only, a modelled cut-off, approximate month RMSE, and SQLite for a read-only pilot. Production would add scheduled ingestion, Postgres, broader coverage and procurement integration. The README contains the runbook, data rules and AI-tools disclosure.

---

## Optional cut lines if recording runs long

- Part 1: shorten the 8/28/20 January comparison to only 8 January and 20 January.
- Part 1: omit the exact 23:00 hourly figure; keep the explanation of positive error.
- Part 2: omit the exact revision-point count and the detailed fallback-chain wording, but keep the 13:00 rule and full-day coverage requirement.
- Part 2: reduce the frontend component inventory to `AppShell`, `useApi`, and the chart.

## Final publishing checks

- Keep the finished video at or below 10:00; neither part should exceed 5:00.
- Upload as **unlisted**, not private, so the submission reviewers can open it.
- Add the repository URL and deployed app URL to the video description.
- Open the video, repository, and deployed app in incognito windows before submitting them.
- Confirm the README contains the live app URL once deployment is complete.
