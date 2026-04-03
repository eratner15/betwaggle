# Demo Monitor — 2026-04-03 14:36 EDT

## Live route checks
- `https://betwaggle.com/demo/` -> `200`
- `https://betwaggle.com/tour/` -> `307` self-loop (`Location: /tour/`)
- `https://betwaggle.com/pricing/` -> `404`
- `https://betwaggle.com/create/` -> `200`
- `https://betwaggle.com/overview/` -> `200`

## Simulation/settlement smoke
- Command: `node --test tests/simulation.test.js tests/betting.test.js`
- Result: pass (`2/2` test files, `0` failures)

## Regression status
- Demo route itself is healthy (`/demo/` loading).
- P0 regression remains on `/tour/` route loop.
- Pricing entrypoint remains blocked by `/pricing/` 404.
