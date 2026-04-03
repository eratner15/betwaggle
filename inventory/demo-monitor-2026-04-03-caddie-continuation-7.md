# Demo Monitor — 2026-04-03 (Caddie Continuation 7)

## Scope
- Route health for `https://betwaggle.com/demo/`
- Demo simulation sanity using local scripts
- Pricing copy sanity on demo launcher

## Checks Run
- `curl -sL -o /dev/null -w '%{http_code}' https://betwaggle.com/demo/` -> `200`
- Pricing copy on live demo launcher includes canonical `$32/event` in CTA/support text
- `node tests/simulation.test.js` -> passed (`14` passed, `0` failed)
- `node tests/delta_demo.js` -> completed with expected delta output and success footer

## Result
- Demo launcher availability: PASS
- Simulation engine health (script-level): PASS
- Settle/ceremony full browser E2E on hosted demo event route: NOT RUN in this heartbeat

## Regressions
- None detected in this heartbeat for demo launcher + simulation scripts.

## Follow-up
- Keep daily run cadence.
- If hosted demo event pages regress (render/parsing/settlement), escalate immediately to Wedge and Spotter.
