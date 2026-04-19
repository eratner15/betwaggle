# Next Session Prompt — Copy/Paste This

We are taking BetWaggle from “trip ready” and “premium-ish” to fully launch ready on both axes:

1. `Trip-ready = 100%`
   Every core mobile flow works with no dead ends:
   create, invite/share, open board, choose identity, score entry, live board checking, betting/bar, settlement, share result, weekly replay.
2. `Premium = 100%`
   The product feels expensive, intentional, and socially compelling enough that scramble users want it for their weekly game.

## What Shipped In The Last Pass
- `create/index.html`
  The post-create success screen is now a premium invite suite instead of a plain utility stack.
  It has:
  - a stronger “your game is live” hero
  - a cleaner share block
  - explicit next-step ceremony
  - a darker “field” card
  - clearer primary CTAs: `Start Scoring` and `Open The Board`
- `app/js/views.js`
  The trip dashboard hero now feels more like the clubhouse home base:
  - uses `trip-shell-hero-plate-v2.png`
  - adds identity CTA when unclaimed
  - brings score / bar / share actions above the fold
  - improves visual depth and hierarchy on mobile
- `scripts/check-share-surfaces.sh`
  QA now checks the new invite copy:
  - `Each player picks their identity`
  - `Score the round, settle cleanly, then reuse the crew`

## Current Scores
- `Trip-ready: 86%`
- `Premium: 81%`

## What Still Feels Weak
- Settlement is better than before but still not ceremonial enough to make outsiders want the product from a screenshot.
- The share/export/OG layer is still the biggest premium gap.
- The Bar still needs a full hierarchy pass:
  - live now
  - upcoming
  - futures
  - props
  - slip
- Weekly replay is functional but not yet irresistible.
- Real-world validation is still missing for:
  - one actual host running create → invite → board on a phone
  - one real group finishing score → settle → share on mobile

## Highest-Leverage Next Pass
Attack this in order:

1. `Settlement / share / OG`
   - wire the local `app/assets/share-card-hero-plate.png`
   - improve `#settle` hero and result framing
   - make the settlement share artifact feel screenshot-worthy
   - run:
     - `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae`
     - `bash scripts/check-og-preview.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae`
2. `The Bar`
   - improve market hierarchy and identity handling
   - make the slip feel like a premium ticket / ledger
3. `Weekly replay`
   - make “start weekly game from this group” feel like the obvious next move after a good round

## Image Asset State
- Already in repo:
  - `/home/eratner/betwaggle/app/assets/trip-shell-hero-plate.png`
  - `/home/eratner/betwaggle/app/assets/trip-shell-hero-plate-v2.png`
  - `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate.png`
  - `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate-v2.png`
  - `/home/eratner/betwaggle/app/assets/settlement-lounge-plate.png`
  - `/home/eratner/betwaggle/app/assets/ledger-paper-texture.png`
  - `/home/eratner/betwaggle/app/assets/share-card-hero-plate.png`
- Still needed:
  - `/home/eratner/betwaggle/app/assets/invite-launch-plate.png`
  - `/home/eratner/betwaggle/app/assets/settlement-ornament-v3.png`
  - `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate-v3.png`
  - quieter settlement background variant if settlement still feels busy after share-card pass

## Hard Rules
- All readable text must stay in HTML/CSS/SVG, never baked into generated images.
- No fake UI text inside images.
- No logos, fake crests, signage, receipts, scoreboards, or watermarks inside images.
- No purple gradients, neon sportsbook look, generic SaaS illustrations, or fantasy-sports visual language.
- Premium should feel like private-club / clubhouse / golf-trip / live-action.
- Prioritize `390x844`.
- Verify glare readability before calling any premium pass “done.”

## Required QA Every Pass
- `node --check app/js/app.js`
- `node --check app/js/views.js`
- `bash scripts/run-trip-flow-smoke.sh`
- `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae`
- targeted Playwright QA for the exact surface changed
- if share/OG changed:
  - `bash scripts/check-og-preview.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae`

## Production References
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#dashboard`
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#scorecard`
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#settle`
- `https://betwaggle.com/masters-member-guest/#dashboard`
- `https://betwaggle.com/masters-member-guest/#bet`
- `https://betwaggle.com/create/`

## Last Pass Verification
- `wrangler deploy`
  Production updated successfully on `2026-04-18`
- Targeted Playwright:
  - create → invite suite rendered
  - invite → board handoff rendered
- Required QA:
  - `node --check app/js/app.js` ✅
  - `node --check app/js/views.js` ✅
  - `bash scripts/run-trip-flow-smoke.sh` ✅
  - `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae` ✅

## Start With
“Continue BetWaggle launch loop — pass next on settlement/share/OG, then The Bar.”
