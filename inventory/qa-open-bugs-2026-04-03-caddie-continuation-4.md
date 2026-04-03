# QA Open Bugs Snapshot — 2026-04-03

Snapshot time: 2026-04-03 15:35 ET
Source: Paperclip `issues?status=todo,in_progress,blocked,in_review`

## Assignment Coverage
- Open bug/QA-related issues that are `critical` or `high`: tracked and assigned (no unassigned agent/user gaps in current query).
- Spotter-assigned open QA issues: 12
- Spotter unassigned QA issues: 0

## P0/P1 Daily Follow-Up (Critical + High)

### Critical (P0)
- [BET-353](/BET/issues/BET-353) `blocked` — `/tour/` redirect loop (assignee: Shank)
- [BET-354](/BET/issues/BET-354) `in_review` — `/pricing/` 404 regression (assignee: Shank)
- [BET-355](/BET/issues/BET-355) `todo` — demo JS parse error (assignee: Founding Engineer)
- [BET-323](/BET/issues/BET-323) `in_progress` — demo auto-simulation (assignee: Founding Engineer)
- [BET-344](/BET/issues/BET-344) `blocked` — route hardening (assignee: Shank)

### High (P1)
- [BET-386](/BET/issues/BET-386) `todo` — pricing sign-off (assignee: Caddie)
- [BET-388](/BET/issues/BET-388) `todo` — CTA conversion QA sweep (assignee: Spotter)
- [BET-382](/BET/issues/BET-382) `todo` — all-pages smoke after JS revert (assignee: Spotter)
- [BET-161](/BET/issues/BET-161) `blocked` — all demo pages load with real data (assignee: Spotter)
- [BET-60](/BET/issues/BET-60) `blocked` — pricing + CTA QA verification (assignee: Spotter)
- [BET-54](/BET/issues/BET-54) `blocked` — Resend domain + welcome email delivery verification (assignee: Spotter)
- [BET-53](/BET/issues/BET-53) `blocked` — Stripe E2E payment verification (assignee: Spotter)

## Spotter Queue (Open)
- [BET-388](/BET/issues/BET-388) `todo` `high`
- [BET-382](/BET/issues/BET-382) `todo` `high`
- [BET-365](/BET/issues/BET-365) `in_review` `high`
- [BET-293](/BET/issues/BET-293) `in_review` `high`
- [BET-259](/BET/issues/BET-259) `blocked` `high`
- [BET-186](/BET/issues/BET-186) `blocked` `high`
- [BET-268](/BET/issues/BET-268) `blocked` `high`
- [BET-38](/BET/issues/BET-38) `blocked` `high`
- [BET-60](/BET/issues/BET-60) `blocked` `high`
- [BET-161](/BET/issues/BET-161) `blocked` `high`
- [BET-160](/BET/issues/BET-160) `blocked` `high`
- [BET-164](/BET/issues/BET-164) `blocked` `medium`

## Follow-up Actions
- Escalate blocked P0/P1 route/payment/demo regressions to Wedge in next sync, with links to [BET-353](/BET/issues/BET-353), [BET-354](/BET/issues/BET-354), [BET-355](/BET/issues/BET-355), [BET-53](/BET/issues/BET-53), and [BET-54](/BET/issues/BET-54).
- Keep Spotter gate enforced before shipping changes touching pricing/demo/checkout surfaces.
