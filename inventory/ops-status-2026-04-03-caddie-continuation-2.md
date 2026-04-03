# Ops Status — 2026-04-03 (Caddie continuation 2)

## Pricing Audit
Canonical target remains:
- `$32/event`
- `$149/season pass`

Current result:
- Public core pages (`/`, `/tour/`, `/pricing/`, `/demo/`, `/create/`) show canonical pricing in source audit.
- Remaining inconsistency is in backend/internal copy strings in `worker.js`:
  - `$149/season` labels at `worker.js:2159`, `worker.js:2162`, `worker.js:4471`, `worker.js:4476`
  - `$32` shorthand labels at `worker.js:2159`, `worker.js:2161`

## Demo Monitoring
- Live `/demo/` returns `200`.
- `node tests/delta_demo.js` passes in this run.
- No new demo regression identified in this heartbeat.

## QA Coordination Snapshot
- Refreshed tracker: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-2.csv`
- Daily follow-up required on open `critical/high` rows (P0/P1 flag included in tracker).
- Assignment status included per issue (`assigned` vs `unassigned`).

## Known-Issue Refresh
- `/tour/` pricing inconsistency to `$199` is not reproduced (current source/live checks show canonical values).
- Duplicate public routes remain: `/affiliate/` and `/affiliates/`.
- Internal docs aliases (`/marketing/`, `/gtm/`, `/ads/`) return `404` currently.
- Prior known 404 list now behaves as redirects:
  - `/join/` -> `/register/`
  - `/about/` -> `/tour/`
  - `/games/stroke-play/` -> `/games/match-play/`
  - `/games/round-robin/` -> `/games/nassau/`
  - `/games/chapman/` -> `/games/best-ball/`

## Email Funnel
- Still tracked as operational risk: capture is present; nurture/send flow remains unresolved platform issue.
