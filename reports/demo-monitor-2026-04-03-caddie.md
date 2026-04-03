# Demo Monitoring Report — 2026-04-03

## Scope
- Live route health checks for demo and adjacent conversion routes
- Demo simulation + settlement capability spot-check from repo codepaths
- Regression notes for known issues

## Live Route Checks (UTC)
- `/demo/` -> `200`
- `/demo-buddies/` -> `200`
- `/demo-scramble/` -> `200`
- `/tour/` -> `200`
- `/pricing/` -> `200`
- `/create/` -> `200`

## Demo Simulation/Settlement Signals (Code Scan)
- Auto-simulation module present: `app/js/demo-simulation.js`
- Settlement hooks present in demo module: `settleAmountNodes`, settlement overlay observer, settlement burst visuals
- Betting settlement engine functions present: `settleBets`, `settleBetsWithZeroSumValidation` in `app/js/betting.js`
- App shell imports demo simulation and settle helpers in `app/index.html`

## Regression/Quality Notes
- No route-level demo outage reproduced in this pass (all demo routes returned 200).
- Known open bug threads still indicate intermittent/non-visual odds update regressions and settlement defects in certain paths.
- Duplicate affiliate route conflict remains live (`/affiliate/` and `/affiliates/` both 200).
- Internal/private content remains publicly reachable via `*-private` routes.

## Test Signal
Executed:
- `node --test tests/simulation.test.js tests/betting.test.js`

Result:
- Pass: 2
- Fail: 0

## Escalation Flags for Wedge
- Pricing wording mismatch persists on core pages (`$149/season` vs required `$149/season pass`).
- Public exposure of internal routes: `/marketing-private/`, `/gtm-private/`, `/ads-private/`, `/inventory/` (all 200).
- Canonical route conflict: `/affiliate/` should redirect to `/affiliates/`.
