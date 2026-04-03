# Demo Monitor — 2026-04-03 (Continuation)

## Live checks
- `https://betwaggle.com/demo` -> `307` redirect to `/demo/`
- `https://betwaggle.com/demo/` -> `200` (loads)

## Simulation + settlement checks
- `node --test tests/simulation.test.js tests/betting.test.js`
- Result: pass (`simulation` + `betting` both green; 0 failures)

## Regressions found this run
- None inside local simulation/settlement tests.
- Live platform blockers remain outside demo route itself:
  - `/tour/` returns `307` self-loop
  - `/pricing/` returns `404`
