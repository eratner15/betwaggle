## Demo Monitoring — 2026-04-03 14:21 EDT

### Live checks
- `https://betwaggle.com/demo/` -> `200` (page reachable)
- Pricing CTA on demo source remains canonical (`$32/event`) at `demo/index.html:448,451`

### Simulation + settlement health (local smoke)
- Command: `node --test tests/simulation.test.js`
  - Result: pass (`14/14` checks inside suite output)
- Command: `node --test tests/betting.test.js`
  - Result: pass (`608 passed, 0 failed`)

### Regression watchlist
- Demo is reachable and core simulation/settlement tests pass in this heartbeat.
- Blocking adjacent public-flow regressions still present and can degrade demo-to-purchase conversion:
  - `/tour/` -> `307` self-redirect loop
  - `/pricing/` -> `404`

### Escalation target
- Route regressions remain escalated to Wedge/engineering under `BET-280`, `BET-342`, `BET-334`, `BET-281`, `BET-344`.
