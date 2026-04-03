# Demo Monitor - 2026-04-03-caddie-continuation-14

## Live checks (2026-04-03T23:04:40Z)
- `https://betwaggle.com/demo/` returned HTTP 200.
- Demo CTA copy currently shows `Set Up Your Event — $32/event`.
- No demo outage observed during this heartbeat.

## Simulate + settle verification
Command run:
`node --test tests/simulation.test.js tests/betting.test.js`

Result:
- PASS: `tests/simulation.test.js`
- PASS: `tests/betting.test.js`
- Summary: 2/2 suites passed, 0 failed.

## Regression watch
- No new regression observed in load/simulate/settle checks this run.
- Continue daily watch for settlement math and demo-odds visibility bugs in active P0/P1 queue.
