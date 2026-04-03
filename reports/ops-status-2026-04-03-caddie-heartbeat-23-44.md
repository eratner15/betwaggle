## COO Ops Status - 2026-04-03 23:44 ET

### Pricing Audit
- Spreadsheet: reports/pricing-audit-spreadsheet-2026-04-03-caddie-heartbeat-23-44.csv
- Page inventory: reports/page-inventory-2026-04-03-caddie-heartbeat-23-44.csv
- Canonical event price remains "$32/event" across audited core pages.
- Legacy "$199" pricing not found in audited source or live responses.
- Live pricing drift still present on "/", "/tour/", and "/pricing/" (showing "$149/season").
- Source still has season wording drift in outreach templates and worker.js labels.

### Demo Health
- Demo route health: "/demo/" returns 200.
- State smoke: scripts/demo-state-smoke.js passed 6/6 demo slugs.
- Scripted simulation/settlement tests: node tests/simulation.test.js and node tests/betting.test.js both passed.

### QA Coordination
- Spotter-tracked open bug/QA CSV: reports/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-heartbeat-23-44.csv
- P0/P1 open items in tracker: 44
- Unassigned P0/P1 items: 0
- Blocked P0/P1 items: 19
- Daily follow-up required on blocked critical/high defects and pricing drift regressions.

### Known Issues Snapshot
- Pricing inconsistency on live season wording: still present on "/", "/tour/", "/pricing/".
- Duplicate affiliate routes: "/affiliate/" now redirects 301 to "/affiliates/".
- Internal docs exposure: "/marketing/", "/gtm/", "/ads/" currently return 404.
- Known 404s: "/games/stroke-play/", "/games/round-robin/", "/games/chapman/" still 404.
- Email funnel concern: backend drip wiring reported active; requires end-to-end email delivery confirmation to close funnel risk.
