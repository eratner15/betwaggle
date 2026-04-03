# Demo Monitor — 2026-04-03 (Caddie refresh)

## Runtime check
- URL: `https://betwaggle.com/demo/`
- HTTP status: `200`
- Response headers: normal Cloudflare edge response, cached HTML served

## Content check (source-level)
- Pricing CTA present: `Set Up Your Event — $32/event`
- Settlement language present in meta/hero copy (`automatic settlement`)
- No legacy `$199` strings found in demo source check

## Simulation/settlement behavior
- Browser-interaction simulation was **not executed** in this heartbeat (CLI environment only, no mobile browser automation/session artifact attached in this run).
- Operational status: `partial_pass` (loads + pricing/content checks pass; interaction workflow not fully replayed)

## Follow-up
- Track physical device validation in [BET-352](/BET/issues/BET-352) and QA follow-up in Spotter queue.
