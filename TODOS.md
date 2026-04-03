# Waggle — Master TODO List
## Updated: 2026-04-03

---

## SESSION RECAP (Apr 2-3, 2026)

### What Shipped (15 commits, 16,607 lines, 45 files)

**Product**
- [x] Trip page overhaul — readable hero, Start Scoring button, course selector, GHIN lookup
- [x] Quick Start redesign — dark sportsbook theme, GHIN name search, game format cards, course search, live odds preview, "OPEN THE BOOK" gold CTA
- [x] Settlement viral loop — staggered ceremony reveal, shareable card, Venmo/CashApp deep links
- [x] The Bar redesigned — Heritage betting interface with gold odds chips
- [x] Score entry — premium circles (eagle gold, birdie green), haptic feedback, auto-advance
- [x] Tappable odds — DraftKings-style odds-as-buttons pattern
- [x] Odds movement animation — slide, flash, arrows on change
- [x] 18-hole progress strip — color-coded, tap to jump
- [x] Bet confirmation ceremony — gold pulse, haptic, ticket stamp
- [x] 5 premium game cards — Skins, Nassau, Wolf, Match Play, Scramble (Heritage design)
- [x] Demo auto-simulation engine (demo-simulation.js)
- [x] All demo events reseeded with force-reseed endpoint
- [x] Auto-advance on tournament type selection (no extra Continue tap)
- [x] Added Bloodsome + 3-Player 9s to create wizard
- [x] Scramble demo teams renamed (Wolves, Falcons, Mustangs, Vipers)
- [x] 60-second walkthrough at /walkthrough/ for on-course demos

**Marketing Engine**
- [x] /pro/ landing page — course pro specific with affiliate signup, commission calculator
- [x] /admin/outreach/ — campaign management dashboard (PIN protected)
- [x] Course lead database API (import, query by state/segment, stats)
- [x] Outreach email sending via Resend with template resolution
- [x] Affiliate ref code tracking (?ref=ABC123 auto-credits)
- [x] 5 email drip templates (welcome through last-chance)
- [x] 4 outreach templates (scramble pitch, affiliate invite, follow-up, newsletter)
- [x] Cold email sequences (FL charity scrambles, TX corporate outings)
- [x] LinkedIn DM templates + cold call script + voicemail script
- [x] Top 10 objection handling guide
- [x] Master AI prompt for generating more outreach (AFFILIATE-ENGINE-PROMPT.md)
- [x] GTM strategy doc, paid ads strategy, social calendar, ad creatives

**Bug Fixes**
- [x] P0: duplicate currentHole declaration broke ALL event pages (skeleton loading)
- [x] Venue input loses focus on every keystroke
- [x] GHIN lookup field mismatch (handicapIndex vs handicap)
- [x] Course search returns empty (fallback to local DB when API key missing)
- [x] GHIN now searches by last name (most users don't know their GHIN #)
- [x] Calcutta 404 on non-member-guest events
- [x] Stale Playfair Display v37 font preload 404
- [x] AW-PLACEHOLDER / PIXEL_PLACEHOLDER disabled (wasted network requests)
- [x] Tour page pricing fix ($199 to $32/$149)
- [x] Homepage scramble team names (golf terms to mascots)

**Infrastructure**
- [x] Paperclip AI: 14 agents, 87 of 154 issues completed
- [x] Codex agents: switched from Claude, stale sessions cleared, running QA/audit
- [x] Claude Code wrapper for Paperclip (--dangerously-skip-permissions on --print)

**Other Projects**
- [x] Bloop: host-jumps-ahead bug fixed, 5 stickiness features, Passover questions removed
- [x] Lexington: GuidedDemo crash fixed, ESLint safety patch, ErrorBoundary deployed

---

## P0: MUST FIX (blocks revenue or breaks UX)

### Payment Verification
- [ ] Test Stripe checkout end-to-end (create, pay $32, event activates)
- [ ] Test Stripe webhook fires on real payment (test mode)
- [ ] Verify promo codes work: FIRSTTRIP, FREETRIAL, GOLF2026, BUDDIES
- [ ] Test paid tier full flow: create, pay, success page, QR, player joins, score, settle

### Email Verification
- [ ] Verify Resend domain is verified for betwaggle.com
- [ ] Test welcome email actually delivers to a real inbox
- [ ] Test drip sequence fires on correct schedule (Day 0/3/7/14/21)
- [ ] Set up hello@betwaggle.com email routing in Cloudflare

### Critical Bugs (found by Codex audit)
- [ ] Vegas/Banker/Bloodsome bets never settle and remain active
- [ ] Legacy $29 hardcodes in create/index.html and worker.js (should be $32)
- [ ] Private docs still exposed at /marketing-private/, /gtm-private/, /ads-private/

---

## P1: HIGH PRIORITY (drives conversion and growth)

### Course Pro Outreach (Revenue Engine)
- [ ] Import first 500 course leads (FL, TX, AZ, CA, SC, NC, GA)
- [ ] Get GOLF_COURSE_API_KEY to enable 30K+ course search
- [ ] Send first outreach campaign targeting FL scramble season
- [ ] Set WAGGLE_MARKETING_PIN (check Cloudflare dashboard)
- [ ] Generate more state-specific email sequences (SC/NC, CA, GA, NY)
- [ ] Write affiliate welcome email for new signups
- [ ] Create affiliate one-pager PDF for board presentations

### Create Flow Polish
- [ ] GHIN name search: add state filter to narrow results
- [ ] Course search: get Golf Course API key for full 30K+ courses
- [ ] Verify all tournament types work on mobile
- [ ] Improve Quick Start dark theme on real mobile device
- [ ] Add course photo/map when selected

### Homepage A/B Test
- [ ] Add Vegas Sportsbook headline to /b/ page
- [ ] Improve colors/formatting on A variant
- [ ] Add inline email capture
- [ ] Set up split test infrastructure

---

## P2: MEDIUM PRIORITY (product polish)

### Premium Game Card Integration
- [ ] Apply Heritage card design to in-app Skins panel (views.js)
- [ ] Apply Heritage card design to in-app Nassau panel
- [ ] Apply Heritage card design to in-app Wolf panel
- [ ] Apply Heritage card design to in-app Match Play panel
- [ ] Apply Heritage card design to in-app Scramble panel

### SEO and Discovery
- [ ] Add JSON-LD structured data to /games/ pages
- [ ] Submit sitemap to Google Search Console
- [ ] Set up Google Ads with real ID
- [ ] Set up Meta Pixel with real ID

### QA and Consistency
- [ ] Consolidate /affiliate/ and /affiliates/ to one URL
- [ ] Verify pricing $32/$149 on every page
- [ ] Fix internal links pointing to 404s
- [ ] Audit meta tags and OG images
- [ ] Verify 44px+ touch targets
- [ ] Test on real iPhone Safari and Android Chrome

---

## P3: FUTURE SPRINTS

- [ ] WebSocket real-time push (replace 30s polling)
- [ ] AI settlement narrative per player
- [ ] Push notifications for score updates
- [ ] Season/league standings across events
- [ ] Google Analytics / GA4 funnel tracking
- [ ] Stripe subscription for Season Pass
- [ ] Affiliate payout automation
- [ ] Sponsorship integration on leaderboard

---

## PAPERCLIP/CODEX AGENT PROJECTS

### Project 1: QA and Code Review (Spotter + Wedge)
Read code, trace logic, report bugs. No code writing.
- Audit settlement math for all 8 game formats
- Audit Stripe checkout + webhook flow
- Audit email pipeline + drip scheduling
- Crawl all pages for broken links
- Verify pricing consistency
- Security review of recent changes

### Project 2: Outreach Content (Birdie)
Generate marketing content using AFFILIATE-ENGINE-PROMPT.md.
- State-specific cold emails (SC/NC, CA, GA, NY, CO)
- Affiliate welcome email
- One-pager PDF content
- Social media posts for affiliate pros
- Monthly newsletter template

### Project 3: Course Lead Database (Shank)
Build and populate the outreach lead database.
- Scrape top 50 courses per state
- Import via /api/admin/course-leads/import
- Segment: private vs public vs resort
- Build scramble season drip campaign

### Project 4: Operational Audits (Caddie)
Ongoing consistency and quality checks.
- Map every CTA and verify destinations
- Audit mobile touch targets
- Check meta tags and OG images
- Create comprehensive sitemap
- Monitor demo pages

---

## KEYS AND SECRETS NEEDED

- [ ] GOLF_COURSE_API_KEY — enables 30K+ course search
- [ ] WAGGLE_MARKETING_PIN — check Cloudflare Workers dashboard
- [ ] Google Ads account ID (replace AW-PLACEHOLDER)
- [ ] Meta Pixel ID (replace PIXEL_PLACEHOLDER)
- [ ] hello@betwaggle.com — configure Cloudflare Email Routing
- [ ] Stripe live mode key (currently test mode)
