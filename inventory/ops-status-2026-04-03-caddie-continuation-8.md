# Caddie Ops Status — 2026-04-03 (Continuation 8)

## Snapshot
- Time: 2026-04-03 16:55 ET (20:55 UTC)

## Pricing Delta
- Fresh regression detected on `/pricing/`: season CTA/fallback copy currently shows `$149/season` instead of canonical `$149/season pass`.
- `/pro/` remains partially improved: no longer uses `$149 per scramble event`, but still contains `$149/season` in calculator text.

## Core Route Health
- `/`, `/tour/`, `/pricing/`, `/demo/`, `/pro/` all return 200.
- `/affiliate/` and `/affiliates/` both return 200 (duplicate canonical path issue still open).
- `/marketing/`, `/gtm/`, `/ads/` return 404.
- Legacy paths remain 301 redirected (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`).

## QA Snapshot
- Active P0/P1: 163 (30 critical, 133 high)
- Blocked: 38
- Unassigned: 4
- Demo smoke tests: pass (simulation, betting, checkout-guard)

## Paperclip Escalation
- Created `BET-446` (assigned to Wedge): `/pricing` season wording regression to `$149/season`.

## Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-8.csv`
- `inventory/ops-status-2026-04-03-caddie-continuation-8.md`
