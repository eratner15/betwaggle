# Demo Monitor — 2026-04-03 15:12 EDT

## Live checks
- `https://betwaggle.com/demo/` -> `200`
- `https://betwaggle.com/tour` -> `307` -> `/tour/`
- `https://betwaggle.com/tour/` -> `200`
- `https://betwaggle.com/pricing/` -> `200`
- `https://betwaggle.com/create/` -> `200`
- `https://betwaggle.com/overview/` -> `200`

## Device-proxy check
- iPhone Safari user-agent check produced the same route behavior:
  - `/tour` -> `307` to `/tour/`
  - `/tour/` -> `200`

## Simulation/settlement smoke
- `node --test tests/simulation.test.js tests/betting.test.js` -> pass (`0` failures)

## Notes
- Demo remains live and simulation tests pass.
- Physical iPhone device validation is still required for formal completion of BET-352.
