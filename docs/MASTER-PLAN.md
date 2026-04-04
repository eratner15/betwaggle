# Waggle Master Plan — Next Session
## Written: April 3, 2026 11:55pm EST

---

## THE SITUATION

We ran a massive 2-day sprint with Paperclip/Codex agents + Claude Code. The agents produced 231+ issues but also broke critical files — views.js, app.js, betting.js, wrangler.jsonc, index.html, and courses/index.html all had to be reverted. The agents also created 100+ junk inventory/report files bloating the repo.

The product works functionally but the visual flow is inconsistent. Some screens have Heritage design, some don't. The trip page hero was fixed but the identity picker, scorecard, and settlement still look basic. The outreach engine works (email delivered to inbox) but we're not sending until the product looks premium.

## GROUND RULES FOR NEXT SESSION

1. **NO PAPERCLIP AGENTS touching code.** Agents broke the site 4 times today. They can do content (emails, docs) and QA (read-only reports) but ZERO code writes.
2. **One screen at a time.** Deploy. Verify on mobile. Next screen.
3. **Brace balance check** before every deploy of views.js.
4. **Lock files** (chmod 444) after every deploy.
5. **No side tasks.** Homepage, then create flow, then gameplay, then settlement. In order.

---

## PHASE 1: STABILIZE (do first, ~30 min)

### 1.1 Clean up agent junk files
The agents created 100+ inventory/report CSVs and MDs that are deployed as static assets.

```bash
# Delete all agent-generated inventory and report files
rm -rf inventory/ reports/ ops-*.csv
rm -f test-resend-domain.js
rm -f tests/delta_demo.js
rm -f ads-private/index.html gtm-private/index.html marketing-private/index.html
# Keep: docs/reports/ (useful audits), data/ (leads), scripts/ (tools)
```

### 1.2 Verify every page loads
Run this check and fix any that fail:
```
/ /create/ /pricing/ /tour/ /overview/ /courses/ /pro/ /affiliates/ 
/walkthrough/ /my-events/ /demo/ /demo-buddies/ /demo-scramble/
/demo-skins/ /demo-nassau/ /demo-wolf/ /demo-match-play/
/games/ /games/nassau/ /games/skins/ /games/wolf/
/cards/skins/ /cards/nassau/ /cards/wolf/ /cards/match-play/ /cards/scramble/
```

### 1.3 Verify JS modules load without errors
```bash
# In browser console on any demo page:
import('/app/js/app.js').then(() => 'OK').catch(e => 'ERROR: ' + e.message)
```
If ERROR: revert the broken file to commit 3c58397 (last known working).

### 1.4 Revert any remaining agent-damaged files
Files agents commonly break. Check each one:
- `app/js/views.js` — brace balance must be equal
- `app/js/app.js` — brace balance must be equal  
- `app/js/betting.js` — brace balance must be equal
- `worker.js` — check routing still works
- `wrangler.jsonc` — must have `routing: { run_worker_first: true }` inside `assets`
- `app/css/styles.css` — check mobile breakpoints not broken

### 1.5 Lock protected files
```bash
chmod 444 app/js/views.js app/js/app.js app/js/betting.js wrangler.jsonc
```

---

## PHASE 2: PREMIUM FLOW — Screen by Screen (~3-4 hours)

### Screen 1: Trip Page (pre-game — what opens when you tap the event link)

**Current state:** Hero is fixed (dark green, no stripes). Start Scoring button is gold. Course section has Heritage header. Player cards have Heritage treatment with Playfair names and gold odds.

**Still needs:**
- Identity picker ("Who are you?") — redesign as dark overlay with large tappable player name cards instead of plain white modal
- Games section — show active games as Heritage badge pills (gold borders, not plain text)
- Trash Talk — dark card with gold accent and styled input
- Add Player — collapse GHIN search into a "+" FAB, not inline at page bottom
- "Share This Page" button — Heritage gold outlined button

**Files:** `app/js/views.js` (renderTripPage + renderNamePickerModal)

### Screen 2: Quick Start (create flow after picking Weekend Warrior)

**Current state:** Dark sportsbook theme works. GHIN search, course search, game cards, OPEN THE BOOK button all functional.

**Still needs:**
- Remove big empty gap between GHIN search and textarea
- Tighten "OR TYPE NAMES BELOW" divider — just a thin gold line
- Player preview — horizontal scrollable chips instead of 2-column grid
- Game cards — brighter gold border on selected, subtle on unselected
- Course search — show selected course as a mini Heritage card
- Reduce total scroll distance
- OPEN THE BOOK button — slightly larger, add subtle pulse animation

**Files:** `create/index.html` (renderQuickStartOverlay)

### Screen 3: Dashboard (during gameplay — the 4-hour screen)

**Current state:** Heritage headers on game panels (Skins/Nassau/Wolf). Heritage "The Field" header with Playfair player names and gold odds chips.

**Still needs:**
- Compact header — event name + course in one line at top, pot as gold badge. Remove the big hero card during gameplay.
- Leaderboard — flash gold on score updates (CSS animation class)
- Score entry FAB — 64px gold circle with "+" icon, bottom-right, always visible
- Tab bar icons — add small icons next to "The Board" and "Settle"
- Game panels — verify all panels render correctly with Heritage design
- Live feed section — if it exists, style with Heritage cards

**Files:** `app/js/views.js` (renderDashboard, the main gameplay render)

### Screen 4: Score Entry

**Current state:** Plain white background, functional but not premium.

**Still needs:**
- Dark green background (#1B3022) with ivory text
- Hole number in Playfair Display 24px: "HOLE 7"
- Par + yardage in gold: "PAR 4 · 385 yds"
- Score buttons as large circles (64px):
  - Eagle: gold (#C5A059) with sparkle border
  - Birdie: green (#16A34A) with glow
  - Par: ivory/neutral
  - Bogey: subtle red tint
  - Double+: dark red
- Auto-advance countdown ring after selection
- Hole progress strip at top (18 circles, color-coded)

**Files:** `app/js/views.js` (score entry section in renderCasualScorecard)

### Screen 5: Settlement

**Current state:** Shows "Settlement available after all holes are scored" with a plain box when round is incomplete. Settlement ceremony code exists but may not render correctly.

**Still needs:**
- Incomplete round: Heritage progress bar showing "12 of 18 holes" with gold fill
- Complete round: dark overlay ceremony → staggered player reveals → confetti on winner
- Settlement card: Playfair event name, standings with amounts, green/red for +/-
- Venmo/CashApp pay buttons (56px, branded colors)
- Share button: "Drop this in the group chat" with gold outline
- "Create Your Own Event" referral CTA

**Files:** `app/js/views.js` (renderSettlement)

### Screen 6: The Bar (Betting)

**Current state:** Unknown — need to verify.

**Still needs:**
- Dark green background
- Matchups as Heritage cards (two players facing each other)
- Odds as gold tappable chips — tap adds to bet slip
- Bet slip slides up from bottom with gold accent
- Running bet total in header
- "Place Bet" gold button (56px)

**Files:** `app/js/views.js` (renderBetting)

### Screen 7: Walkthrough (/walkthrough/)

**Current state:** Built but needs mobile verification.

**Still needs:**
- Verify all 10 slides render at 390px
- Timer bar visible and gold
- Progress dots highlight correctly
- Auto-advance works (5s per slide)
- CTA buttons link correctly

**Files:** `walkthrough/index.html` (verify only)

---

## PHASE 3: CLEANUP (~30 min)

### 3.1 Run /simplify on the codebase
Review code for reuse, dead code, and quality issues.

### 3.2 Delete unused files
- All `inventory/*.csv` and `inventory/*.md` files (agent junk)
- All `reports/*.csv` and `reports/*.md` duplicates
- `ads-private/`, `gtm-private/`, `marketing-private/` directories
- Stitch zip files
- Zone.Identifier files (Windows artifacts)
- Test screenshots (390x844-*.png, current_board.png, elite_scramble_*.png)

### 3.3 Update .assetsignore
Add patterns to prevent agent junk from deploying:
```
inventory/
reports/
*.csv
*-private/
*.zip
*.Zone.Identifier
```

### 3.4 Update .gitignore
Add patterns to prevent committing junk:
```
inventory/
reports/
*-private/
*.Zone.Identifier
```

### 3.5 Final git push
One clean commit with all cleanup.

---

## PHASE 4: OUTREACH LAUNCH (after product is premium)

### 4.1 Final product review
Open each screen on a real phone. Every screen must feel premium.

### 4.2 Set up betwaggle.com in Resend (or verify Cloudflare Email)
Need emails to come from evan@betwaggle.com, not cafecito-ai.com.

### 4.3 Send test email to yourself
Verify delivery, check spam score, review copy.

### 4.4 Send FL campaign (50 courses)
```bash
curl -s -X POST "https://betwaggle.com/api/admin/outreach/send" \
  -H "Content-Type: application/json" \
  -d '{"pin":"4321","state":"FL","template":"cold-sequence-charity-scramble.html","from":"Evan at Waggle <reports@cafecito-ai.com>","leads":[PASTE FL LEADS JSON]}'
```

### 4.5 Monitor results
- Check admin dashboard at betwaggle.com/admin/outreach/
- Day 4: Email 2 auto-sends (drip cron)
- Day 10: Email 3 auto-sends
- Track: opens, clicks, replies, affiliate signups

---

## PHASE 5: PAPERCLIP AGENTS (after everything is stable)

### What agents CAN do:
- Generate more outreach email sequences (content only)
- QA audits (read-only reports — don't commit to repo)
- Course lead enrichment (write to data/ only)
- Social media post generation (write to docs/ only)

### What agents CANNOT do:
- Edit any .js file (views.js, app.js, betting.js, worker.js)
- Edit wrangler.jsonc or .assetsignore
- Edit index.html or any HTML page
- Create _redirects or _headers files
- Create files in the root directory

### Protected files (chmod 444):
- wrangler.jsonc
- app/js/views.js
- app/js/app.js
- app/js/betting.js

---

## SUMMARY: Next Session Checklist

- [ ] Phase 1: Stabilize (clean junk, verify pages, lock files)
- [ ] Screen 1: Trip page (identity picker, games badges, trash talk)
- [ ] Screen 2: Quick Start (spacing, player chips, course card)
- [ ] Screen 3: Dashboard (compact header, score FAB, leaderboard flash)
- [ ] Screen 4: Score entry (dark bg, color-coded circles)
- [ ] Screen 5: Settlement (ceremony, share card, Venmo)
- [ ] Screen 6: The Bar (gold odds chips, bet slip)
- [ ] Screen 7: Walkthrough (verify)
- [ ] Phase 3: Cleanup (delete junk, update ignores)
- [ ] Phase 4: Launch FL outreach (50 courses)
