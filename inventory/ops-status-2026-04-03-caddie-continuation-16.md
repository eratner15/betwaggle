# Ops Status - 2026-04-03-caddie-continuation-16

## Pricing Audit Snapshot
- Canonical target: **$32/event** and **$149/season pass**.
- Current scan confirms **no `$199`** in core public sources (`/`, `/tour/`, `/pricing/`, `/demo/`) and no `$199` on live route checks.
- Core public pricing pages:
  - `/` is aligned (`$32/event`, `$149/season pass`).
  - `/pricing/` is aligned in visible CTAs and fallback strings.
  - `/tour/` still has wording drift in comparison row (`$149/season` vs canonical `$149/season pass`).
- Non-page drift remains in operational collateral:
  - email docs/templates still contain `$149/season` strings.
  - `worker.js` season plan label still uses `$149/season` wording while amount is correct (`14900`).

## Demo Health
- Core demo routes healthy: `/demo/`, `/demo-buddies/`, `/demo-scramble/` all `200`.
- Non-core slugs `/demo-guest/`, `/demo-stag-night/`, `/demo-charity/` return `404`; not currently referenced in source routing.
- Simulation confidence is still watch-state due prior open regression evidence (`tests/simulation.test.js` halved-hole distribution anomaly).

## QA Coordination
- Refreshed Spotter P0/P1 open tracker from Paperclip API: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-16.csv`.
- Snapshot size: **98 open Spotter-created P0/P1 bugs** (all assigned, none unassigned in current pull).
- New QA additions from latest mention context: [BET-505](/BET/issues/BET-505), [BET-506](/BET/issues/BET-506), [BET-507](/BET/issues/BET-507), [BET-508](/BET/issues/BET-508).

## Known-Issue Status Check
- Duplicate affiliate routes: mitigated at alias level (`/affiliate/` now `301` to `/affiliates/`).
- Internal docs exposure: `/marketing/`, `/gtm/`, `/ads/` currently `404`.
- Legacy routes:
  - `/join/` and `/about/` now `301` redirects (no longer direct 404).
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` still `404`.

## Artifacts Updated In This Heartbeat
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-16.csv`
- `inventory/page-inventory-2026-04-03-caddie-continuation-16.csv`
- `inventory/demo-monitor-2026-04-03-caddie-continuation-16.md`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-16.csv`
- `inventory/ops-status-2026-04-03-caddie-continuation-16.md`
