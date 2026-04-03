# Conversion Audit - April 3, 2026

## Scope Reviewed
- `index.html`
- `tour/index.html`
- `pricing/index.html`
- `demo/index.html`
- `emails/drip-01-welcome.html` through `emails/drip-05-last-chance.html`
- `emails/SEQUENCE.md`
- `affiliate/index.html`
- `affiliates/index.html`

## Pricing Consistency
- Confirmed target pricing in audited pages: **$32/event** and **$149/season**.
- Confirmed no `$199` pricing in audited public marketing pages.
- `tour/index.html` pricing table currently shows:
  - Season Pass: `$149/season`
  - Buddies Trip: `$32/event`

## CTA Review
Primary CTA in audited pages:
- `Set Up Your Event — $32`

Secondary CTA in audited pages:
- `Try the Demo`

All major CTA paths in audited pages route to demo or event setup.

## Email Drip Sequence
Verified 5-email sequence exists and maps to requested cadence:
- Day 0: Welcome (`drip-01-welcome.html`)
- Day 2: Social proof (`drip-02-social-proof.html`)
- Day 4: Feature spotlight (`drip-03-feature-spotlight.html`)
- Day 7: Urgency (`drip-04-urgency.html`)
- Day 14: Last chance (`drip-05-last-chance.html`)

## Internal/Public Route Status
- Legacy internal top-level aliases `/marketing/`, `/gtm/`, and `/ads/` are guarded in Worker route blocking.
- Private route directories currently use `-private` naming conventions.

## Duplicate Page Status
- Canonical route: `/affiliates/`
- Legacy route `/affiliate/` currently redirects to canonical and is marked noindex in static alias page.

## Coordination Needed
- Caddie: run one more spot audit of price copy before publish.
- Shank: ensure drip templates and cadence are wired in backend email trigger flow.
- Spotter: verify CTA targets and links in production after deployment.
