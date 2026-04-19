# Waggle — Master TODO List
## Updated: 2026-04-18

---

## CURRENT WORKPLAN (Apr 18, 2026) — ACTIVE SOURCE OF TRUTH

### Mission
- Make Waggle the premium product for scrambles.
- Use that scramble experience to pull users into weekly recurring golf games.
- Build the product through three lenses at once:
  - gambler: sweat, stakes, action, reasons to keep checking
  - golfer: native to a real round, fast, obvious, social
  - computer scientist: reliable, legible, mobile-first, low-friction

### What Is Already True
- Production is deployed from this repo.
- Route guards and checkout fallbacks are working.
- Create flow has a stronger default path and deep-links into scoring.
- Post-create launch now lands on a premium invite suite instead of a utility card stack.
- Trip dashboard hero now gives a cleaner first-tee handoff: identity, scoring, bar, and sharing are visible without dead ends.
- Share-surface QA now checks the new invite identity handoff and replay loop copy on production.
- Blue Monster mobile shell has been upgraded:
  - premium top shell in `worker.js`
  - stronger trip hero in `renderTripPage()`
  - better scoring entry state in `renderCasualScorecard()`
  - better empty settlement state in `renderSettlement()`
- The repo now has generated decorative image assets in `app/assets/`.
- All readable text must stay in HTML/CSS, never inside generated images.

### P0 — Launch Blockers
- [ ] Run one real end-to-end paid Stripe checkout and verify the post-payment flow on production.
- [ ] Verify a real share/settlement flow from a live outing with at least 3 players on mobile.
- [ ] Verify one real scramble outing from create → invite → scoring → settle → share with no manual intervention.
- [ ] Confirm production no longer exposes any junk or private artifacts after recent deploy filters.
- [ ] Tighten `wrangler` / asset routing uncertainty so Worker-first behavior is explicit and trusted.
- [ ] Run one real mobile create flow in outdoor conditions and confirm the new invite suite reads cleanly under glare.

### P1 — Premium Product Pass

#### 1. Image Integration
- [x] Wire `app/assets/trip-shell-hero-plate.png` / `trip-shell-hero-plate-v2.png` into the trip hero and create launch suite.
- [ ] Wire `app/assets/scorecard-atmosphere-plate.png` into live scoring surfaces.
- [ ] Wire `app/assets/settlement-lounge-plate.png` into settlement lounge surfaces with strong overlay.
- [ ] Wire `app/assets/ledger-paper-texture.png` into cards and app surfaces.
- [ ] Audit and wire `app/assets/share-card-hero-plate.png` into settlement/share/OG surfaces now that the file exists locally.
- [ ] QA all image-backed screens on `390x844` and back off any image that reduces contrast or looks busy.

#### 2. Shell / Navigation
- [ ] Refine the live outing shell in `worker.js` so the header and bottom nav feel custom, not app-shell boilerplate.
- [ ] Make active states feel more premium and less generic.
- [ ] Add better transition polish between Home / Score / Settle.
- [ ] Reduce visual conflict between top nav pills and bottom nav pill.

#### 3. Score Entry Delight
- [ ] Add stronger “posted” feedback after every score save.
- [ ] Make score posting feel rewarding with tighter animation, haptic rhythm, and clear next action.
- [ ] Improve round-progress signals during scoring so users know exactly where the action is.
- [ ] Add a more premium “round complete” moment before settlement.

#### 4. Settlement Premium Pass
- [ ] Improve incomplete-round settlement states so they still feel alive and worth checking.
- [ ] Make the completed settlement card more screenshot-worthy and chat-worthy.
- [ ] Tighten payout rows, winner framing, and “who pays who” legibility.
- [ ] Make “share results” and “run it back” feel like primary social actions.

### P1 — Retention / Habit Loop

#### 5. Weekly Game Conversion
- [ ] Reframe “Create Your Own Scramble” into “Start a Weekly Game From This Group.”
- [ ] Add recurring-use cues on trip hero, settlement, and share flows.
- [ ] Build a clearer “same group, faster setup next time” pathway.
- [ ] Make the post-round modal explicitly suggest replaying with the same group.
- [ ] Add one “weekly game” template path in create flow for 3-4 regulars.
- [ ] Make the weekly invite path feel as premium as the trip launch suite instead of a clone-flow variant.

#### 6. Scramble → Weekly Product Bridge
- [ ] Keep scramble product feeling special and event-worthy.
- [ ] Keep weekly product feeling lighter, faster, and more habitual.
- [ ] Build shared primitives so one UX family serves both.
- [ ] Decide which games should be default for scrambles vs weekly rounds.

### P1 — Core UX / Product Strategy

#### 7. Gambler Lens
- [ ] Show stakes clearly everywhere they matter.
- [ ] Surface momentum swings and live edge changes more clearly.
- [ ] Make side games easier to understand at a glance.
- [ ] Ensure every score entry changes the perceived state of the board.

#### 8. Golfer Lens
- [ ] Reduce anything that feels like admin software.
- [ ] Keep taps minimal during a real round.
- [ ] Use golf-native wording, pacing, and hierarchy.
- [ ] Make players feel like they are checking “the card” or “the action,” not filling out a form.

#### 9. Computer Scientist Lens
- [ ] Keep flows resilient under poor course connectivity.
- [ ] Reduce chances of ambiguous state after score submissions.
- [ ] Expand browser smoke coverage for high-value mobile flows.
- [ ] Add one deterministic regression test for create → score → settle UI assumptions.

### P2 — Testing / Verification
- [ ] Add a visual mobile QA script for the Blue Monster outing and one scramble seed.
- [ ] Add a smoke for signed-in score entry, not only API scoring.
- [ ] Add a smoke for settlement share card render.
- [ ] Add a smoke for the “weekly game from this group” conversion path once built.
- [x] Keep `scripts/check-share-surfaces.sh` aligned with live invite/share copy so premium regressions get caught.

### P2 — Image Agent Backlog
- [ ] Generate a quieter settlement plate with less edge detail.
- [ ] Generate mobile-specific crops if current scenic plates feel too wide on phone.
- [ ] Generate one premium empty-state illustration for “waiting for first tee.”
- [ ] Generate one social-share / result-card atmosphere plate if the current card still feels too template-like.
- [ ] Generate `app/assets/invite-launch-plate.png` so the launch suite stops borrowing the trip hero asset.

### Apr 18 Pass Notes
- Shipped:
  - `create/index.html` now renders a premium launch suite with stronger hierarchy, share box, next-step ceremony, and a darker field card.
  - `app/js/views.js` trip hero now uses the newer plate, exposes identity/share/bar/scoring actions sooner, and feels more like the clubhouse home base.
  - `scripts/check-share-surfaces.sh` now validates the new launch copy instead of the removed chip row.
- Still weak:
  - Settlement and share artifacts still do not feel expensive enough to sell the product from a screenshot alone.
  - The weekly replay path is functional but still lighter and less desirable than the trip path.
  - The Bar still needs a premium hierarchy pass and cleaner identity handling.
- Next pass should attack:
  - settlement/share card composition plus `share-card-hero-plate.png` wiring
  - then The Bar market hierarchy and in-place identity flow
- Real-world validation still needed:
  - one actual host using the new create → invite → board handoff on mobile
  - one real group finishing settlement and sharing results from the live board

### P2 — Growth / Sales Readiness
- [ ] Clarify scramble pricing and organizer ROI in the create flow.
- [ ] Build one polished scramble sales deck / one-pager using the new product visuals.
- [ ] Capture better screenshots/GIFs from the improved mobile product for outreach.
- [ ] Tighten the homepage and demo so they match the live premium product quality.

### Working Rules
- [ ] Keep all readable text out of generated images.
- [ ] Verify every premium pass on mobile before calling it done.
- [ ] Prefer one polished flow over many half-finished surfaces.
- [ ] Use Blue Monster as the live reference outing for visual QA.

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
