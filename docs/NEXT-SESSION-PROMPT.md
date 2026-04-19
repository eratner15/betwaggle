# Next Session Prompt — Copy/Paste This

## Image Agent Handoff — April 18, 2026

### Current Product Goal
- Sell Waggle first as the premium scramble companion.
- Make the product sticky enough that scramble users want to use it for their normal weekly golf game.
- The working frame is: think like a gambler, a golfer, and a computer scientist at the same time.

### Hard Rule For Image Work
- All readable words, numbers, player names, scores, labels, and buttons must stay in HTML/CSS.
- Generated images are decorative only.
- No fake UI text inside images.
- No logos, no signage, no scoreboards, no watermarks.

### Assets Already Generated
- `/home/eratner/betwaggle/app/assets/trip-shell-hero-plate.png`
- `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate.png`
- `/home/eratner/betwaggle/app/assets/settlement-lounge-plate.png`
- `/home/eratner/betwaggle/app/assets/ledger-paper-texture.png`

### Where These Assets Belong
- `trip-shell-hero-plate.png`
  Use behind the pre-round trip hero on the outing dashboard.
  Keep text centered/left in live UI.
- `scorecard-atmosphere-plate.png`
  Use behind the live scoring shell and premium scorecard surfaces.
  Important: keep the center quiet enough for live scoring overlays.
- `settlement-lounge-plate.png`
  Use behind the empty / pre-settlement state and light settlement lounge sections.
  Apply a strong overlay so background details never compete with text.
- `ledger-paper-texture.png`
  Use as subtle texture on app surfaces and cards.

### What Still Needs Image Work
- A more abstract version of the settlement lounge plate with even less edge detail.
- A scoreboard / clubhouse table plate designed specifically for “round complete” and “share results” states.
- Optional mobile-specific crop variants if the desktop-wide plates feel too scenic on narrow screens.

### New Highest-Priority Image Queue
- `share-card-hero-plate`
  Purpose: background plate for exported settlement/share card moments and event social previews.
  Mood: expensive, calm after the action, clubhouse-table energy, ivory/navy/brass, restrained.
  Rules: no readable text, no scoreboards, no receipts, no logos.
  Placement: wide enough for 1200x630 social preview and also usable inside exported settlement visuals.
  Save target: `/home/eratner/betwaggle/app/assets/share-card-hero-plate.png`

- `settlement-ceremony-ornament-v3`
  Purpose: more premium ceremonial topper than the current ornament for the final-results overlay.
  Mood: trophy-room / brass / private-club detailing, elegant not loud.
  Rules: no letters, numbers, shields, badges, logos, or fake crests.
  Placement: transparent-ish or dark-background friendly accent for top-center overlay use.
  Save target: `/home/eratner/betwaggle/app/assets/settlement-ornament-v3.png`

- `invite-launch-plate`
  Purpose: decorative image for the post-create “You’re Live” launch/share surface.
  Mood: first-tee anticipation, premium itinerary energy, polished but not busy.
  Rules: no UI, no phone mockups, no words, no signage.
  Placement: mobile-first crop with quiet center space for HTML text and CTAs.
  Save target: `/home/eratner/betwaggle/app/assets/invite-launch-plate.png`

- `scorecard-atmosphere-plate-v3`
  Purpose: a score-screen variant with cleaner left-side negative space and stronger composition on mobile.
  Mood: live scoring desk, scorebook, clubhouse tabletop, subtle tension.
  Rules: no printed score text, no numbers, no logos.
  Placement: especially for `390x844`; keep center/right text area readable.
  Save target: `/home/eratner/betwaggle/app/assets/scorecard-atmosphere-plate-v3.png`

### Product Direction For New Images
- Premium private-club atmosphere.
- Luxury, editorial, cinematic, restrained.
- Navy / ivory / brass / muted green.
- Should feel like high-stakes golf energy without looking like a casino app.
- The image should make the product feel expensive, but the UI should still do the talking.

### Screens To Check After Any New Image Drop
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#dashboard`
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#scorecard`
- `https://betwaggle.com/blue-monster-at-trump-national-doral-apr-753cae/#settle`

### Mobile QA Requirement
- Test on `390x844`.
- Verify readability in the hero, scorecard, and settlement screens.
- If any image reduces contrast or makes the shell feel busy, back it off immediately with stronger overlays.
- New check: event share/OG art should still look premium when cropped to `1200x630`.

## Prompt:

We are building betwaggle.com — a social golf betting platform. Continue the Scramble Product rebuild.

Read the scramble plan at /home/eratner/betwaggle/docs/SCRAMBLE-PLAN.md (will be created) and the stitch card prototype at /home/eratner/betwaggle/.stitch-cards/scramble.html for the target design.

## What's Already Done:
- Phase 1 (demo seed): CTP on holes 3/7/12/17, LD on 5/14, prize pool $1,600, 14/18 holes scored
- 4-tab nav: Home | Score | The Bar | Settle (working)
- Lobby slimmed: no H2H spreads or props on home tab
- The Bar: Opening Lines + Props + Outright Winner show pre-game
- Course + tee selection wired with tee picker
- Weekend Warrior free (bypasses Stripe)
- Settlement with ceremony + progress bar
- FL outreach: 50 emails sent

## What's Left — Scramble Product:

### Phase 2: Premium Leaderboard Visual (HIGH PRIORITY)
- Redesign `renderScrambleLeaderboard()` in views.js (line 948) to match .stitch-cards/scramble.html
- Deep forest green (#1B3022) header with Playfair Display, team score in large type, LIVE badge
- Team cards: ivory background, gold left-border for top 3, rank badge, expandable hole-by-hole
- Prize pool visualization: "1st $800 / 2nd $400 / 3rd $240" in gold
- CTP/LD panels: Heritage styling, green checkmark for won holes, gold "TBD" for upcoming
- Remove fake odds/betting from scramble teams — scramble is prize-pool, not betting

### Phase 3: CTP/LD Backend + Score Entry
- Extend POST /hole endpoint to accept {ctp, ld} optional fields
- CTP prompt on par 3 holes: "Who hit closest?" player picker
- LD prompt on LD holes: "Who hit longest?" player picker
- Save to gameState.sideGames

### Phase 4: Scramble Settlement
- Scramble-specific settlement branch in renderSettlement
- Prize pool distribution by position
- CTP/LD winners announced
- Share card with team standings

### Phase 5: Create Flow Polish
- Prize pool config in create wizard
- Payout structure selector
- CTP/LD hole picker
- QR code generation on event creation

## Critical Rules:
- views.js, app.js, betting.js are chmod 444 — unlock before editing, lock after
- wrangler.jsonc MUST have `routing: { run_worker_first: true }` inside `assets`
- Verify brace balance (opens == closes) before EVERY deploy of views.js
- Use GPT-4o image generation for decorative UI assets only; keep all readable text in HTML/CSS
- Test on 390x844 viewport
- Deploy command: `source ~/.nvm/nvm.sh && nvm use 20 && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx wrangler deploy`

## Key Files:
- `app/js/views.js` — renderScrambleLeaderboard (line 948), CTP/LD panels (line 1323), renderSettlement (line 6813)
- `app/js/app.js` — scramble mode routing, isScrambleMode
- `worker.js` — POST /hole (line 8309), wggRunScramble (line 7056)
- `worker-seeds.js` — seedDemoScramble (line 124)
- `.stitch-cards/scramble.html` — premium design prototype (TARGET)
- `create/index.html` — create flow
- `emails/outreach/cold-sequence-charity-scramble.html` — what we're promising

## Heritage Design Tokens:
- Deep Forest Green: #1B3022
- Burnished Gold: #C5A059
- Ivory Linen: #FCF9F4
- Neon Betting Green: #39FF14 (LIVE indicators only)
- Font Display: 'Playfair Display', serif
- Font Body: 'Inter', sans-serif
- Font Mono: 'SF Mono', monospace

## Start with:
"Continue Scramble rebuild — Phase 2: Premium leaderboard visual upgrade"
