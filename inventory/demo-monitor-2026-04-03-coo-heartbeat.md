# Demo Monitor - 2026-04-03 (12:26 EDT)

## Live Route Checks
- `GET https://betwaggle.com/demo/` -> `200`
- `GET https://betwaggle.com/demo-buddies/` -> `200`
- `GET https://betwaggle.com/demo-scramble/` -> `200`
- `GET https://betwaggle.com/legends-trip/` -> `200`
- `GET https://betwaggle.com/stag-night/` -> `200`
- `GET https://betwaggle.com/augusta-scramble/` -> `200`
- `GET https://betwaggle.com/masters-member-guest/` -> `200`
- `GET https://betwaggle.com/weekend-warrior/` -> `200`

## Demo Pricing Copy
- Demo CTA copy: `Set Up Your Event - $32`
- Demo support copy: `$32/event when you're ready. No app download.`

## Simulation / Settlement Confidence (this heartbeat)
- `node tests/betting.test.js` -> `608 passed, 0 failed`
- `node tests/simulation.test.js` -> all tests passed (`14 passed`)
- `node tests/delta_demo.js` -> demo scenario completed successfully

## Risks / Regressions
- Conversion chain is degraded by live route failures outside demo:
  - `/create/` -> `307` self-redirect loop
  - `/tour/` -> `307` self-redirect loop
  - `/pricing/` -> `404`
- Browser-level settle-clickthrough on mobile remains partially blocked by infra dependency tracked in `BET-211` and `BET-222`.

## Escalation
- Route regressions are now conversion-critical and pricing-trust critical. Escalate to Wedge/Founding Engineer for immediate fix sequencing.
