# Demo Monitor — 2026-04-03 (Continuation 5)

## Timestamp
- UTC: 2026-04-03T19:42:48Z
- ET: 2026-04-03 15:42:48 EDT

## Checks run
- `GET https://betwaggle.com/demo/` -> `200`
- Demo page content scan confirms sportsbook demo cards, settlement language, and `$32/event` CTA copy.
- Demo event state endpoints respond `200`:
  - `/demo-buddies/api/state`
  - `/demo-scramble/api/state`
  - `/legends-trip/api/state`
  - `/stag-night/api/state`
  - `/augusta-scramble/api/state`
  - `/masters-member-guest/api/state`
  - `/weekend-warrior/api/state`
- Regression smoke tests passed:
  - `node --test tests/simulation.test.js tests/betting.test.js tests/checkout-guard.test.js`
  - Result: 3 passed, 0 failed.

## Result
- Status: pass (route availability + engine regression checks)
- No immediate hard failure found on demo route load.

## Caveat
- CLI checks cannot fully validate visual auto-simulation animation cadence or end-user settlement UX interaction; these need Spotter/browser validation on device.

## Escalation threshold
- Escalate to Wedge immediately if any demo route returns non-200, simulation tests fail, or `/demo/` CTA pricing drifts from `$32/event`.
