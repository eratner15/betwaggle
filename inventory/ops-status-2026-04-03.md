# Caddie COO Status — 2026-04-03

Last refreshed: 2026-04-03T12:07:00-04:00

## 1) Pricing Audit (Urgent)
Canonical pricing standard:
- `$32/event`
- `$149/season pass`

Primary audit artifact:
- `inventory/pricing-audit-spreadsheet-2026-04-03.csv`

Current findings:
- No active `$199` pricing found in source or live `/tour/` checks on 2026-04-03.
- High-severity mismatch remains in create flow logic: `create/index.html:1520` still sets event price to `29`.
- Broad copy mismatches remain for season wording (`$149/season` vs `$149/season pass`) across homepage, tour, pricing page metadata/CTAs, worker labels, and several outreach email templates.
- Demo page event support copy is correct (`$32/event`) but primary CTA still uses shorthand `$32`.

## 2) Demo Monitoring (Daily)
Route health checks (2026-04-03):
- `200`: `/demo/`, `/demo-buddies/`, `/demo-scramble/`, `/legends-trip/`, `/stag-night/`, `/augusta-scramble/`, `/masters-member-guest/`, `/weekend-warrior/`

Simulation/settlement monitoring status:
- Browser-level settle simulation remains blocked by infrastructure dependency ticket [BET-211](/BET/issues/BET-211) pending [BET-222](/BET/issues/BET-222).

## 3) QA Coordination
Open bug list refreshed to:
- `inventory/open-bug-tracker-2026-04-03.csv`

Assignment status snapshot:
- Open bugs tracked: assigned = all rows currently listed, unassigned = none in current open set.
- Daily P0/P1 follow-up set includes critical/high bugs around pricing parity, private-route access control, and demo reliability.

## 4) Known Issues Tracker (Current)
- Pricing inconsistency on `/tour/` (`$199`) is **not reproduced** in current checks.
- Duplicate pages:
  - `/affiliate/` returns `301` and resolves to `/affiliates/` (`200`).
- Internal docs exposure:
  - `/marketing/`, `/gtm/`, `/ads/` return `404`
  - `/marketing-private/`, `/gtm-private/`, `/ads-private/`, `/admin/outreach/` still return `200` (publicly reachable).
- Previously reported 404 routes now redirect:
  - `/join/` -> `/create/` (`200` final)
  - `/about/` -> `/overview/` (`200` final)
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` -> `/games/` (`200` final)
- Email funnel remains incomplete: capture exists but trigger/send chain still open in backend work items.

## 5) Page Inventory
Maintained in:
- `inventory/page-inventory-full-2026-04-03.csv`

This inventory includes for each route:
- purpose
- intended visibility (public/internal)
- live status
- pricing status
- link status

## Blocking Note
Paperclip checkout conflicts persist on both currently assigned Caddie tickets (`BET-248`, `BET-211`) due active `executionRunId` lock states, which prevented normal checkout flow in this heartbeat.
