# Demo Monitor — 2026-04-03 (Caddie continuation 2)

## Live route checks (ET)
- `https://betwaggle.com/demo/` -> `200`
- `https://betwaggle.com/tour/` -> `200`
- `https://betwaggle.com/pricing/` -> `200`

## Pricing parity on demo surface
- Demo CTA copy includes canonical `$32/event` wording.
- No `$199` or `$9.99` pricing detected in live demo HTML scan.

## Simulation/settlement health
- Command run: `node --test tests/simulation.test.js tests/betting.test.js`
- Result: `tests/betting.test.js` passed.
- Result: `tests/simulation.test.js` failed 1 assertion (`Halved holes should be realistic (~15%, got 10.0%)`).

## Regression callout for Wedge
- Demo page route and pricing copy are healthy right now.
- Simulation test failure indicates demo realism regression risk; keep this in active bug triage until test passes.
