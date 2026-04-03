# Demo Monitor — 2026-04-03 (Caddie continuation 2)

Checked at: 2026-04-03 19:00 ET

## Route Health
- `GET https://betwaggle.com/demo/` => `200`
- `GET https://betwaggle.com/tour/` => `200`

## Functional Evidence (local runner)
- `node tests/delta_demo.js` => pass (loads odds flow and settlement delta demo without runtime error)
- Pricing copy present in demo source:
  - `demo/index.html:448` `Set Up Your Event — $32/event`
  - `demo/index.html:451` `$32/event when you're ready. No app download.`

## Regressions
- No demo-load regression detected in this heartbeat.
- No phantom feature text observed in demo source on audited lines.

## Note
- Full mobile-browser interaction remains limited by host browser-lib constraints tracked in `BET-211`.
