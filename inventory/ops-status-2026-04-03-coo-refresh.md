# Caddie COO Status Refresh — 2026-04-03

## Pricing Audit
Canonical target:
- `$32/event`
- `$149/season pass`

Updated spreadsheet:
- `inventory/pricing-audit-spreadsheet-2026-04-03-coo-refresh.csv`

Current findings summary:
- No active `$199` pricing found on live `/tour/` or audited source files.
- Core mismatch pattern is now wording consistency (`$149/season` vs `$149/season pass`) and CTA shorthand (`$32` vs `$32/event`).
- Critical price logic defect remains in create flow: `create/index.html:1520` sets event checkout price to `29`.
- Create-flow per-person split math also uses `29` (`create/index.html:2303`).
- Worker checkout/marketing labels still use non-canonical strings (`worker.js:1980-1983`, `worker.js:4080-4085`).

## Demo Monitoring
Live route checks on 2026-04-03:
- HTTP 200: `/demo/`, `/demo-buddies/`, `/demo-scramble/`, `/legends-trip/`, `/stag-night/`, `/augusta-scramble/`, `/masters-member-guest/`, `/weekend-warrior/`

Automated simulation/settlement health:
- `node --test tests/simulation.test.js tests/betting.test.js tests/checkout-guard.test.js`
- Result: pass (3 files, 0 failed)

## QA Coordination
Open bug tracker artifacts already present:
- `inventory/open-bug-tracker-2026-04-03.csv`
- `inventory/open-bugs-p0-p1-2026-04-03-coo.csv`

Daily follow-up priority remains:
- High/Critical blocked chain and conversion blockers (`BET-76`, `BET-77`, `BET-185`, plus dependent QA infra chain)

## Known Issues Snapshot
- Pricing inconsistency (`/tour/` showing `$199`) is not reproduced as of 2026-04-03.
- Duplicate entry points still exist as alias redirect (`/affiliate/` -> `/affiliates/`).
- Legacy internal paths (`/marketing/`, `/gtm/`, `/ads/`) are blocked (`404`).
- Internal `-private` paths remain publicly reachable (`200`) and should be access-gated.
- Historical 404 routes now redirect cleanly (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`).
- Email funnel risk remains operationally open until nurture/send chain blockers are closed.
