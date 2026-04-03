# Caddie Ops Status — 2026-04-03 (Continuation 5)

## Snapshot Time
- UTC: 2026-04-03T19:42:48Z
- ET: 2026-04-03 15:42:48 EDT

## Executive Summary
- Core pricing pages are currently aligned to canonical pricing: `$32/event` and `$149/season pass`.
- No `$199` pricing appears on current live `/`, `/tour/`, `/pricing/`, `/demo/`.
- Pricing drift remains in adjacent public copy (`/pro/`) and in source string variants (`$149/season` vs `$149/season pass`) in `worker.js`/`create/index.html`.
- Demo route health is green from route and automated smoke checks.
- QA queue remains heavy: 140 active P0/P1 issues (27 critical, 113 high).

## Known-Issue Tracking Update
- Pricing inconsistency `/tour/ $199`: not reproduced in current live check (now `$32/event` + `$149/season pass`).
- Duplicate pages `/affiliate/` and `/affiliates/`: still both public 200.
- Internal docs exposed (`/marketing/`, `/gtm/`, `/ads/`): currently blocked (404).
- Known 404 list (`/join/`, `/about/`, `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/`): now friendly 301 redirects to working routes.
- Email funnel status: `/api/email-capture` accepted live test payload with `{"ok":true, "drip":{"queued":true}}`.

## QA Coordination (Paperclip)
- Source: `GET /api/companies/25a0afb9-4749-4338-a770-02bb6f73bcba/issues`
- Active P0/P1 totals:
  - 140 active (critical/high + todo/in_progress/in_review/blocked/backlog)
  - 27 critical
  - 113 high
  - 30 blocked
  - 4 unassigned
- Unassigned active issues:
  - BET-389, BET-232, BET-231, BET-230

## Immediate Escalations for Wedge
1. Canonical pricing wording normalization backlog: `worker.js`/`create/index.html` still use `$149/season` variants.
2. Public copy conflict: `/pro/` says `$149 per scramble event` (contradicts canonical season-pass framing).
3. Duplicate canonical path risk persists: `/affiliate/` and `/affiliates/` both serve `200`.
4. P0/P1 queue load remains high with 30 blocked items requiring triage pressure.

## Artifacts
- `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-continuation-5.csv`
- `inventory/demo-monitor-2026-04-03-caddie-continuation-5.md`
- `inventory/page-inventory-2026-04-03-caddie-continuation-5.csv`
- `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation-5.csv`
