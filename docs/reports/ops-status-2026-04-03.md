# Waggle COO Ops Status — 2026-04-03

## Pricing Audit
- Canonical pricing validated as: **$32/event** and **$149/season pass**
- Core pages checked and currently consistent: `/`, `/tour/`, `/pricing/`, `/demo/`
- Legacy price hardcodes found in code paths using `29` instead of `32`:
  - `create/index.html:1470`
  - `create/index.html:2253`
  - `worker.js:3031`
  - `worker.js:3073`
  - `worker.js:3224`
  - `worker.js:4738`
- Detailed spreadsheet: `pricing-audit-2026-04-03.csv`

## Demo Monitoring (today)
- `/demo/` returns `200`
- Demo cards return `200`: `/cards/skins/`, `/cards/nassau/`, `/cards/wolf/`, `/cards/match-play/`, `/cards/scramble/`
- Demo slugs return `200`: `/demo-skins/`, `/demo-nassau/`, `/demo-wolf/`, `/demo-match-play/`, `/demo-scramble/`
- CLI checks confirm route health; full interactive simulate/settle regression still requires Spotter browser QA.

## QA Coordination Snapshot
- Spotter open queue exists and is fully assigned (no unassigned Spotter issues).
- P0/P1 tracker snapshot: `qa-p0-p1-snapshot-2026-04-03.csv`
- New follow-up issues opened from this audit:
  - `BET-132` (critical): fix legacy `$29` hardcodes
  - `BET-133` (high): normalize outreach/email `$149` season-pass language

## Known Issues Status
- `/tour/` pricing inconsistency (`$199`) appears resolved in current source/live checks.
- Duplicate routes still exist: `/affiliate/` and `/affiliates/`.
- Internal docs exposure partially mitigated:
  - blocked: `/marketing/`, `/gtm/`, `/ads/` (404)
  - still exposed: `/marketing-private/`, `/gtm-private/`, `/ads-private/` (200)
- Historical 404 list now mostly redirects:
  - `/join/` -> `301 /create/`
  - `/about/` -> `301 /overview/`
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` -> `301 /games/`

## Funnel Health
- `POST /api/email-capture` responds `200 {"ok":true}` in production.
- Delivery verification still pending (requires Resend event/log confirmation path).
