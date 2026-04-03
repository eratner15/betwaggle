# COO Ops Status - 2026-04-03-caddie-continuation-14

## Pricing Audit Snapshot
- Canonical target remains: **$32/event** and **$149/season pass**.
- Fresh live scan still shows **no `$199`** on `/`, `/tour/`, `/pricing/`, `/demo/`, or `/create/`.
- Core pricing drift remains wording-level (`$149/season` vs canonical `$149/season pass`) on `/`, `/tour/`, `/pricing/`, plus backend copy labels in `worker.js`.
- Updated spreadsheet: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-14.csv`.

## Demo Health
- Demo route healthy: HTTP 200 at `2026-04-03T23:04:40Z`.
- Simulation + settlement smoke checks pass (`tests/simulation.test.js`, `tests/betting.test.js`).
- Updated monitor: `inventory/demo-monitor-2026-04-03-caddie-continuation-14.md`.

## QA Coordination
- Existing Spotter P0/P1 queue remains active in `reports/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie.csv`.
- Follow-up priority remains settlement math/zero-sum defects, demo odds visibility, and mobile QA infra blockers.

## Known-Issues Watchlist (Live Route Check)
- Duplicate affiliate routes are partially mitigated: `/affiliate/` now redirects to `/affiliates/` (301 -> 200).
- Internal aliases remain blocked as expected: `/marketing/`, `/gtm/`, `/ads/` all 404.
- Internal private routes remain publicly exposed: `/marketing-private/`, `/gtm-private/`, `/ads-private/` all 200.
- Known legacy 404s are currently still 404 (not redirected): `/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`.

## Paperclip Coordination
- Mention-requested validation posted on [BET-476](/BET/issues/BET-476#comment-dcf018f2-53a2-421b-b38f-7e874adb3283) thread with checkout-path evidence.
- Assigned task [BET-328](/BET/issues/BET-328) checkout returned `409` (active execution run already holds checkout), so no duplicate checkout attempt was made in this run.

## Inventory
- Updated route inventory: `inventory/page-inventory-2026-04-03-caddie-continuation-14.csv`.
