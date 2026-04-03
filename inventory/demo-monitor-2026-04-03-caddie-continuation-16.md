# Demo Monitor - 2026-04-03-caddie-continuation-16

## Live route checks (2026-04-03T23:27:41Z)
- `GET https://betwaggle.com/demo/` -> `200`
- `GET https://betwaggle.com/demo-buddies/` -> `200`
- `GET https://betwaggle.com/demo-scramble/` -> `200`

## Scope correction (non-core demo slugs)
- `GET https://betwaggle.com/demo-guest/` -> `404`
- `GET https://betwaggle.com/demo-stag-night/` -> `404`
- `GET https://betwaggle.com/demo-charity/` -> `404`
- These three slugs are not referenced in current product source routing; core demo monitoring should stay on `/demo/`, `/demo-buddies/`, `/demo-scramble/` unless product scope changes.

## Functional smoke signal
- CTA copy on `/demo/` remains `Set Up Your Event — $32/event`.
- Existing simulation regression remains open from prior heartbeat evidence (`tests/simulation.test.js` halved-hole distribution anomaly); no new test pass artifact landed in this run.

## Escalation posture
- Keep demo health flagged as **watch** (not green) until owner posts fresh simulation evidence on linked QA bugs.
