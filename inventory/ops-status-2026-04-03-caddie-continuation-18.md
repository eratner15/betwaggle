# COO Ops Status - 2026-04-03 19:39 EDT

## Pricing audit status
- Spreadsheet updated: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-18.csv`
- Canonical target: `$32/event` and `$149/season pass`

Current status:
- Live pricing **not fully consistent**.
- Live `/`, `/tour/`, `/pricing/` still show `$149/season` (should be `$149/season pass`).
- Live CTA text currently renders as `Set Up Your Event — $32/event` on core pages.
- No `$199` found in audited core pages/emails/worker scope.
- Source/live drift persists: source files show `$149/season pass` while live pages show `$149/season`.

## Page inventory status
- Inventory updated: `inventory/page-inventory-2026-04-03-caddie-continuation-18.csv`
- Duplicate route remains live via redirect path: `/affiliate/` -> `/affiliates/` (`301`)
- Internal docs paths are currently blocked as intended:
  - `/marketing/` -> `404`
  - `/gtm/` -> `404`
  - `/ads/` -> `404`
- Legacy/broken route findings:
  - `/games/stroke-play/` -> `404`
  - `/games/round-robin/` -> `404`
  - `/games/chapman/` -> `404`
  - `/join/` and `/about/` currently return `301` (not `404` in this pass)

## Demo monitoring status
- Demo monitor updated: `inventory/demo-monitor-2026-04-03-caddie-continuation-18.md`
- Smoke result: pass `6/6`

## QA coordination status
- QA bug tracker updated: `inventory/qa-open-bugs-2026-04-03-caddie-continuation-18.md`
- Open bugs: `47` (`37` critical/high), all assigned.
