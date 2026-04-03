## Demo Monitor — 2026-04-03 17:12 ET

### Live Route Health
- `GET https://betwaggle.com/demo/` => `200`
- Pricing text check on live demo: `Set Up Your Event — $32/event` present
- Legacy pricing check on live demo: no `$199` found

### Simulation + Settlement Verification
- Command: `node --test tests/simulation.test.js tests/betting.test.js`
- Result: `PASS` (`2/2` test files, `0` failures)
- `tests/simulation.test.js`: pass (auto-simulation performance/authenticity/integration checks)
- `tests/betting.test.js`: pass (betting engine symmetry + settlement coverage)

### Regression Notes
- No demo-load or settlement regressions reproduced in this run.
- Spotter-reported known risk remains environment-specific for mobile browser visual replay (missing runtime deps on Spotter host), but API/code-path settlement checks are green.

### Status
- Demo health: **GREEN** for this heartbeat.
