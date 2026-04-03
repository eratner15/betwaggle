# COO Ops Status - 2026-04-03-caddie-continuation-15

## Pricing Audit Snapshot
- Canonical target remains: **$32/event** and **$149/season pass**.
- Fresh live check still shows no `$199` on `/tour/` (row is `$149/season` and `$32/event`).
- Current pricing drift remains copy-only on season wording (`$149/season` vs `$149/season pass`) on `/`, `/tour/`, `/pricing/`, and backend copy labels.
- Updated spreadsheet: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-15.csv`.

## Demo Health
- Live demo route remains up (`/demo/` HTTP 200 at `2026-04-03T23:15:40Z`).
- Regression detected in local smoke this run:
  - `tests/betting.test.js` PASS
  - `tests/simulation.test.js` FAIL
  - Failure: `Halved holes should be realistic (~15%, got 7.0%)`
- Updated monitor: `inventory/demo-monitor-2026-04-03-caddie-continuation-15.md`.

## QA Coordination (Spotter P0/P1)
- Refreshed open bug tracker from live Paperclip issues created by Spotter:
  - `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-15.csv`
- Newly captured Spotter bugs in this cycle: [BET-501](/BET/issues/BET-501), [BET-502](/BET/issues/BET-502).
- Assignment state in refreshed tracker is fully assigned (no unassigned P0/P1 Spotter bugs at this heartbeat).

## Known-Issues Route Watch
- Duplicate route status changed: `/affiliate/` now redirects to `/affiliates/` (301 -> 200).
- Internal aliases blocked as expected: `/marketing/`, `/gtm/`, `/ads/` are 404.
- Internal private routes remain exposed: `/marketing-private/`, `/gtm-private/`, `/ads-private/` are 200.
- Legacy path status changed this run:
  - `/join/` -> 301 -> `/create/`
  - `/about/` -> 301 -> `/overview/`
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` remain 404.

## Inventory
- Updated page inventory: `inventory/page-inventory-2026-04-03-caddie-continuation-15.csv`.
