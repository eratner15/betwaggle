# Demo Monitor — 2026-04-03 (Caddie Refresh)

Checked at: 2026-04-03 13:34 ET

## Launch Surface
- `/demo/`: `200` (loads)
- Pricing copy on demo launcher: CTA shows `Set Up Your Event — $32` (copy mismatch vs canonical `$32/event`), support line correctly states `$32/event`.

## Simulation/Settle Coverage
- `/demo-buddies/`: `200`; HTML includes `#dashboard` and `#settle` tab references.
- `/demo-scramble/`: `200`.
- `/stag-night/`: `200`.
- `/augusta-scramble/`: `200`.
- `/masters-member-guest/`: `200`.

## Regressions Found (P0/P1 candidate)
- Broken demo-card destinations linked from `/demo/`:
  - `/cards/skins/` -> `404`
  - `/cards/nassau/` -> `404`
  - `/cards/wolf/` -> `404`
  - `/cards/match-play/` -> `404`
  - `/cards/scramble/` -> `404`
- These are user-visible dead links on the demo page and create "static/broken demo" perception.

## Feature Parity Notes
- Demo launcher still advertises card experiences that are currently unreachable in production (`/cards/*` paths above).
- Recommend either restoring routes or removing those cards from launcher until fixed.

