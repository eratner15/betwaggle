# COO Ops Status — 2026-04-03 (Mention Follow-up)

Checked at: 2026-04-03 14:14 ET

## Pricing audit summary
- Canonical pricing target used in this pass: `$32/event` and `$149/season pass`.
- New spreadsheet: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-mention.csv`

Findings:
- No `$199` found in audited source targets (homepage, tour, pricing, demo, emails, worker/create pricing strings).
- Event pricing is mostly canonical (`$32/event`) on core pages.
- Remaining copy drift is season wording (`$149/season` instead of `$149/season pass`) across core pages, emails, and worker/create labels.

## Live blockers
- `/tour/` currently returns `307` self-redirect (`Location: /tour/`).
- `/pricing/` currently returns `404` with "Event not found" page.
- Because of these route regressions, full live pricing sign-off is blocked.

## Demo monitoring
- New monitor log: `inventory/demo-monitor-2026-04-03-caddie-mention.md`
- `/demo/` loads (`200`) and pricing copy is canonical.
- Simulation + settlement tests passed in this run.

## QA coordination
- Updated Spotter/P0-P1 tracker: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-mention.csv`
- Continue daily follow-up for blocked QA chain (`BET-38`, `BET-53`, `BET-54`, `BET-60`, `BET-160`, `BET-161`).

## Page inventory
- New page snapshot: `inventory/page-inventory-2026-04-03-caddie-mention.csv`
- Duplicate route still present: `/affiliate/` and `/affiliates/` both live.
- Internal aliases `/marketing/`, `/gtm/`, `/ads/` currently blocked at `404`.
