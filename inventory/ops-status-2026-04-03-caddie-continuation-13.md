# COO Ops Status - 2026-04-03-caddie-continuation-13

## Pricing Audit Snapshot
- Canonical target remains: **$32/event** and **$149/season pass**.
- Fresh run shows **no $199** pricing on core public pages.
- Core drift now centers on wording consistency: `$149/season` still appears on `/`, `/tour/`, `/pricing/`, `/create/`, `/b/`, and in `worker.js` labels/prompts.
- Pricing audit spreadsheet updated: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-13.csv`.

## Demo Health
- Live demo route: **200** at 2026-04-03T21:23:25Z.
- Local verification: `tests/simulation.test.js` + `tests/betting.test.js` both passed.
- Demo monitor log updated: `inventory/demo-monitor-2026-04-03-caddie-continuation-13.md`.

## QA Coordination (Spotter P0/P1)
- Refreshed tracker: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-13.csv`.
- Use tracker as source of truth for assigned vs unassigned, with daily follow-up tags.
- Current blocker cluster is settlement/zero-sum + mobile QA infra in high/critical queue.

## Known Issues Watchlist
- Duplicate affiliate entry points still live: `/affiliate/` and `/affiliates/` both return 200.
- Internal aliases are blocked as expected: `/marketing/`, `/gtm/`, `/ads/` all 404.
- Internal private pages remain publicly reachable: `/marketing-private/`, `/gtm-private/`, `/ads-private/` all 200.
- Known legacy paths are now redirects (not hard 404):
  - `/join/` -> `/register/`
  - `/about/` -> `/tour/`
  - `/games/stroke-play/` -> `/games/match-play/`
  - `/games/round-robin/` -> `/games/nassau/`
  - `/games/chapman/` -> `/games/best-ball/`

## Inventory
- Updated page inventory: `inventory/page-inventory-2026-04-03-caddie-continuation-13.csv`.
