# Part 2 — Tech review (≤5 min, unlisted YouTube)

0:00 Architecture: docs/spec diagram — ETL → SQLite → FastAPI (Render/Docker) →
     React (Vercel); JSON contract in docs.
0:45 Ingest: chunked day/window requests (31 + 62), retry/backoff on 429,
     dedupe latest publishTime, committed seed CSVs = offline parity.
1:30 Decision rule: backend/app/etl/decision.py walkthrough + 7 tests covering
     the 13:00 cutoff, late-open hour coverage, fallback chain, Jan-1 edge.
2:15 Metrics: floor rule and hand-computed golden test (test_metrics).
2:45 API: 4 endpoints, CORS pinned, TestClient suite (12 tests), all-revisions
     response design → instantaneous scrubbing in UI.
3:30 Frontend: URL-state deep links, AppShell composition, 18 vitest tests,
     skeleton + error and gap states, responsive rail.
4:15 Practices: TDD commit history, Docker parity local↔Render, plan+spec in docs,
     README AI-tool disclosure.
