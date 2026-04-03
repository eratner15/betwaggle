# Demo Monitor - 2026-04-03 23:44 ET

## Route Health
- `https://betwaggle.com/demo/` -> HTTP 200
- Demo state smoke script (`scripts/demo-state-smoke.js`) -> PASS 6/6 slugs valid
  - `demo-buddies`
  - `legends-trip`
  - `demo-scramble`
  - `stag-night`
  - `augusta-scramble`
  - `masters-member-guest`

## Simulation / Settlement Signals
- `node tests/simulation.test.js` -> passed (14/14 assertions)
- `node tests/betting.test.js` -> passed (608/608 checks)
- Note: `vitest` wrapper fails these files because they are script-style tests; direct `node` execution is the valid smoke method in this repo.

## Regression Watch
- Open regression issue indicates visible odds may still appear static in `/demo/` despite backend state being healthy: [BET-517](/BET/issues/BET-517)
- Action: keep daily monitor on visual odds movement and settlement state rendering.
