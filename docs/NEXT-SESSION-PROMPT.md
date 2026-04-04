# Next Session Prompt — Copy/Paste This

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
- Test on 390x844 viewport
- Deploy command: `source ~/.nvm/nvm.sh && nvm use 20 && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt CLOUDFLARE_API_TOKEN=_aWVT9W6jGvJvfzdRER67eDxmGxrCxILZhqOCdHp CLOUDFLARE_ACCOUNT_ID=f7a9b24f679e1d3952921ee5e72e677e npx wrangler deploy`

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
