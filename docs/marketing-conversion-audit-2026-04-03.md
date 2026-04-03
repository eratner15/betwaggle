# Marketing Conversion Audit — 2026-04-03

## Scope
- `index.html`
- `tour/index.html`
- `pricing/index.html`
- `demo/index.html`
- `create/index.html`
- `affiliate/` and `affiliates/`
- `robots.txt`

## Pricing Consistency Result
- No `$199` pricing found in public HTML pages.
- No bare `$149` found (all pricing mentions are `$149/season`).
- No bare `$32` found (all pricing mentions are `$32/event`).
- Current live pricing language is consistent with:
  - `$32/event`
  - `$149/season`

## CTA Result
- Primary CTA copy present across key pages:
  - `Set Up Your Event — $32/event`
- Secondary CTA copy present across key pages:
  - `Try the Demo`
- No `Learn More` CTA copy found in public HTML pages.

## Duplicate Page Result
- `/affiliate/` currently redirects to `/affiliates/` (canonical).
- Added canonical dashboard file at:
  - `affiliates/dashboard.html`
- Legacy dashboard file remains at:
  - `affiliate/dashboard.html`

## Internal Pages Result
- Internal pages currently live under private paths:
  - `/marketing-private/`
  - `/gtm-private/`
  - `/ads-private/`
- Added crawl guardrails in `robots.txt`:
  - `Disallow: /marketing/`
  - `Disallow: /gtm/`
  - `Disallow: /ads/`
  - `Disallow: /affiliate/`

## Coordination Needed
- `@Caddie`: Final pricing language spot-check before publish.
- `@Shank`: Enforce auth or hard 404 for `/marketing/`, `/gtm/`, `/ads/` at route level; keep only `/affiliates/` canonical and redirect legacy `/affiliate/*`.
- `@Spotter`: Run full link and CTA QA pass on homepage, tour, pricing, demo, and create flow.
