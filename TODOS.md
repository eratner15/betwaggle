# Waggle — Master TODO List
## Updated: 2026-04-04

---

## SESSION RECAP (Apr 4, 2026) — REBUILD SESSION

### What Shipped (1 session, ~15 deploys)

**Core Workflow (the engine)**
- [x] AUDIT.md — full codebase audit, all 17 Codex findings verified
- [x] DESIGN.md — locked design system (navy/gold/ivory, Playfair/Georgia)
- [x] WORKFLOW-SPEC.md — Players → Course → Games → Score → Calculate → Settle
- [x] ROADMAP.md — 5-phase product roadmap

**Create Flow (rebuilt from scratch)**
- [x] New 3-step create page (525 lines / 24KB, was 2,948 / 185KB)
- [x] Format selector: Round | Scramble | Tournament
- [x] GPS course detection ("Find My Course" uses geolocation + reverse geocode)
- [x] GHIN name search with auto-populated handicaps
- [x] Manual quick-add (name + HI + Enter)
- [x] AI game suggestion based on player count + handicap spread
- [x] Invite screen after launch (copy link, share, then start scoring)

**Course Database**
- [x] 17,223 US courses imported to D1 from open dataset
- [x] 34+ courses with full scorecards (par, stroke index per hole)
- [x] GolfCourseAPI key set — 30K+ courses accessible via auto-enrichment
- [x] Cache-through: search D1 → API fallback → save to D1 for next time
- [x] Course enrichment endpoint: fetches scorecard from API when selecting unknown course
- [x] GPS nearby search: reverse geocode + D1 city search
- [x] Turnberry Isle manually corrected (now "JW Marriott Turnberry Isle", Soffer Course par 70)

**Score Entry**
- [x] 3 missing functions added: inlineScoreInput, inlineScoreSaveAttempt, openScoreComposer
- [x] Offline state structure fixed (writes .scores correctly)
- [x] Undo sends null instead of 0
- [x] Casual scorecard now has "Open the Book" button → inline score entry
- [x] Premium scorecard null-safe for courses without par data (defaults to par 72)

**Game Engine**
- [x] All 11 server engines verified working (Nassau, Skins, Wolf, Vegas, Stableford, Match Play, Banker, BBB, Bloodsome, Nines, Scramble)
- [x] All 12 game cards render on dashboard (6 new cards added)
- [x] Settlement handles all 11 games (added Vegas, Nines, Scramble PnL)
- [x] Full 18-hole scoring test on Pebble Beach with real handicap calculations verified

**Design**
- [x] All old green (#1A472A, #0D2818, #1B3022) replaced with navy (#1B2B4B, #0F1A2E) across ALL files
- [x] Game cards: dark "Trading Floor" mode with electric green +$ amounts
- [x] Dark mode rolled out to all event pages (toggle button + localStorage persistence)
- [x] Homepage: navy palette, "See It Live" / "Create Your Outing" CTAs
- [x] The Bar redesigned: light readable cards, H2H spreads, dollar amounts
- [x] Microcopy: "Open the Book", "The Ledger", "Lock It In"
- [x] Electric green (#22C55E) for money amounts, bright red (#EF4444) for losses

**Infrastructure**
- [x] workers_dev: false in production (Codex Finding #16)
- [x] run_worker_first: false — static assets served directly by CDN
- [x] Asset URLs changed from /:slug/js/ to /app/js/ with cache busting
- [x] CORS catch-all locked to origin whitelist
- [x] 4 dead directories archived (b/, cards/, mclemore/, .stitch-cards/)
- [x] 7 redundant logos deleted, references updated in all files
- [x] Bet tally "$0 staked" flash eliminated
- [x] Sync triggers on all data-showing tabs (dashboard, scorecard, settle)
- [x] Zone.Identifier artifacts cleaned

---

## P0: MUST FIX (blocks revenue or breaks UX)

### Payment Verification
- [ ] Test Stripe checkout end-to-end (create, pay $32, event activates)
- [ ] Test Stripe webhook fires on real payment (test mode)
- [ ] Verify promo codes work: FIRSTTRIP, FREETRIAL, GOLF2026, BUDDIES
- [ ] Switch Stripe from test to live mode (need sk_live_ key)

### Email Verification
- [ ] Verify Resend domain is verified for betwaggle.com
- [ ] Test welcome email actually delivers to a real inbox
- [ ] Test drip sequence fires on correct schedule (Day 0/3/7/14/21)
- [ ] Set up hello@betwaggle.com email routing in Cloudflare

### Critical Bugs
- [ ] Vegas team assignment: no way to set teams in the create flow
- [ ] Wolf: no partner selection UI during play (only server-side engine exists)
- [ ] Private docs still exposed at /marketing-private/, /gtm-private/, /ads-private/
- [ ] Course data: 17K courses but most without scorecards — need batch enrichment cron

---

## P1: HIGH PRIORITY (this week)

### Score Entry Polish
- [ ] Number picker: bigger buttons (56px), par highlighted in gold
- [ ] Auto-advance to next player within a hole (not just next hole)
- [ ] "Undo Last Hole" button visible and working from scorecard tab
- [ ] Color flash animation on birdie/eagle entry

### Game Cards During Play
- [ ] Nassau: show "X UP thru Y" not just raw numbers
- [ ] Wolf: show whose turn to be wolf, partner selection UI
- [ ] All cards: show running P&L in dollars next to player names
- [ ] Cards animate when state changes (new score entered)

### Settlement Polish
- [ ] Per-game dollar breakdown (not just totals)
- [ ] Share settlement card as image (canvas render)
- [ ] Verify net = $0 on screen with visual check mark

### Course Data
- [ ] Set up Cloudflare cron to batch-enrich 100 courses/day from GolfCourseAPI
- [ ] User-entered pars save back to D1 for community benefit
- [ ] "Report incorrect data" button on course selection

---

## P2: MEDIUM PRIORITY (next week)

### Viral Growth
- [ ] Settlement card as shareable image with "Powered by Waggle" branding
- [ ] Interactive homepage demo that uses real engine
- [ ] "Invite a buddy" flow from within active event

### SEO
- [ ] JSON-LD structured data on /games/ pages (FAQPage + HowTo)
- [ ] Submit sitemap to Google Search Console
- [ ] Course directory pages with scorecard display + "Play here on Waggle" CTA

### Revenue
- [ ] Stripe live mode ($32/outing checkout)
- [ ] Affiliate signup flow at /affiliates/
- [ ] Ref tracking: ?ref= parameter on /create/

---

## P3: FUTURE SPRINTS

- [ ] WebSocket real-time push (replace 30s polling)
- [ ] AI settlement narrative ("Julian took the skin on 7 with a clutch birdie...")
- [ ] Push notifications for score updates
- [ ] Season/league standings across events
- [ ] Multi-round buddies trips (2-4 rounds over a weekend)
- [ ] Member-Guest flighted match play
- [ ] Calcutta auction
- [ ] Live leaderboard TV mode
- [ ] 4-level MLM affiliate program (spec in AFFILIATE-MLM section below)

---

## AFFILIATE MLM (Multi-Level Referral Program)

Build a 4-level deep referral commission structure for course pro affiliates. When a pro refers another pro, the original pro earns commission on their referrals too, up to 4 levels deep.

**Structure:**
- Level 1 (direct referral): Full affiliate commission (25-37% depending on tier)
- Level 2 (your referral's referral): 10% of the outing fee
- Level 3: 5% of the outing fee
- Level 4: 2% of the outing fee

**Schema changes needed:**
- [ ] Add `referred_by` column to affiliates table (references parent affiliate ID)
- [ ] Add `referral_depth` column (1-4, how deep in the chain)
- [ ] Add `referral_chain` column (JSON array of affiliate IDs from root to this node)
- [ ] Create `affiliate_commissions` table: affiliate_id, source_event_slug, level, amount_cents, status, created_at

**Implementation:**
- [ ] When a new affiliate signs up via `?ref=ABC123`, store `referred_by = ABC123`
- [ ] On each paid outing, walk the referral chain up to 4 levels and create commission records
- [ ] Affiliate dashboard shows: direct earnings + network earnings by level
- [ ] "Your Network" view: tree visualization of downstream affiliates + their performance
- [ ] Payout system: aggregate all commission levels into single payout requests

---

## TECHNICAL DEBT

- [ ] Replace 4-digit admin PIN with proper auth (passphrase + crypto.subtle)
- [ ] Add CSP headers to all responses
- [ ] Eliminate remaining innerHTML (196 occurrences across 21 files)
- [ ] Lock down 35 inline CORS * headers on individual endpoints
- [ ] Add D1 migrations directory with numbered SQL files
- [ ] Split worker.js into router + handler modules (10,715 lines)
- [ ] Remove remaining "BetWaggle" references in email templates (~600 occurrences)

---

## KEYS AND SECRETS

- [x] GOLF_COURSE_API_KEY — set ✓
- [ ] WAGGLE_MARKETING_PIN — check Cloudflare Workers dashboard
- [ ] Google Ads account ID (replace AW-PLACEHOLDER)
- [ ] Meta Pixel ID (replace PIXEL_PLACEHOLDER)
- [ ] hello@betwaggle.com — configure Cloudflare Email Routing
- [ ] Stripe live mode key (currently test mode)
