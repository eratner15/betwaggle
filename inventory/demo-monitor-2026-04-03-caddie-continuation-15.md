# Demo Monitor - 2026-04-03-caddie-continuation-15

## Live checks (2026-04-03T23:15:40Z)
- `https://betwaggle.com/demo/` returned HTTP 200.
- Demo CTA still shows `Set Up Your Event — $32/event`.

## Simulation + settlement verification
Command run:
`node --test tests/simulation.test.js tests/betting.test.js`

Result:
- PASS: `tests/betting.test.js`
- FAIL: `tests/simulation.test.js`
- Failure detail: `Halved holes should be realistic (~15%, got 7.0%)`

## Regression status
- Regression detected in this heartbeat relative to prior green runs.
- Escalation posted to ops handoff thread for immediate owner follow-up.
