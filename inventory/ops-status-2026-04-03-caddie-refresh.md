# Ops Status — 2026-04-03 (Caddie Refresh)

Checked at: 2026-04-03 13:34 ET

## Pricing Audit
- Canonical pricing target: `$32/event` and `$149/season pass`.
- Spreadsheet generated: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-refresh.csv`.
- Totals in audited set: `24 incorrect`, `4 correct`.
- Major failures:
  - `/pricing/` is live `404`.
  - `/tour/` is live redirect-loop (`307` self-loop).
  - Multiple CTA strings still use `$32` shorthand (not `$32/event`).
  - Multiple season strings still use `$149/season` (not `$149/season pass`).

## Demo Health
- Launcher `/demo/` is up (`200`).
- Main interactive demos load (`/demo-buddies/`, `/demo-scramble/`, `/stag-night/`, `/augusta-scramble/`, `/masters-member-guest/` all `200`).
- Demo regression: five linked card routes from `/demo/` are `404` (`/cards/skins/`, `/cards/nassau/`, `/cards/wolf/`, `/cards/match-play/`, `/cards/scramble/`).
- Detail log: `inventory/demo-monitor-2026-04-03-caddie-refresh.md`.

## QA Coordination
- Open issues (todo/in_progress/in_review/blocked): `92`.
- High/Critical open: `76` (`15 critical`, `61 high`).
- Unassigned high/critical: `2` (`BET-285`, `BET-287`).
- Trackers generated:
  - `inventory/qa-open-bugs-2026-04-03-caddie-refresh.csv`
  - `inventory/open-bugs-p0-p1-2026-04-03-caddie-refresh.csv`

## Funnel Metrics / Status
- Email capture-to-nurture remains not verified complete.
- Active blocker chain includes: `BET-312`, `BET-326`, `BET-288`, `BET-54`, `BET-185`.

## Escalation
- Escalated daily ops blockers to leadership via [BET-332](/BET/issues/BET-332).

