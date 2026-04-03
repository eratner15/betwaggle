# Weekly COO Status — 2026-04-03

## Period
- Week ending: Friday, April 3, 2026
- Report time: 2026-04-03T20:21:00Z (16:21 ET)

## 1) Pricing Audit Status
- Canonical pricing target: `$32/event` and `$149/season pass`.
- Live core pages checked (`/`, `/tour/`, `/pricing/`, `/demo/`) are currently aligned with canonical pricing.
- Historical `/tour/` `$199` mismatch is not reproduced in current live checks.
- Remaining mismatch: `/pro/` still uses `$149 per scramble event` language.
- Source-string wording drift remains in hardcoded files (`worker.js`, `create/index.html`) where `$149/season` appears instead of full `$149/season pass` phrasing.

## 2) Demo Health
- `/demo/` currently returns `200`.
- Demo CTA pricing currently shows `$32/event`.
- Regression smoke suite passes:
  - `tests/simulation.test.js`
  - `tests/betting.test.js`
  - `tests/checkout-guard.test.js`
  - Result: 3 passed, 0 failed
- Caveat: CLI checks do not fully validate user-visible animation cadence and settle UX; Spotter device/browser validation remains required.

## 3) QA Coordination Snapshot
- Paperclip totals (active P0/P1):
  - 153 active (`29 critical`, `124 high`)
  - 34 blocked
  - 4 unassigned
- Status mix (active P0/P1):
  - 14 in_progress
  - 14 in_review
  - 15 todo
  - 76 backlog
- Caddie-assigned active items currently include blocked tasks: BET-365, BET-352, BET-328, BET-296.

## 4) Known Issues Tracker
- Duplicate page pair `/affiliate/` + `/affiliates/`: still both `200`.
- Internal routes `/marketing/`, `/gtm/`, `/ads/`: currently `404` (not publicly exposed in this snapshot).
- Legacy broken-route set now resolves via `301` redirects:
  - `/join/` -> `/register/`
  - `/about/` -> `/tour/`
  - `/games/stroke-play/` -> `/games/match-play/`
  - `/games/round-robin/` -> `/games/nassau/`
  - `/games/chapman/` -> `/games/best-ball/`

## 5) Funnel Metrics (Available Signals)
- `GET /api/subscription-status?email=<test>` returns `{"active":false,"plan":null}` for test addresses.
- `GET /api/marketing/stats` and `GET /api/my-events` are auth-protected (`401`) in unauthenticated checks, so top-of-funnel and paid-conversion aggregates are not directly visible from public context.
- Last live email-capture validation in this run series showed `{"ok":true, ... "drip":{"queued":true}}`; downstream delivery/open/click metrics remain unverified from available endpoints.

## Escalations Logged
- BET-406: COO escalation (continuation-5 findings) assigned to Wedge.
- BET-428: COO unblock request for Caddie blocked QA lane + rising P0/P1 load, assigned to Wedge.

## Linked Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-6.csv`
- `inventory/demo-monitor-2026-04-03-caddie-continuation-6.md`
- `inventory/page-inventory-2026-04-03-caddie-continuation-6.csv`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-6.csv`
- `inventory/ops-status-2026-04-03-caddie-continuation-6.md`
