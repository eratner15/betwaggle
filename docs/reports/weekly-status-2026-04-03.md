# Waggle COO Weekly Status — 2026-04-03

## 1) Pricing Audit Status
- Canonical targets: `$32/event` and `$149/season pass`
- `/tour/` legacy `$199` pricing is **not present** in live/source checks.
- Remaining drift is copy normalization (`$149/season` vs `$149/season pass`) across homepage, `/tour/`, `/pricing/`, `/create/`, email templates, and `worker.js` label/prompt text.
- Audit artifact: `docs/reports/pricing-audit-spreadsheet-2026-04-03.csv`

## 2) Demo Health
- Live demo route `/demo/` returns HTTP `200`.
- Regression smoke executed:
  - `node --test tests/simulation.test.js tests/betting.test.js tests/checkout-guard.test.js`
  - Result: `3 passed`, `0 failed`
- Demo watch issues:
  - `BET-129` (critical, in_review)
  - `BET-190` (critical, todo)
- Monitoring artifact: `docs/reports/demo-monitor-2026-04-03.md`

## 3) QA / Bug Coordination
- Open bugs: `13`
- Unassigned bugs: `0`
- Open P0/P1 bugs (`critical` + `high`): `7`
- Bug tracker artifact: `docs/reports/open-bug-tracker-2026-04-03.csv`
- QA coordination artifact: `docs/reports/qa-coordination-tracker-2026-04-03.csv`

## 4) Known Issues Snapshot
- Duplicate affiliate entry point remains (`/affiliate/` -> 301 to `/affiliates/`)
- Legacy public internal-doc routes now blocked (`/marketing/`, `/gtm/`, `/ads/` -> 404)
- Internal content remains exposed at alternate paths:
  - `/marketing-private/` (200)
  - `/gtm-private/` (200)
  - `/ads-private/` (200)
  - `/inventory/` (200)
- Prior 404 list now redirects:
  - `/join/` -> `/create/`
  - `/about/` -> `/overview/`
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` -> `/games/`

## 5) Funnel Metrics
- Email capture appears active, but nurture automation is still not confirmed as sending.
- No authoritative send-rate/open-rate/conversion telemetry was found in this heartbeat context.
- Action needed: expose operational funnel metrics in a single report endpoint or dashboard.

## 6) Page Inventory
- Inventory artifact with purpose, intended visibility, pricing state, and route health:
  - `docs/reports/page-inventory-coo-2026-04-03.csv`
