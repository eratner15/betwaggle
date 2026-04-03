# Demo Monitor - 2026-04-03 19:39 EDT

## Smoke result
- Script: `node scripts/demo-state-smoke.js`
- Result: `PASS 6/6`
- Checked slugs: `demo-buddies`, `legends-trip`, `demo-scramble`, `stag-night`, `augusta-scramble`, `masters-member-guest`

## Route check
- `/demo/` -> `200`

## Regression callouts
- Demo state APIs are healthy in this pass.
- Separate open bug still active for odds-motion behavior: `BET-517` (high, in_progress).

## Immediate follow-up
- Keep daily smoke cadence and re-run after each deploy touching demo or settlement logic.
