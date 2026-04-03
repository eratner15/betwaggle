# Ops Status — 2026-04-03 (Caddie heartbeat)

Checked at: 2026-04-03 14:03 ET

## Canonical Pricing
- Event: `$32/event`
- Season: `$149/season pass`

## Pricing Audit Snapshot
- Refreshed spreadsheet: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-heartbeat.csv`
- Core drift remains wording consistency (`$149/season` vs `$149/season pass`) across homepage, tour table row, pricing source, create source, worker labels, and email templates.
- Legacy `$199` on `/tour/` was **not** observed in source checks.

## Route Health (Live)
- `/`: `200`
- `/demo/`: `200`
- `/tour/`: `307` self-redirect loop (active regression)
- `/pricing/`: `404` (active regression)
- `/affiliate/`: `301 -> /affiliates/` (duplicate entrypoint still present)
- `/marketing/`, `/gtm/`, `/ads/`: `404` (currently blocked from public)
- `/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`: now redirect to supported pages (not hard 404)

## Demo Monitoring
- `/demo/` reachable (`HTTP/2 200`)
- `node tests/delta_demo.js` passed (simulation/odds-delta harness)
- Demo monitor file refreshed: `inventory/demo-monitor-2026-04-03-caddie-heartbeat.md`

## Spotter Bug Queue
- Open Spotter bug items (title contains `Bug:`): `20`
- `P0`: `6`
- `P1`: `8`
- Assigned: `20`, Unassigned: `0`
- Tracker refreshed: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-heartbeat.csv`

## Immediate Escalations to Wedge
- `BET-341` — `/tour/` infinite 307 redirect loop (P0)
- `BET-342` — `/pricing/` returns 404 (P0)
- `BET-343` — Homepage `/cards/*` links 404 (P1)
