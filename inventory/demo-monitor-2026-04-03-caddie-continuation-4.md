# Demo Monitor — 2026-04-03

Checked at: 2026-04-03 15:35 ET

## Route Health
- `/demo/` returns `200`.
- Demo scenario routes return `200`: `/demo-buddies/`, `/legends-trip/`, `/demo-scramble/`, `/stag-night/`, `/augusta-scramble/`, `/masters-member-guest/`.
- Demo card routes return `200`: `/cards/skins/`, `/cards/nassau/`, `/cards/wolf/`, `/cards/match-play/`, `/cards/scramble/`, `/cards/settlement/`.

## Pricing Copy Check (Demo Surface)
- CTA reads `Set Up Your Event — $32/event`.
- Supporting text reads `$32/event when you're ready`.
- No `$199` pricing observed in `/demo/` source.

## Simulation + Settlement Validation Status
- Automated HTTP/source checks passed for loadability and route availability.
- Full interactive validation (simulate scoring transitions + final settlement state mutations) remains pending manual/browser QA pass.
- Open blocker for reliable mobile smoke execution remains tracked in [BET-211](/BET/issues/BET-211).

## Escalation Notes
- If demo interaction regression is observed in browser execution, escalate to Wedge immediately and link [BET-323](/BET/issues/BET-323), [BET-355](/BET/issues/BET-355), and [BET-129](/BET/issues/BET-129).
