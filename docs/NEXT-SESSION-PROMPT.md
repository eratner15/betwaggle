# Next Session Prompt — Copy/Paste This

We are taking BetWaggle from “trip ready” and “premium-ish” to fully launch ready on both axes, with scramble as the current product spearhead.

Important framing:
- `blue-monster-at-trump-national-doral-apr-753cae` is a test instance only.
- Do not let Blue Monster dictate scramble design.
- Use scramble seeds like `demo-scramble` and `augusta-scramble` as the truth for scramble product work.
- Keep one shared mobile workflow family across:
  - scramble
  - round / buddies trip
  - tournament / member-guest

## What Shipped In The Last Pass
- `app/js/views.js`
  Phase 2 scramble dashboard upgrade shipped:
  - premium scramble hero
  - live pressure card
  - side-game rail
  - stronger clubhouse standings hierarchy
  - better first-screen mobile readability
- `app/css/styles.css`
  Added reusable scramble premium primitives:
  - hero
  - action row
  - pressure card
  - side-game grid
  - premium section card
- `scripts/check-scramble-board.sh`
  Added dedicated live scramble regression coverage for:
  - `demo-scramble`
  - `augusta-scramble`
- Asset production gap fixed:
  - `/app/assets/invite-launch-plate.png`
  - `/app/assets/scorecard-atmosphere-plate-v3.png`
  - `/app/assets/settlement-ornament-v3.png`
  now resolve on production

## Current Scores
- `Trip-ready: 89%`
- `Premium: 85%`

## What Improved
- The scramble board feels more like a premium destination and less like a prototype stack.
- Purse, pressure, and side-game state are readable much earlier on mobile.
- The broken invite/hero image state is fixed because the missing art is now live.

## What Still Feels Weak
- Phase 3 is still unfinished:
  scramble score entry does not yet have the full CTP/LD workflow.
- Phase 4 is still unfinished:
  scramble settlement is functional but not yet ceremonial or screenshot-worthy enough.
- Shared primitives exist in CSS now, but round/tournament still do not consume enough of them.
- The Bar still needs a premium hierarchy pass later.

## Highest-Leverage Next Pass
Do this in order:

1. `Phase 3 — CTP / LD score-entry workflow`
   - extend scramble hole entry so eligible holes surface side-game prompts naturally
   - normalize side-game state instead of relying on raw strings only
   - support defer / resolve-later state
   - add correction path
   - update `app/js/sync.js`
   - update `worker.js`
   - add scramble-specific QA for this flow

2. `Phase 4 — Scramble settlement ceremony`
   - rebuild scramble settlement in `renderSettlement(state)`
   - improve incomplete state
   - improve final standings / payout reveal
   - wire better share framing
   - use `share-card-hero-plate.png`
   - use `settlement-ornament-v3.png`

3. `Cross-format cleanup`
   - promote useful scramble primitives into shared board/settlement primitives where safe
   - keep scramble-specific composition where needed

## Image Asset State
- Already live:
  - `/home/eratner/betwaggle/app/assets/invite-launch-plate.png`
  - `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate-v3.png`
  - `/home/eratner/betwaggle/app/assets/settlement-ornament-v3.png`
  - `/home/eratner/betwaggle/app/assets/share-card-hero-plate.png`
  - `/home/eratner/betwaggle/app/assets/trip-shell-hero-plate-v2.png`
- Still needed:
  - quieter settlement background variant if phase 4 still feels busy
  - possibly a scramble-specific share/result background if the existing share-card plate feels too general

## Hard Rules
- All readable text stays in HTML/CSS/SVG.
- No baked UI text in images.
- No fake scoreboards, signage, logos, receipts, crests, or watermarks in images.
- No purple gradients.
- No neon sportsbook look.
- Must read cleanly on `390x844` under outdoor glare.
- Graphics should feel expensive and restrained, not “AI slop.”

## Required QA Every Pass
- `node --check app/js/app.js`
- `node --check app/js/views.js`
- `bash scripts/run-trip-flow-smoke.sh`
- `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae`
- targeted Playwright QA for the exact changed scramble surface
- scramble dashboard pass:
  - `bash scripts/check-scramble-board.sh https://betwaggle.com demo-scramble augusta-scramble`
- if settlement/share changes:
  - `bash scripts/check-og-preview.sh https://betwaggle.com augusta-scramble`

## Production References
- Scramble:
  - `https://betwaggle.com/demo-scramble/#dashboard`
  - `https://betwaggle.com/demo-scramble/#scorecard`
  - `https://betwaggle.com/demo-scramble/#settle`
  - `https://betwaggle.com/augusta-scramble/#dashboard`
  - `https://betwaggle.com/augusta-scramble/#scorecard`
  - `https://betwaggle.com/augusta-scramble/#settle`
- Shared regression only:
  - `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#dashboard`
  - `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#scorecard`
  - `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#settle`
  - `https://betwaggle.com/masters-member-guest/#dashboard`
  - `https://betwaggle.com/masters-member-guest/#bet`
  - `https://betwaggle.com/create/`

## Last Pass Verification
- `wrangler deploy`
  Production updated successfully on `2026-04-19`
- Asset URLs verified live:
  - `invite-launch-plate.png`
  - `scorecard-atmosphere-plate-v3.png`
  - `settlement-ornament-v3.png`
- Required QA:
  - `node --check app/js/app.js` ✅
  - `node --check app/js/views.js` ✅
  - `bash scripts/run-trip-flow-smoke.sh` ✅
  - `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae` ✅
  - `bash scripts/check-scramble-board.sh https://betwaggle.com demo-scramble augusta-scramble` ✅

## Start With
“Continue BetWaggle Ralph loop — Phase 3 side-game score-entry workflow for scramble, then Phase 4 settlement ceremony.”
