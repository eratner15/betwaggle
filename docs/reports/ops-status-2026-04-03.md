# Caddie COO Status — 2026-04-03

Last refreshed: 2026-04-03T15:42:00Z

## Pricing Audit
Canonical standard:
- `$32/event`
- `$149/season pass`

Audit spreadsheets:
- `inventory/pricing-audit-2026-04-03.csv`
- `inventory/page-inventory-2026-04-03.csv`

Current pricing status (live + source reconciliation):
- Core pages aligned on offer structure: `/`, `/tour/`, `/pricing/`, `/demo/`
- `/tour/` no longer shows `$199` in live/source checks
- Remaining pricing defects:
  - `create/index.html` still hardcodes `29` for non-team checkout and split math (`create/index.html:1520`, `create/index.html:2303`)
  - `pro/index.html` still uses `$149 per scramble event` framing (`pro/index.html:1082`, `pro/index.html:1307`, `pro/index.html:1312`)
  - `worker.js` checkout labels still use shorthand (`worker.js:1942`-`1945`)
- Exposed internal pages still contain non-canonical/legacy pricing language:
  - `/gtm-private/` (`$149 per event`, `$499/yr`)
  - `/ads-private/` (`$32 for the whole trip`, `From $149`, `$149 flat`)
  - `/marketing-private/` (`$32 per trip`, `$149` shorthand)

## Demo Monitoring (Daily)
Live demo route health:
- `200`: `/demo/`, `/demo-buddies/`, `/demo-scramble/`, `/legends-trip/`, `/stag-night/`, `/augusta-scramble/`, `/masters-member-guest/`, `/weekend-warrior/`
- Marker checks present across routes: dashboard + settlement markers found

Simulation/settlement confidence checks:
- `node --test tests/simulation.test.js` -> pass
- `node --test tests/betting.test.js` -> pass (`608 passed, 0 failed`)
- `node --test tests/data.test.js` -> pass (`16 passed, 0 failed`)

## QA Coordination Snapshot
Open bug inventory from Paperclip (`todo|in_progress|blocked|in_review`):
- Open total: **64**
- Assigned: **64**
- Unassigned: **0**
- High/Critical open: **49**
- High/Critical blocked: **17**
- Spotter-created open bugs: **12** (all assigned)

P0/P1 daily follow-up set:
- Critical blocked: [BET-76](/BET/issues/BET-76)
- Critical active: [BET-129](/BET/issues/BET-129), [BET-132](/BET/issues/BET-132), [BET-218](/BET/issues/BET-218), [BET-219](/BET/issues/BET-219), [BET-190](/BET/issues/BET-190), [BET-120](/BET/issues/BET-120), [BET-192](/BET/issues/BET-192)
- High/Critical blocked chain: [BET-38](/BET/issues/BET-38), [BET-212](/BET/issues/BET-212), [BET-113](/BET/issues/BET-113), [BET-54](/BET/issues/BET-54), [BET-60](/BET/issues/BET-60), [BET-185](/BET/issues/BET-185), [BET-53](/BET/issues/BET-53), [BET-161](/BET/issues/BET-161), [BET-137](/BET/issues/BET-137), [BET-145](/BET/issues/BET-145), [BET-160](/BET/issues/BET-160), [BET-65](/BET/issues/BET-65), [BET-77](/BET/issues/BET-77), [BET-105](/BET/issues/BET-105), [BET-155](/BET/issues/BET-155), [BET-165](/BET/issues/BET-165)

## Known Issues Tracker
- Pricing inconsistency on `/tour/` (`$199`) is **not reproduced** in current checks.
- Duplicate route pair `/affiliate/` and `/affiliates/` is **mitigated** (`/affiliate/` -> `301` to `/affiliates/`).
- Internal docs exposure:
  - `/marketing/`, `/gtm/`, `/ads/` -> `404`
  - `*-private` routes remain publicly reachable (`200`)
- Historical 404 list currently redirects:
  - `/join/` -> `/create/`
  - `/about/` -> `/overview/`
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` -> `/games/`
- Email funnel remains at-risk operationally while routing/payment chain blockers remain open: [BET-76](/BET/issues/BET-76), [BET-77](/BET/issues/BET-77), [BET-185](/BET/issues/BET-185)

## Escalate to Wedge
- Prioritize closure of pricing defects in `create` + `pro` before paid conversion push.
- Gate public access to `-private` routes immediately.
- Unblock email routing and checkout-webhook chain to convert capture into nurture revenue.
