# Caddie Ops Status — 2026-04-03 (Continuation 6)

## Snapshot
- Time: 2026-04-03 16:16 ET (20:16 UTC)

## Pricing Audit Status
- Core pages (`/`, `/tour/`, `/pricing/`, `/demo/`) remain aligned to canonical pricing: `$32/event` and `$149/season pass`.
- `/tour/` still does **not** reproduce historical `$199` mismatch in current live checks.
- Outstanding inconsistency persists on `/pro/`: copy says `$149 per scramble event`.
- Source-level wording drift remains in some hardcoded strings (`$149/season` vs `$149/season pass`) in `worker.js` and `create/index.html`.

## Demo Health
- `/demo/` returned `200`.
- Demo pricing CTA still `$32/event`.
- Automated smoke tests passed (`simulation`, `betting`, `checkout-guard`; 3/3 pass).
- No immediate demo blocker detected from this checkpoint.

## QA Coordination
- Paperclip totals (active P0/P1):
  - 153 active (29 critical, 124 high)
  - 34 blocked
  - 4 unassigned
- Spotter-created active P0/P1 issues: 77 (exported in continuation-6 CSV).
- Caddie-assigned active items: BET-365 (blocked), BET-420 (backlog), BET-352 (blocked), BET-328 (blocked), BET-296 (blocked), BET-239 (backlog).

## Known-Issue Tracking
- Duplicate pages `/affiliate/` and `/affiliates/`: still both 200.
- Internal routes `/marketing/`, `/gtm/`, `/ads/`: currently 404.
- Legacy 404 set now redirects via 301 (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`).
- Email funnel endpoint currently accepts capture and queues drip; delivery proof still requires downstream verification.

## Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-6.csv`
- `inventory/demo-monitor-2026-04-03-caddie-continuation-6.md`
- `inventory/page-inventory-2026-04-03-caddie-continuation-6.csv`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-6.csv`
