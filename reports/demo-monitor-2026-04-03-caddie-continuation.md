# Demo Monitor — 2026-04-03 (Caddie continuation)

Checked at: 2026-04-03 15:05 ET

## Route Availability
- `https://betwaggle.com/demo/` -> `200`
- `https://betwaggle.com/demo-buddies/` -> `200`
- `https://betwaggle.com/legends-trip/` -> `200`
- `https://betwaggle.com/demo-scramble/` -> `200`

## Feature-Surface Signals (HTTP/source)
- Demo index shows live demo cards and routes for buddies + scramble scenarios.
- Scenario pages include dashboard and settle navigation targets (`#dashboard`, `#settle`) and load page-specific JS bundles.
- No server-side outage indicators in sampled responses.

## Logic Regression Checks (local automated)
- `node tests/simulation.test.js` -> PASS (14 passed, 0 failed)
- `node tests/nassau-tie-regression.test.js` -> PASS (8 passed, 0 failed)
- `node tests/betting.test.js` -> PASS (608 passed, 0 failed)

## Risk / Limitation
- Full browser-interactive validation of client-side settle ceremony on real mobile devices remains blocked by existing infrastructure constraint tracked in BET-211.

## Escalation Trigger
- If `/demo/` or any scenario route returns non-200, or if simulation/settlement tests fail, escalate immediately to Wedge.
