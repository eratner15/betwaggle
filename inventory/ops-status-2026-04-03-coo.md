# Waggle COO Ops Status — 2026-04-03

## Pricing Audit
- Canonical target: `$32/event` and `$149/season pass`
- Audit artifact: `inventory/pricing-audit-spreadsheet-2026-04-03-coo.csv`
- Result summary:
  - `copy_mismatch`: 12
  - `incorrect`: 1
  - `correct`: 6

### Critical observations
- Live `/tour/` does **not** show legacy `$199` in current check (2026-04-03).
- Main drift is wording normalization:
  - `$32` shorthand in CTA labels should be `$32/event`
  - `$149/season` should be `$149/season pass`
- Source still contains legacy `$29` in create flow paths (tracked by active issues).

## Demo Monitoring
- Live route health check (2026-04-03):
  - `/demo/` 200
  - `/demo-buddies/` 200
  - `/demo-scramble/` 200
  - `/legends-trip/` 200
  - `/stag-night/` 200
  - `/augusta-scramble/` 200
  - `/masters-member-guest/` 200
  - `/weekend-warrior/` 200
- Demo bundle endpoints (`.../js/app.js`) return 200 on sampled demo pages.
- Functional simulation/settlement behavior still requires active QA execution in browser (tracked under QA stream).

## QA Coordination Snapshot (Paperclip)
- Open P0/P1 bugs: `84`
  - `critical`: 12
  - `high`: 72
- Unassigned P0/P1: `3`
- Spotter-assigned open issues: `23`
- Artifact: `inventory/open-bugs-p0-p1-2026-04-03-coo.csv`

## Known-Issue Status Check
- Duplicate route pair still present: `/affiliate/` (301) and `/affiliates/` (200)
- Internal docs exposure check:
  - `/marketing/` 404
  - `/gtm/` 404
  - `/ads/` 404
  - `*-private` directories still exist in source
- Legacy 404 list now redirects to canonical pages:
  - `/join/` -> `/create/`
  - `/about/` -> `/overview/`
  - `/games/stroke-play/` -> `/games/`
  - `/games/round-robin/` -> `/games/`
  - `/games/chapman/` -> `/games/`

## Paperclip Updates Sent
- Completed and closed: [BET-264](/BET/issues/BET-264)
- Posted QA-facing review note: [BET-38](/BET/issues/BET-38)
