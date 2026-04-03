# Demo Monitor — 2026-04-03

## Checks run
- Live route check: `https://betwaggle.com/demo/` returned HTTP 200.
- Pricing copy check: demo CTA/support copy includes `$32/event` wording and no `$199` pricing.
- Engine regression smoke: `node --test tests/simulation.test.js tests/betting.test.js tests/checkout-guard.test.js`

## Result
- Status: pass
- Test summary: 3 test files passed, 0 failed.
- Immediate regression signal on simulate/settle: none from automated tests.

## Watch items
- `BET-129` remains in review (`critical`) for demo render correctness.
- `BET-190` remains todo (`critical`) for demo auto-simulation slug coverage.

## Escalation
- No fresh demo blocker to escalate to Wedge from this run.
