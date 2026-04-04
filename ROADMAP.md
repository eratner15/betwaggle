# Waggle Product Roadmap

**Updated:** 2026-04-04
**North Star:** The #1 social golf betting platform. 500 paying events/month at $32/event = $16K MRR.

---

## What Works Today (shipped this session)

- Create flow: Players → Course (17K DB + API enrichment) → Games → Launch (3 steps, 24KB)
- Score entry: inline number picker, offline-first, auto-advance
- 11 game engines: Nassau, Skins, Wolf, Vegas, Stableford, Match Play, Banker, BBB, Bloodsome, Nines, Scramble
- All game cards render on dashboard with live updates
- Settlement: all 11 games settle, net = $0 invariant
- Course database: 17K courses, 34 with full scorecards, API cache-through for 30K+
- Design system: navy/gold/ivory, consistent across all views
- The Bar: betting lines, H2H spreads, prop bets

---

## Phase 1: Make the Core Bulletproof (THIS WEEK)

The workflow works. Now make it feel great.

### 1.1 Course Data (1 day)
- [ ] Set GOLF_COURSE_API_KEY secret (unlocks 30K courses with auto-enrichment)
- [ ] When user selects course without scorecard, show "Loading scorecard..." then auto-enrich
- [ ] Let users enter/edit pars manually on the dashboard if scorecard is wrong
- [ ] User-entered pars save back to D1 for everyone

### 1.2 Score Entry Polish (1 day)
- [ ] Number picker: bigger buttons (56px), par highlighted in gold, tap-to-select
- [ ] Auto-advance to next player after entering score (not just next hole)
- [ ] Haptic feedback on score entry (already coded, verify on phone)
- [ ] "Undo Last Hole" button visible and working
- [ ] Birdie/eagle/bogey color flash on score entry

### 1.3 Game Cards During Play (1 day)
- [ ] Nassau: show "X UP thru Y" not just raw numbers
- [ ] Skins: show running pot value in dollars, not just multiplier
- [ ] Wolf: show whose turn it is to be wolf next
- [ ] All cards: show dollar amounts based on stakes, not just points
- [ ] Cards animate when state changes (score just entered)

### 1.4 Settlement Polish (half day)
- [ ] Per-game breakdown with dollar amounts
- [ ] "Who owes who" ledger with Venmo/CashApp deep links
- [ ] Share settlement card as image
- [ ] Verify net = $0 on screen (show the check)

---

## Phase 2: Viral Growth Engine (NEXT WEEK)

The product works. Now make it spread.

### 2.1 Invite Flow
- [ ] After creating outing, show "Share with your group" screen
- [ ] Copy link, iMessage, WhatsApp share buttons
- [ ] Invite link: betwaggle.com/join/{slug}
- [ ] Invited players see the group, can add themselves, pick identity

### 2.2 Settlement as Viral Loop
- [ ] Settlement card is the #1 shareable artifact
- [ ] Beautiful card: course name, date, final standings, who owes who
- [ ] "Powered by Waggle — Create your own at betwaggle.com/create/"
- [ ] Venmo deep links: venmo://paycharge?txn=pay&recipients={user}&amount={amount}

### 2.3 Demo That Sells
- [ ] Homepage demo: interactive scorecard that auto-plays
- [ ] Pick a hole, see scores animate, see game cards update
- [ ] "That's real-time. Create your own →" CTA at the end
- [ ] Demo uses real engine (not fake data)

---

## Phase 3: Content + SEO (WEEK 3)

### 3.1 Game Guide Pages (/games/*)
- [ ] 14 pages already built, verify all links work
- [ ] Add JSON-LD (FAQPage + HowTo) to each
- [ ] Email capture at bottom of each page
- [ ] Internal links to /create/ with ?format= parameter

### 3.2 Email Pipeline
- [ ] Email capture on homepage, /games/, /courses/
- [ ] 5-email drip via Resend (welcome, nassau guide, course feature, trip guide, last nudge)
- [ ] Cron trigger: daily check for drip sends

### 3.3 Course Directory (/courses/)
- [ ] Course pages with full scorecard display
- [ ] "Play this course on Waggle" CTA
- [ ] SEO: "{course name} scorecard slope rating" pages

---

## Phase 4: Revenue ($32/outing) (WEEK 4)

### 4.1 Stripe Integration
- [ ] Free tier: unlimited casual rounds, all game formats
- [ ] Paid tier ($32/outing): GHIN auto-lookup, AI pairings, live odds, settlement
- [ ] Checkout flow: create → pay → play
- [ ] Stripe webhook: activate event on successful payment

### 4.2 Affiliate Program
- [ ] /affiliates/ signup page
- [ ] 3 tiers: Starter (25%), Pro (31%), Ambassador (37%)
- [ ] Ref tracking: ?ref= parameter on /create/
- [ ] 4-level MLM structure (per TODOS.md spec)
- [ ] Affiliate dashboard with earnings

---

## Phase 5: Advanced Features (MONTH 2)

### 5.1 Live Odds Engine
- [ ] Real-time win probability based on current scores + handicaps
- [ ] Odds update after every hole
- [ ] Moneyline, spread, over/under for each matchup
- [ ] "The Bar" becomes a live sportsbook during play

### 5.2 AI Features
- [ ] AI-powered pairings (balance handicaps for fair matches)
- [ ] AI round recap (narrative summary of the round)
- [ ] AI betting advisor (suggest bets based on matchups)

### 5.3 Multi-Round Events
- [ ] Buddies trips: 2-4 rounds over a weekend
- [ ] Running totals across rounds
- [ ] Course changes per round
- [ ] Leaderboard evolution

### 5.4 Member-Guest / Tournament
- [ ] Flighted match play
- [ ] Bracket visualization
- [ ] Calcutta auction
- [ ] Live leaderboard TV mode

---

## Technical Debt (ongoing)

- [ ] Replace 4-digit PIN with proper auth (passphrase + crypto.subtle)
- [ ] Add CSP headers to all responses
- [ ] Eliminate remaining innerHTML (196 occurrences)
- [ ] Lock down CORS on admin-bearing API endpoints
- [ ] Add D1 migrations directory
- [ ] Split worker.js into router + handler modules
- [ ] Remove remaining "BetWaggle" references in email templates

---

## Metrics to Track

| Metric | Current | Target (30 days) |
|--------|---------|-------------------|
| Events created | ~5 test | 50 real |
| Rounds completed (18 holes) | 0 real | 20 |
| Course search → select rate | Unknown | 80% |
| Score entry completion (start → 18) | Unknown | 60% |
| Settlement shared | 0 | 10 |
| Paid events ($32) | 0 | 5 |
| Email captures | ~7 | 200 |
