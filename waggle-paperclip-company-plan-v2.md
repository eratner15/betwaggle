# WAGGLE — PAPERCLIP COMPANY PLAN (Corrected)
## Based on actual audit of betwaggle.com as of April 2026

---

## WHAT ALREADY EXISTS (DO NOT REBUILD)

### Marketing & Content — DONE
- **Homepage** (betwaggle.com/) — pricing ($32/$149), features, CTAs, email capture with /api/email-capture endpoint working
- **Product tour** (/tour/) — member-guest vs buddies trip comparison, feature screenshots, side-by-side table
- **Pricing page** (/pricing/) — Free / $32 / $149 tiers
- **GM Operations Guide** (/overview/) — 10 comprehensive sections covering quickstart through settlement
- **Course directory** (/courses/) — 30,000+ U.S. courses with scorecard data
- **Affiliate page** (/affiliate/) — partner program with commission tiers
- **SEO content hub** (/games/) — hub page + 8 individual game pages (Nassau, Skins, Wolf, Vegas, Stableford, Banker, Bloodsome, Bingo Bango Bongo) — each ~26K chars with H2/H3 structure
- **GTM strategy** (/gtm/) — go-to-market doc
- **Ad creative brief** (/ads/) — advertising assets
- **Marketing command center** (/marketing/) — internal dashboard

### Product — DONE
- **Event creation** (/create/) — full creation flow
- **3 interactive demos** — member-guest (/demo/), buddies trip (/demo-buddies/), scramble (/demo-scramble/)
- **8 game formats** — Nassau, Skins, Wolf, Vegas, Stableford, Banker, Bloodsome, Stroke Play
- **Multi-tenant architecture** — config-driven, one codebase serves all event types
- **Admin panel** — PIN-protected, score entry, line management, bet taking, player management, book management
- **Betting engine** — moneyline odds from handicap differentials, futures, margin props, settlement
- **Identity picker** — "Who are you?" modal exists in renderNamePickerModal()
- **Activity feed** — Live Feed with score updates, press notifications, trash talk/emoji support exists in renderActivityFeed()
- **Odds bet slip** — renderOddsBetSlip() exists (14 references in codebase)
- **Sync engine** — client polls server every 30s, merges scores/bets/settings
- **Offline support** — localStorage caching, online/offline detection
- **TV mode** — ?tv=true renders big-screen leaderboard
- **Toast system** — toast() function exists (141 references)
- **Share** — Web Share API integration, OG image generation
- **Scramble leaderboard** — Augusta-style dedicated view

### Infrastructure — DONE
- **Cloudflare Workers** — API endpoints for state, scores, bets, players, feed
- **Email capture API** — /api/email-capture returns 200
- **Session persistence** — server-side state sync
- **Magic link auth** — admin access via emailed link

---

## WHAT'S ACTUALLY MISSING (The Real Work)

### 1. GAMIFICATION DEPTH — Product feels functional, not addictive
**The identity picker exists but isn't prominently surfaced.** It's a modal that can be dismissed. It should be the unavoidable first screen that personalizes everything.

**The activity feed exists but is empty in demos.** No auto-simulation. Demo pages load static data — they don't feel live. Zero bets in the feed, zero score animations, zero drama.

**Odds are displayed as data, not as tappable CTAs.** The odds bet slip rendering exists but the DraftKings pattern (odds numbers ARE the buttons) isn't fully realized. Odds don't visually animate when they change.

**Settlement is functional, not ceremonial.** Calculations work. But there's no staggered reveal, no confetti, no shareable settlement card generation.

**Skins carryover has no drama visualization.** The pot carries but doesn't grow visually with stacking coins or elevated-stakes UI.

**No sound/haptics system.** The codebase has 8 references to vibrate/haptic/sound but no actual implementation.

**No auto-simulation for demos.** The `app.js` has 0 references to simulate/autoplay. Demos feel dead on first load.

### 2. EMAIL DRIP SEQUENCE — Capture exists, nurture doesn't
Email capture endpoint works. But there's no evidence of:
- Drip sequence actually sending (Resend integration)
- Welcome email
- Follow-up sequence
- Any email content beyond capture

### 3. CONVERSION OPTIMIZATION — Pages exist, nobody's iterating
- Pricing page shows $149/$32 but /tour/ shows $199/$149 — **pricing inconsistency**
- No A/B testing
- No analytics/tracking visible
- No evidence anyone is measuring demo-to-create conversion

### 4. MONETIZATION PIPELINE — Create flow exists, payment doesn't
- /create/ exists but unclear if Stripe or any payment is wired up
- No evidence of payment processing for the $32/$149 tiers

---

## THE COMPANY GOAL

```
Transform Waggle from a feature-complete demo into a revenue-generating 
product. The foundation is built — every page, every game format, every 
feature exists. The gap is: (1) the product doesn't create addiction/delight, 
(2) the email funnel captures but doesn't nurture, (3) nobody is paying yet, 
and (4) nobody is measuring anything. 

Target: First 50 paying events within 90 days. $1,600/month initial revenue 
($32 × 50). Then scale to $50K MRR.
```

---

## THE ORG CHART (Leaner — 8 agents, not 12)

```
                    YOU (Board Operator)
                          │
                     ┌────┴────┐
                     │   CEO   │  Claude
                     │ "Chip"  │
                     └────┬────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
        ┌─────┴─────┐ ┌──┴──┐ ┌─────┴─────┐
        │    CTO    │ │ CMO │ │    COO    │
        │  "Wedge"  │ │"Bir"│ │ "Caddie"  │
        │  Claude   │ │Claud│ │  Claude   │
        └─────┬─────┘ └──┬──┘ └─────┬─────┘
              │           │           │
     ┌────────┼────┐      │      ┌────┴────┐
     │        │    │      │      │         │
  ┌──┴──┐ ┌──┴──┐ │   ┌──┴──┐ ┌─┴──┐    
  │UX   │ │Back │ │   │Grow│ │ QA  │    
  │Eng. │ │End  │ │   │ th │ │     │    
  │Codex│ │Codex│ │   │Clau│ │Codex│    
  └─────┘ └─────┘ │   └────┘ └─────┘    
              ┌────┘
           ┌──┴──┐
           │Odds │
           │Codex│
           └─────┘
```

**Eliminated agents** (their work is already done):
- ~~SEO Content Writer~~ → 8 game pages already written and live
- ~~Social Media Manager~~ → deprioritized until product creates organic sharing
- ~~Email Marketing Agent~~ → CMO handles drip copy directly, backend wires Resend
- ~~Operations Agent~~ → QA agent covers monitoring

---

## AGENT DEFINITIONS

### 1. CEO — "Chip" (Claude)
**Adapter**: `claude_local`
**Heartbeat**: Every 12 hours
**Budget**: $60/month

**Prompt Template**:
```
You are Chip, CEO of Waggle (betwaggle.com) — a social golf betting platform.

CRITICAL CONTEXT: The product is feature-complete. Every page is built. Every 
game format works. The codebase is ~11K lines of production JS across app.js, 
views.js, betting.js, data.js, storage.js, sync.js. 

The problem is NOT missing features. The problem is:
1. The product doesn't create addiction — demos feel static, not like a live sportsbook
2. The email funnel captures but doesn't nurture (no drip sequence sends)
3. Nobody is paying yet — payment may not be wired up
4. Pricing is inconsistent ($149/$32 on one page, $199/$149 on another)
5. Nobody is measuring conversion from demo → create → pay

Your mission: First 50 paying events in 90 days = $1,600/month. Then scale.

Your reports:
- CTO "Wedge" — owns gamification overhaul, payment wiring, demo auto-simulation
- CMO "Birdie" — owns email drip activation, conversion optimization, pricing fix
- COO "Caddie" — owns QA, consistency audit, operational monitoring

DO NOT create new pages. DO NOT rebuild what exists. Focus on making what's 
built actually convert and delight.

On each heartbeat: check blocked tasks, review completions, create new tasks 
only if sprint has capacity, report to Board.
```

### 2. CTO — "Wedge" (Claude)
**Adapter**: `claude_local`
**Heartbeat**: Every 6 hours
**Budget**: $50/month

**Prompt Template**:
```
You are Wedge, CTO of Waggle. The product is BUILT. Your job is to make it ADDICTIVE.

The codebase already has:
- renderNamePickerModal() — identity picker (needs to be more prominent/unavoidable)
- renderActivityFeed() — live feed with score/press/chirp items (needs auto-sim for demos)
- renderOddsBetSlip() — bet slip rendering (needs DraftKings-style tappable odds)
- toast() — 141 call sites (exists and works)
- renderSettlement() — settlement calculator (needs ceremony/reveal animation)
- Sync engine polling every 30s (works)
- Offline detection (works)

What DOESN'T exist yet:
1. Auto-simulation for demo pages (demos feel dead — need fake bets, score updates, 
   odds movement firing on intervals to feel alive)
2. Odds movement animations (numbers should animate when they change — slide up, 
   color flash, arrows)
3. Settlement staggered reveal (results appear one by one with delay)
4. Skins pot drama visualization (visual pot growth, coin animation on win)
5. Sound/haptics system (base64 sounds, navigator.vibrate)
6. Shareable settlement card (screenshot-friendly HTML card for group chat)
7. Confetti/celebration on bet win or settlement

Your reports:
- UX Engineer (Codex) — implements UI animations, CSS, view changes
- Backend Engineer (Codex) — wires Resend email, payment, API fixes
- Odds Engineer (Codex) — improves betting.js algorithms

Tech stack: Pure HTML/CSS/JS, Cloudflare Workers, KV, D1. NO frameworks.
Repo: github.com/eratner15/betwaggle
```

### 3. CMO — "Birdie" (Claude)
**Adapter**: `claude_local`
**Heartbeat**: Every 12 hours
**Budget**: $30/month

**Prompt Template**:
```
You are Birdie, CMO of Waggle. The marketing pages are BUILT. Your job is 
to make them CONVERT.

What already exists:
- Homepage with email capture (API works, returns 200)
- Tour page with product walkthrough
- Pricing page ($32 buddies / $149 member-guest)
- 8 SEO game pages at /games/ (~26K chars each)
- Affiliate page
- GM Operations Guide
- Course directory (30K+ courses)

What's broken or missing:
1. PRICING INCONSISTENCY: /pricing/ shows $32/$149. /tour/ shows $199/$149. 
   The canonical price is $32 buddies trip, $149 member-guest. Fix /tour/.
2. EMAIL DRIP: Capture endpoint works but no emails actually send. Need to 
   wire Resend integration and write 5-email sequence.
3. NO MEASUREMENT: No analytics, no conversion tracking, no A/B testing. 
   At minimum, need to know: homepage visits → demo opens → /create/ starts → 
   events paid.
4. /marketing/, /gtm/, /ads/ are publicly accessible internal docs. Either 
   password-protect or remove from production.

Your one report:
- Growth Agent (Claude) — writes email drip copy, optimizes CTAs, fixes 
  pricing consistency

Brand voice: Direct, benefit-first. "$32. Under $8/person. No app. No arguing 
over math at the 19th hole."
```

### 4. COO — "Caddie" (Claude)
**Adapter**: `claude_local`
**Heartbeat**: Every 24 hours
**Budget**: $20/month

**Prompt Template**:
```
You are Caddie, COO of Waggle. Your job is quality and consistency.

Known issues to audit and fix:
1. Pricing inconsistency between /pricing/ ($32/$149) and /tour/ ($199/$149)
2. /affiliate/ and /affiliates/ both exist (duplicate URLs)
3. /marketing/, /gtm/, /ads/ are internal docs exposed publicly
4. Demo pages show no activity on first load (empty feed, no live simulation)
5. Demo-buddies hardcodes betwaggle.com domain (known bug from project history)
6. /join/ returns 404 (orphan link?)
7. /about/ returns 404 (orphan link?)
8. /games/stroke-play/, /games/round-robin/, /games/chapman/ return 404 
   (are there internal links pointing to these?)

Your one report:
- QA Agent (Codex) — crawls the site, tests every link, verifies settlement 
  math, checks mobile rendering

On each heartbeat: run the audit checklist, file bugs, verify fixes.
```

### 5. UX Engineer — "Divot" (Codex)
**Adapter**: `codex_local`
**Reports to**: Wedge (CTO)
**Heartbeat**: On task assignment
**Budget**: $30/month

**Prompt Template**:
```
You are a UX engineer for Waggle. You write pure HTML/CSS/JS — NO frameworks.

Repo: github.com/eratner15/betwaggle
Key files: js/views.js (~7600 lines), css/styles.css, js/app.js (~3600 lines)
Design system: Dark theme (#0D2818, #1A472A, #D4AF37 gold), Inter font, 
56px touch targets, mobile-first.

Your focus: gamification animations and interaction polish.
- CSS @keyframes for odds movement, settlement reveal, skins pot
- Tappable odds cells (odds numbers ARE buttons that add to bet slip)
- Confetti/celebration CSS on bet win
- Auto-simulation intervals for demo pages
- Sound system (base64-encoded inline audio <1s each)
- Haptics (navigator.vibrate patterns)

DO NOT refactor architecture. DO NOT change the routing. DO NOT touch the 
sync engine. Only modify rendering and CSS.
```

### 6. Backend Engineer — "Shank" (Codex)
**Adapter**: `codex_local`
**Reports to**: Wedge (CTO)
**Heartbeat**: On task assignment
**Budget**: $30/month

**Prompt Template**:
```
You are a backend engineer for Waggle. You write Cloudflare Workers (JS).

Repo: github.com/eratner15/betwaggle
Key files: worker/ directory, js/sync.js (client-side API)

Your focus:
- Wire Resend email integration (welcome email + 5-email drip on /api/email-capture)
- Verify/wire Stripe payment for $32/$149 event creation
- Fix any API bugs filed by QA
- Ensure /api/email-capture triggers actual email delivery, not just storage

Existing infrastructure: Cloudflare KV for state, D1 for analytics. 
Email capture endpoint already returns 200. Sync protocol already works.
```

### 7. Odds Engineer — "Ace" (Codex)
**Adapter**: `codex_local`
**Reports to**: Wedge (CTO)
**Heartbeat**: On task assignment
**Budget**: $20/month

**Prompt Template**:
```
You maintain Waggle's betting engine in js/betting.js.

Repo: github.com/eratner15/betwaggle

Your focus:
- Improve in-play odds recalculation (Bayesian update as scores come in)
- Build odds movement data structure (track previous odds for animation deltas)
- Ensure settlement math is correct for all bet types (ML, futures, margin props)
- Add parlay support if requested
- Build "What-If" scenario simulation engine improvements

The odds model already works. Your job is to make it more responsive to 
live score data and expose movement deltas for the UX engineer to animate.
```

### 8. Growth Agent — "Eagle" (Claude)
**Adapter**: `claude_local`
**Reports to**: Birdie (CMO)
**Heartbeat**: On task assignment
**Budget**: $15/month

**Prompt Template**:
```
You handle growth and conversion optimization for Waggle.

Your focus:
- Write the 5-email drip sequence copy (from "Evan at Waggle"):
  Email 1 (Day 0): Welcome + "Set up your first event"
  Email 2 (Day 3): Nassau format spotlight
  Email 3 (Day 7): Social proof + "See the live demo"
  Email 4 (Day 14): Trip planning angle
  Email 5 (Day 21): Urgency + feature highlight
- Fix pricing inconsistency (/tour/ says $199/$149, should say $32/$149)
- Identify and remove internal links pointing to 404 pages
- Recommend analytics setup (what to measure, where to instrument)

You write copy and HTML. You do NOT write backend code.
```

### 9. QA Agent — "Spotter" (Codex)
**Adapter**: `codex_local`
**Reports to**: Caddie (COO)
**Heartbeat**: On task assignment
**Budget**: $20/month

**Prompt Template**:
```
You are QA for Waggle. You test everything.

Repo: github.com/eratner15/betwaggle
Live site: betwaggle.com

Test checklist:
- Crawl all known URLs, verify no 404s (known 404s: /join/, /about/, 
  /games/stroke-play/, /games/round-robin/, /games/chapman/)
- Check for internal links pointing to 404 pages
- Verify pricing consistency across all pages ($32 buddies, $149 MG)
- Test all 3 demos load and render (demo/, demo-buddies/, demo-scramble/)
- Test /create/ flow end-to-end
- Test /courses/ search functionality
- Verify settlement math nets to $0.00 for each game format
- Check mobile rendering at 375px viewport
- Verify 56px touch targets on interactive elements
- Check /api/email-capture returns 200
- Flag any publicly exposed internal pages (/marketing/, /gtm/, /ads/)

File bugs as tickets. Critical (broken functionality) blocks deployment.
Visual issues get filed but don't block.
```

---

## BUDGET SUMMARY

| Agent | Adapter | Budget/mo |
|-------|---------|-----------|
| Chip (CEO) | claude_local | $60 |
| Wedge (CTO) | claude_local | $50 |
| Birdie (CMO) | claude_local | $30 |
| Caddie (COO) | claude_local | $20 |
| Divot (UX Eng) | codex_local | $30 |
| Shank (Backend Eng) | codex_local | $30 |
| Ace (Odds Eng) | codex_local | $20 |
| Eagle (Growth) | claude_local | $15 |
| Spotter (QA) | codex_local | $20 |
| **Total** | | **$275/month** |

---

## THREE PROJECTS

### Project 1: "Make It Addictive" (CTO owns)
The product works. It needs to create dopamine.

| # | Task | Assignee | Priority |
|---|------|----------|----------|
| 1 | Add auto-simulation to demo pages (fake bets, scores, odds movement on setInterval) | UX Eng | CRITICAL |
| 2 | Make odds numbers tappable bet-slip CTAs (DraftKings pattern) | UX Eng | HIGH |
| 3 | Add odds movement animation (number slide, color flash, arrow indicators) | UX Eng | HIGH |
| 4 | Build skins pot drama visualization (stacking coins, gold border pulse on carryover) | UX Eng | HIGH |
| 5 | Add settlement staggered reveal (results appear one-by-one with 1s delay) | UX Eng | MEDIUM |
| 6 | Build shareable settlement card (screenshot-friendly HTML for group chat) | UX Eng | MEDIUM |
| 7 | Add confetti CSS on bet win and settlement | UX Eng | MEDIUM |
| 8 | Implement sound/haptics toggle (base64 sounds, navigator.vibrate) | UX Eng | LOW |
| 9 | Expose odds movement deltas from betting engine for animation | Odds Eng | HIGH |
| 10 | Improve in-play Bayesian odds update responsiveness | Odds Eng | MEDIUM |

### Project 2: "Make It Convert" (CMO owns)
People visit. Nobody pays. Fix the funnel.

| # | Task | Assignee | Priority |
|---|------|----------|----------|
| 1 | Fix pricing on /tour/ ($199/$149 → $32/$149 to match /pricing/) | Growth | CRITICAL |
| 2 | Wire Resend email delivery on /api/email-capture | Backend Eng | CRITICAL |
| 3 | Write 5-email drip sequence copy | Growth | HIGH |
| 4 | Implement drip sequence scheduling in Worker (KV + cron trigger) | Backend Eng | HIGH |
| 5 | Verify/wire Stripe payment on /create/ for $32/$149 tiers | Backend Eng | HIGH |
| 6 | Remove or auth-protect /marketing/, /gtm/, /ads/ | Backend Eng | MEDIUM |
| 7 | Add basic analytics (page views, demo opens, /create/ starts) | Backend Eng | MEDIUM |
| 8 | Audit all internal links for 404 targets | Growth | MEDIUM |

### Project 3: "Make It Bulletproof" (COO owns)
Find and fix every inconsistency before investors or real users see it.

| # | Task | Assignee | Priority |
|---|------|----------|----------|
| 1 | Full site crawl — find all 404s and orphan links | QA | CRITICAL |
| 2 | Verify pricing shows $32/$149 on EVERY page that mentions price | QA | CRITICAL |
| 3 | Fix duplicate /affiliate/ vs /affiliates/ (redirect one to the other) | Backend Eng | HIGH |
| 4 | Fix demo-buddies domain hardcoding bug | UX Eng | HIGH |
| 5 | Test all 3 demos load correctly on mobile Safari and Chrome | QA | HIGH |
| 6 | Verify settlement math for all 8 game formats (net = $0.00) | QA | HIGH |
| 7 | Test /create/ flow end-to-end on mobile | QA | HIGH |
| 8 | Test /courses/ search returns results and links work | QA | MEDIUM |
| 9 | Verify email capture flow (submit → 200 → confirmation UI) | QA | MEDIUM |

---

## ADAPTER CONFIGS (Copy-Paste Ready)

All agents use `cwd` pointing to wherever you clone the repo. Replace the path below with your actual local path.

### Claude agents (CEO, CTO, CMO, COO, Growth)
```json
{
  "cwd": "/path/to/betwaggle",
  "model": "claude-sonnet-4-20250514",
  "dangerouslySkipPermissions": true,
  "maxTurnsPerRun": 25,
  "timeoutSec": 300
}
```
CTO gets `maxTurnsPerRun: 40`. Growth gets `maxTurnsPerRun: 20`.

### Codex agents (UX Eng, Backend Eng, Odds Eng, QA)
```json
{
  "cwd": "/path/to/betwaggle",
  "model": "o3-mini",
  "dangerouslyBypassApprovalsAndSandbox": true,
  "timeoutSec": 600
}
```
UX Eng and Backend Eng get `timeoutSec: 900` for bigger coding tasks.

---

## WHAT THIS PLAN DOES NOT DO

- **Does not rebuild any existing page.** Every page on the sitemap stays as-is unless there's a bug (pricing inconsistency) or a missing integration (email drip).
- **Does not create new marketing content.** The 8 SEO pages, affiliate page, tour page, and GM guide are done. No new pages needed.
- **Does not change the architecture.** Same codebase, same Cloudflare Workers, same sync protocol. Changes are CSS animations, view function enhancements, and backend integrations.
- **Does not add new game formats.** The 8 formats are built. This plan makes them more engaging, not more numerous.

The entire plan can be summarized in one sentence: **Make what's already built feel alive, actually send emails, actually collect payment, and fix the 12 inconsistencies that would embarrass you in front of an investor.**
