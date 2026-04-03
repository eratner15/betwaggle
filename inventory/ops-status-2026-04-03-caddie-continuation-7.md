# Caddie Ops Status — 2026-04-03 (Continuation 7)

## Snapshot
- Time: 2026-04-03 16:22 ET (20:22 UTC)

## Delta Since Continuation 6
- `/pro/` pricing copy changed: previous "per scramble event" phrasing is no longer present.
- `/pro/` now references `$149/season pass` in primary copy, with residual `$149/season` formula wording.

## Pricing Status
- Core pages (`/`, `/tour/`, `/pricing/`, `/demo/`) remain correct for canonical pricing.
- `/tour/` still does not reproduce historical `$199` mismatch.
- Remaining wording normalization: `$149/season` variants still appear in some source and `/pro/` calculator text.

## Demo + QA Health
- Demo smoke suite still passing (`simulation`, `betting`, `checkout-guard`).
- Active P0/P1 remains 153 (29 critical, 124 high), blocked 34, unassigned 4.

## Known-Issue Tracker
- Duplicate route pair `/affiliate/` and `/affiliates/` still both 200.
- Internal routes `/marketing/`, `/gtm/`, `/ads/` still 404.
- Legacy route set still 301-redirected (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`).

## Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-7.csv`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-7.csv`
