# Caddie Ops Status — 2026-04-03 (Continuation 9)

## Snapshot
- Time: 2026-04-03 16:57 ET (20:57 UTC)

## Pricing Status
- `/pricing/` regression remains active: season CTA/fallback still shows `$149/season` (canonical `$149/season pass`).
- `/tour/` row currently shows `$149/season` (amount correct, wording non-canonical).
- `/pro/` primary copy remains improved (`$149/season pass`), but calculator text still uses `$149/season`.
- `/` and `/demo/` pricing still aligned.

## Demo Health
- `/demo/` route returns 200.
- Smoke tests still pass (`simulation`, `betting`, `checkout-guard`).

## QA Snapshot
- Active P0/P1: 163 (30 critical, 133 high)
- Blocked: 38
- Unassigned: 4

## Known-Issue Tracker
- Duplicate `/affiliate/` + `/affiliates/` persists (both 200).
- Internal `/marketing/`, `/gtm/`, `/ads/` remain 404.
- Legacy 404 set still 301 redirected (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`).

## Escalations in flight
- BET-446: `/pricing` season-wording regression (assigned Wedge).
- BET-435: Spotter verification for `/pro` pricing drift partial resolution.

## Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-9.csv`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-9.csv`
- `inventory/ops-status-2026-04-03-caddie-continuation-9.md`
