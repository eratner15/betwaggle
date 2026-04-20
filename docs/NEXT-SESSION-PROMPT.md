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
- `index.html`, `brand-mark.svg`, `og-card-home.svg`, `app/og-image.svg`, `share/og-share.svg`, `app/index.html`
  Homepage / brand pass shipped:
  - new premium clubhouse hero image in `app/assets/home-hero-clubhouse-plate.png`
  - new code-native BetWaggle brand mark
  - refreshed homepage metadata + root mobile share image
  - refreshed app/share OG cards
  - app header now uses the new SVG mark instead of the old raster logo

- `app/js/views.js`, `app/js/app.js`, `app/js/sync.js`, `worker.js`, `worker-seeds.js`
  Phase 3 — Scramble Score-Entry + Side-Game Workflow shipped:
  - inline CTP / LD panel inside `renderScrambleScoreEntry` (team chips + Defer + Clear + post-hole Commit)
  - server-side normalization of side-game state to `{status, winnerLabel, updatedAt, updatedBy, note?}` with legacy string back-compat
  - new admin `POST /:slug/api/side-game` endpoint for post-hole corrections / deferred resolution / reset
  - board side-game rail now shows Awarded / Deferred / Open / Waiting pills + admin "Resolve" button
  - settlement "On-course honors" card splits Awarded vs Unresolved with a "Resolve now" CTA for admins
  - `submitHoleScores` carries optional `sideGameExtras` so a single hole POST covers scores + CTP/LD
  - offline mutation replay preserves staged side-game extras
  - augusta-scramble seed gets its own `scrambleSideGames` config + mixed awarded/deferred demo state
  - `scripts/check-scramble-sidegames.sh` smoke asserts the deployed client + server surfaces

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
- `app/js/views.js`
  scramble settlement/share upgrade shipped:
  - premium incomplete settlement lounge
  - official final money-board hero
  - stronger champion + purse framing
  - screenshot-oriented scramble share card in HTML/CSS
  - stronger weekly replay CTA
- `app/js/app.js`
  scramble settlement share text now uses scramble-specific standings / purse / honors copy
- `scripts/check-scramble-settlement.sh`
  added mobile settlement regression coverage for:
  - `demo-scramble`
  - `augusta-scramble`
  - share-card sizing + screenshots

## Current Scores
- `Trip-ready: 96%`
- `Premium: 93%`

## What Improved
- Homepage now feels materially more premium and less like an old stock-photo landing page.
- Brand is sharper on both the homepage and app shell.
- Root mobile share previews now align with the premium product direction.
- The scramble board feels more like a premium destination and less like a prototype stack.
- Purse, pressure, and side-game state are readable much earlier on mobile.
- The broken invite/hero image state is fixed because the missing art is now live.
- Scramble settlement now feels materially more ceremonial on mobile.
- The final Augusta scramble result is now screenshot-worthy instead of reading like a plain payout list.
- The repo now has targeted mobile validation for scramble settlement and share-card composition.

## What Still Feels Weak
- Older low-priority surfaces still reference `logo.jpg`; the top-level brand surfaces are fixed, but cleanup is not exhaustive.
- Real-device outdoor validation still missing for the side-game chip flow (tap target + glare read).
- Commissioner "Resolve" button on the board currently routes to the scorecard — a modal-less inline resolver directly on the rail would save a tap.
- Augusta-scramble demo data only picks up the new seed once the existing KV config is wiped; live Augusta still shows zero CTP/LD until a re-seed or manual admin side-game POST.
- Phase 4 settlement is close but payout phrasing / CSV export still have room to tighten.
- Shared primitives exist in CSS, but round/tournament still do not consume enough of them.
- The Bar still needs a premium hierarchy pass.

## Highest-Leverage Next Pass
Do this in order:

1. `Real-device outdoor QA for side-game flow`
   - run demo-scramble side-game flow on a real iPhone under direct sun
   - verify chip tap targets, glare read, Defer affordance, Commit update affordance
   - log any readability or tap-target gaps, fix and redeploy

2. `Inline board resolver`
   - replace the scorecard-hop "Resolve" path with an inline resolver inside the board side-game rail
   - one-tap award from the rail, no navigation
   - keep deferred pills visible until resolved

3. `Phase 4 — Scramble settlement final polish`
   - tighten payout phrasing / CSV export
   - improve any remaining awkward spacing from real-device checks
   - keep the share card screenshot-first and premium

4. `Cross-format cleanup`
   - promote useful scramble primitives into shared board/settlement primitives where safe
   - keep scramble-specific composition where needed

## Image Asset State
- Already live:
  - `/home/eratner/betwaggle/app/assets/home-hero-clubhouse-plate.png`
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
  - `bash scripts/check-scramble-settlement.sh https://betwaggle.com demo-scramble augusta-scramble`

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
- Homepage verification:
  - `https://betwaggle.com/?v=brandpass2` mobile Playwright check ✅
  - `/brand-mark.svg` returns `200` ✅
  - `/og-card-home.svg` returns `200` ✅
  - `/app/assets/home-hero-clubhouse-plate.png` returns `200` ✅
- Asset URLs verified live:
  - `home-hero-clubhouse-plate.png`
  - `invite-launch-plate.png`
  - `scorecard-atmosphere-plate-v3.png`
  - `settlement-ornament-v3.png`
- Required QA:
  - `node --check app/js/app.js` ✅
  - `node --check app/js/views.js` ✅
  - `bash scripts/run-trip-flow-smoke.sh` ✅
  - `bash scripts/check-share-surfaces.sh https://betwaggle.com blue-monster-at-trump-national-doral-apr-753cae` ✅
  - `bash scripts/check-scramble-board.sh https://betwaggle.com demo-scramble augusta-scramble` ✅
  - `bash scripts/check-scramble-settlement.sh https://betwaggle.com demo-scramble augusta-scramble` ✅

## Start With
"Continue BetWaggle Ralph loop — real-device outdoor QA for the scramble side-game chip flow, then build an inline board resolver so commissioners award CTP/LD without navigating away from the rail."
