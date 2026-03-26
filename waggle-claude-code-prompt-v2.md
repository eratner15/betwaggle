# Claude Code Prompt: Waggle Site Overhaul — CSS/UX + SEO Content Hub + Email Pipeline + Affiliates

**Copy this entire prompt into Claude Code. Run with `--dangerously-skip-permissions` for speed.**

---

## Context

You are working on the Waggle golf sportsbook web app. There are TWO deployments that must stay in sync:
- **betwaggle.com** (primary domain)
- **cafecito-ai.com/waggle/** (subdirectory deployment)

Both are deployed via Cloudflare Workers. The tech stack is pure HTML/CSS/JS (no frameworks). The design system uses: Playfair Display for headings, coral/seafoam/navy/gold/ivory palette. Mobile-first, 56px touch targets. Asset budget: 600KB max. Offline-first service worker.

### Existing Pages (audit all of these — they exist at both domains):
- `/` — Landing page (index.html) with pricing, how-it-works, game format table
- `/courses/` — Course directory (30K+ US courses with par, slope, rating, stroke index)
- `/demo/` — Interactive demo (Cabot Citrus Invitational — full sportsbook experience)
- `/create/` — Event creation flow
- `/overview/` — GM Operations Guide (comprehensive: quick start, taking bets, entering scores, managing the book, line management, player management, settlement, troubleshooting, end of tournament, house rules)

### The Book
The founder wrote **"Peel & Eat: The Gentleman's Guide to Golf Betting & Scorekeeping"** covering detailed rules, strategies, etiquette, and scoring for every game format. We will mine this content to build an SEO content hub. The book covers:
- **Section 1: The Setup** — Welcome, etiquette, how to structure wagers
- **Section 2: The Classics** — Nassau (with 3-player, 4-player, nested variations, pressing strategy), Skins, Wolf, Vegas, Bingo Bango Bongo, Bloodsome, Banker/Quota, Stableford, Match Play
- **Section 3: Weekend Warrior Formats** — Simplified versions of the classics
- **Section 4: The Art of War** — Pressing strategy, defensive maneuvers, reading opponents, mathematical break-even points, the bluff press
- **Section 6: Settlement & Etiquette** — Digital payments, dispute resolution, gentleman's agreements
- **Section 7: The Digital Frontier** — The future of golf gambling (references the app)

---

## Mission: Four Workstreams

---

### WORKSTREAM 1: Homepage CSS/UX Overhaul

#### A. Hero Section — Restructure CTAs
- **Primary CTA:** "See It Live →" (links to /demo/) — this is the money button. Make it visually dominant. Gold background, navy text, large.
- **Secondary CTA:** "Create Your Outing" (links to /create/) — smaller, outlined style, below or beside the primary.
- Keep the headline: "Run Your Golf Trip Like a Vegas Sportsbook."
- **Update the subhead.** Remove "$29" from the hero. New subhead: "Live odds on every phone, scores update hole by hole, settlement is automatic."
- Add a subtle animated mock of the sportsbook interface in the hero (CSS-only or lightweight SVG showing score tickers, not heavy JS)

#### B. Feature Highlight Section (Replaces Social Proof)
Instead of testimonials (we don't have them yet), build a **two-feature hero strip** immediately below the hero that highlights our two biggest differentiators:

**Feature 1: 30,000+ Courses Preloaded**
- Visual: Stylized search bar mockup or course card showing a real course (e.g., "TPC Sawgrass — Stadium Course · Par 72 · Slope 155 · Rating 76.4")
- Copy: "Every course in America. Full scorecards with par, stroke index, slope, and rating for every tee. Search your course, set up your match — done."
- CTA: "Find Your Course →" linking to /courses/

**Feature 2: GHIN Handicap Auto-Pull**
- Visual: Mockup showing a GHIN number input field → auto-populated handicap index (e.g., "GHIN #1234567 → Handicap Index: 14.2 · Course Handicap: 16")
- Copy: "Enter a GHIN number, get their official handicap index instantly. No typing scores, no guessing, no sandbaggers. Lines are set from real data."
- CTA: "Create Your Outing →" linking to /create/

Design these as side-by-side cards on desktop, stacked on mobile. Use the navy background with ivory text for this section to create visual contrast from the hero.

#### C. Pricing Section — Critical Updates
- **Change $29 to $32** everywhere. The price must be divisible by 4 (for splitting among a foursome: $8/person).
- Update the Buddies Trip tier: "$32 per outing" (not "per event")
- Add subtext under the price: "That's $8/person for a foursome · $4/person for groups of 8"
- Rename "Create Your Tournament" → "Create Your Outing" on all CTA buttons
- Add FAQ accordion below pricing:
  - "What counts as one outing?" → "One outing covers your entire weekend — unlimited rounds, all game formats, all players. Set it up once, play all trip."
  - "Do all players need to pay?" → "No. One person pays $32 and sets up the outing. Everyone else joins free via a shared link."
  - "Can I try it free first?" → "Yes. Free rounds include all 8 game formats with live scoring. The paid tier adds GHIN auto-lookup, AI pairings, live betting odds, and the settlement card."
  - "What happens if we lose cell service?" → "The app caches everything offline. Scores, bets, and standings are saved locally and sync when signal returns."
- Style the FAQ with existing design system (navy headers, ivory background, gold accents, smooth expand/collapse animation)

#### D. Game Format Table — Expandable Cards
Replace flat table with expandable cards:
- **Collapsed:** Game name + one-line description + player count badge (e.g., "2-4 players")
- **Expanded:** 3-4 sentence rules summary, "Best for:" tag, one strategy tip, link to full guide: "Read the full guide →" (links to /games/{name}/)
- Each card gets a simple SVG icon or emoji placeholder
- Smooth CSS transition on expand/collapse

#### E. Footer / Navigation / Brand Cleanup
- **Consolidate brand name: "Waggle" everywhere.** Remove any "BetWaggle" references from footer, nav, anywhere.
- Footer attribution: "Waggle by [Cafecito AI](https://cafecito-ai.com/)"
- Add footer links:
  - "Game Guides" → /games/
  - "Find a Course" → /courses/
  - "See It Live" → /demo/
  - "Create Your Outing" → /create/
  - "GM Guide" → /overview/
  - "Affiliates" → /affiliates/
  - "From the book: *Peel & Eat*" → Amazon link (placeholder URL for now)

#### F. Global CSS Fixes
- Body text minimum 16px on mobile, 18px on desktop content pages
- Consistent 8px spacing grid (8, 16, 24, 32, 48, 64, 96)
- Smooth scroll for anchor links
- Hover/focus states on all interactive elements
- Lazy-load images below the fold
- Skip-to-content link for accessibility
- WCAG AA color contrast on all text
- Verify service worker doesn't interfere with new pages

#### G. Demo Page Link Fix
The demo page at `/demo/` currently links back to betwaggle.com in the header "Create your own event →". Ensure this link and the logo link point to the correct relative path for whichever deployment it's on (betwaggle.com vs cafecito-ai.com/waggle/).

---

### WORKSTREAM 2: Email Capture + Drip Pipeline

#### A. Email Capture Points

**Point 1: Free Tier Gate**
Before starting a free round at /create/, show a one-field email capture:
- "Enter your email to set up your free round"
- Checkbox (pre-checked): "Get weekly golf betting tips from Peel & Eat"
- Submit button: "Start My Round →"
- This is NOT a hard gate — add a small "Skip" link below for people who refuse. But make the email field prominent.

**Point 2: Game Guide Pages (SEO Hub)**
At the bottom of every /games/{name}/ page, before the final CTA:
- "Get the complete strategy guide in your inbox"
- Email field + "Send Me the Guide →"
- This delivers a one-time email with a PDF/summary of that game's rules + strategy from the book, then adds them to the drip sequence.

**Point 3: Course Directory**
After someone searches for a course on /courses/ and views the scorecard:
- Subtle inline prompt: "Planning an outing at [Course Name]? Get setup tips for your group."
- Email field + "Send Tips →"

#### B. Email Storage — Cloudflare KV
Store captured emails in Cloudflare Workers KV:
```
KV Namespace: WAGGLE_EMAILS
Key format: email:{email_address}
Value: JSON {
  email: string,
  source: "free_round" | "game_guide" | "course_search",
  game_interest: string | null,  // e.g., "nassau" if from a game guide page
  course_interest: string | null, // e.g., "TPC Sawgrass" if from course search
  opted_in_newsletter: boolean,
  created_at: ISO timestamp,
  converted: boolean  // flipped to true when they create a paid outing
}
```

Add a Worker endpoint: `POST /api/email-capture` that validates the email, stores it in KV, and triggers the welcome email.

#### C. Email Sending — Resend Integration
Use **Resend** (resend.com) for transactional and drip emails. It works natively with Cloudflare Workers and has a generous free tier (3,000 emails/month).

**Setup:**
1. Create Resend account, verify betwaggle.com domain
2. Add Resend API key as a Cloudflare Worker secret: `RESEND_API_KEY`
3. Send via Resend REST API from the Worker

**Email Sequence:**

**Email 1: Welcome (immediate, triggered on capture)**
- Subject: "Your golf group is about to get serious"
- From: tips@betwaggle.com
- Content: Brief intro to Waggle, link to the demo, one quick game recommendation based on their source (if from a game guide page, recommend that game; if from course search, mention that course). CTA: "See It Live →"

**Email 2: Game Spotlight (Day 3)**
- Subject: "The Nassau: Why every golf trip needs this game"
- Content: 200-word summary of Nassau from the book, with a link to the full /games/nassau/ guide. End with: "Score your Nassau automatically → Create Your Outing"

**Email 3: GHIN + Course Feature (Day 7)**
- Subject: "We already loaded your course's scorecard"
- Content: Highlight the 30K courses + GHIN auto-pull features. If we know their course interest from KV, mention it by name. CTA: "Find [Course Name] and set up your outing →"

**Email 4: Trip Planning (Day 14)**
- Subject: "Your buddy trip is in [X] weeks — here's the game plan"
- Content: Link to /games/golf-trip-betting-guide/. Recommend a 3-game combo (Nassau + Skins + Wolf). CTA: "Create Your Outing — $32 for the whole weekend →"

**Email 5: Last Nudge (Day 21)**
- Subject: "The group chat isn't a scoreboard"
- Content: Short, punchy. Reiterate the pain point. Link to demo. CTA: "See It Live → then Create Your Outing"

**Implementation notes:**
- Store the email sequence step in KV alongside the email record (e.g., `drip_step: 1`)
- Use a Cloudflare Workers Cron Trigger (scheduled worker) that runs daily, queries KV for emails due for the next drip step, and sends via Resend
- Include an unsubscribe link in every email (Resend handles this, but also honor it in KV by setting `opted_in_newsletter: false`)
- Track opens/clicks via Resend's built-in analytics

---

### WORKSTREAM 3: Affiliate Section

Build an affiliate/partnership page at `/affiliates/` targeting golf trip organizers, golf content creators, course pros, and tournament directors.

#### Page Content:

**H1:** "Partner with Waggle — Earn on Every Outing"

**Intro paragraph:** "You're already the person who organizes the trip, picks the games, and settles the bets. Now get paid for it. Waggle's affiliate program pays you for every paid outing created through your link."

**How It Works (3 steps):**
1. "Sign up for a free affiliate link"
2. "Share it with your group, your followers, or your members"
3. "Earn $8 for every paid outing created through your link" (that's 25% of $32)

**Affiliate Tiers:**

| Tier | Requirement | Commission | Extras |
|------|------------|------------|--------|
| Starter | Sign up | $8 per outing (25%) | Personal tracking link |
| Pro | 10+ outings/month | $10 per outing (31%) | Custom landing page, priority support |
| Ambassador | 50+ outings/month | $12 per outing (37%) | Co-branded materials, featured on site |

**Target Audiences (expandable cards):**

**For Golf Trip Organizers:**
"You're already doing the work. Get the credit. Share your Waggle link when you text the group 'who's in for Bandon?' and earn on every outing."

**For Golf Content Creators / Influencers:**
"Review Waggle on your channel. Show the demo. Drop your affiliate link. Earn every time one of your viewers creates an outing."

**For Course Pros & Tournament Directors:**
"Offer Waggle as a turnkey sportsbook for your member-guest or club championship. We handle the tech. You handle the experience. Earn on every event."

**For Golf League Organizers:**
"Weekly leagues with automated scoring and settlement. Set it up once, earn on every week's outing."

**Affiliate Signup Form:**
- Name
- Email
- How will you promote Waggle? (dropdown: "I organize trips", "I create content", "I'm a course pro", "I run a league", "Other")
- Website/social URL (optional)
- Submit → "Apply for Affiliate Access"
- Store in KV namespace `WAGGLE_AFFILIATES` and send notification email to admin

**Technical:**
- Affiliate links format: `betwaggle.com/create/?ref={affiliate_id}`
- Track `ref` parameter in the create flow, store it with the outing record
- Affiliate dashboard (future — for now, just track in KV and send monthly reports manually)

**SEO targeting:** "golf affiliate program", "golf betting affiliate", "golf trip organizer"

---

### WORKSTREAM 4: SEO Content Hub — /games/ Section

Build a content hub at /games/ that ranks for golf betting search terms.

#### Architecture:
```
/games/                          ← Hub index page
/games/nassau/                   ← Individual game guide
/games/skins/
/games/wolf/
/games/vegas/
/games/bingo-bango-bongo/
/games/bloodsome/
/games/banker/
/games/stableford/
/games/match-play/
/games/best-ball-golf-betting/   ← Format guide
/games/3-player-golf-games/      ← Player count guide
/games/4-player-golf-games/
/games/golf-trip-betting-guide/  ← Evergreen guide
```

#### Each game page (/games/{name}/) must include:

1. **H1 targeting primary keyword:** e.g., "Nassau Golf Betting Game: Rules, Strategy & Scoring"
2. **Meta description** (155 chars max) with keyword + CTA
3. **Structured data** (JSON-LD): FAQPage schema + HowTo schema
4. **Content sections:**
   - What is {Game}? (2-3 paragraphs for beginners)
   - How to Play (step-by-step, numbered)
   - Scoring & Settlement (with examples, tables where helpful)
   - Strategy Tips (2-3 actionable tips from book's Section 4)
   - Variations (player count variations, common house rules)
   - FAQ (4-6 questions targeting long-tail keywords)
   - Email capture: "Get the complete {Game} strategy guide → [email field]"
   - CTA: "Score your {Game} automatically → See It Live"
5. **Internal links:** Link to 2-3 related games, hub, /create/, /demo/
6. **Breadcrumbs:** Home > Games > {Game Name}
7. **Sticky TOC:** Sidebar on desktop, collapsible dropdown on mobile
8. **Read time estimate** in header

#### Content Source from the Book (rewrite in your own voice, don't copy verbatim):

**NASSAU** — The Trinity (front 9, back 9, overall), pressing (automatic vs manual, stacking, 2-down trigger), $5-5-5 escalation examples, 3-player/4-player/nested variations, press strategy (momentum shifts, power holes, 9th/18th tee leverage)

**WOLF** — Rotation and selection dynamics, Lone Wolf option and payout multipliers, social/psychological dimension, 3-player variant

**VEGAS** — Two-digit number scoring (lower = tens place), volatility from 10+ scores, "flip" rule for birdie, consistent partnership importance

**SKINS** — Carryover mechanics, validation rules, democratic format, gross vs net variations

**BANKER/QUOTA** — Point system (System A vs B), quota calculation from handicap, great for mixed-handicap groups

**BLOODSOME** — Opposing team picks which ball, "Serious" vs "Friendly" modes, etiquette on selection timing

**BINGO BANGO BONGO** — Three points per hole (first on green, closest to pin, first in hole), great equalizer, order of play matters

**STABLEFORD** — Points system, anti-blowup philosophy, Modified Stableford variations

**MATCH PLAY** — Hole-by-hole combat, dormie, concessions, when to play aggressively vs conservatively

#### Hub Index Page (/games/):
- H1: "Golf Betting Games: Complete Rules & Strategy Guide"
- Intro mentioning Peel & Eat as authority source
- Grid of game cards (icon, name, 1-line, player count badge, "Read Guide →")
- "Which game should you play?" quiz/filter: player count → skill similarity → action level
- "Popular combinations" section: "The Classic Trip: Nassau + Skins + Wolf"
- CTA: "Stop reading, start playing → Create Your Outing"

#### Guide Pages:
- `/games/golf-trip-betting-guide/` — "The Ultimate Golf Trip Betting Guide" (game selection, group management, settlement etiquette, dispute resolution)
- `/games/3-player-golf-games/` — Which formats work for threesomes
- `/games/4-player-golf-games/` — Full foursome lineup
- `/games/best-ball-golf-betting/` — Best ball and team format explainer

---

### CSS Design System for Content Pages

```css
:root {
  --content-max-width: 720px;
  --sidebar-width: 240px;
  --reading-font: 'Georgia', 'Times New Roman', serif;
  --heading-font: 'Playfair Display', serif;
  --color-coral: #E8735A;
  --color-seafoam: #7ECEC1;
  --color-navy: #1B2B4B;
  --color-gold: #C4A35A;
  --color-ivory: #FAF8F5;
  --color-text: #2D3748;
  --color-text-muted: #718096;
  --spacing-unit: 8px;
}
```

- Body text: 18px Georgia, line-height 1.7 on content pages
- Pull quotes: left gold border, italic serif
- Strategy callout boxes: seafoam background, navy text, gold icon
- Breadcrumbs: small, muted, top of page
- TOC: sticky sidebar on desktop (top: 96px), collapsible dropdown on mobile
- CTA banners between content sections: gold button on navy background
- Email capture forms: match the section they're in, not jarring

---

### SEO Technical Requirements

For every page in /games/ and /affiliates/:
- Canonical URL
- Open Graph tags (og:title, og:description, og:image)
- Updated sitemap.xml with all new URLs
- robots.txt allows /games/ and /affiliates/
- Page load <2s on 3G — no heavy JS, inline critical CSS
- JSON-LD: FAQPage + HowTo schema per game page
- Internal linking: every game page → 2-3 related games + hub + /create/ + /demo/
- Homepage game cards → each game's guide page

---

### Deployment & Routing

The Cloudflare Worker must serve these new routes:
- `/games/*` — content hub pages
- `/affiliates/` — affiliate page
- `/api/email-capture` — POST endpoint for email collection
- `/api/affiliate-signup` — POST endpoint for affiliate applications

Ensure the Worker routing handles both:
- `betwaggle.com/games/nassau/`
- `cafecito-ai.com/waggle/games/nassau/`

---

### Priority Execution Order

1. **Email capture + KV storage + Resend welcome email** (highest ROI — start collecting emails immediately)
2. **Homepage overhaul** (hero CTAs, feature strip with 30K courses + GHIN, pricing to $32, FAQ, game cards, brand cleanup)
3. **Content page CSS design system** (content.css + shared components for /games/ pages)
4. **Hub index page** (/games/)
5. **Nassau guide** (highest search volume)
6. **Skins guide**
7. **Wolf guide**
8. **Remaining game guides** (Vegas, BBB, Bloodsome, Banker, Stableford, Match Play)
9. **Aggregate guides** (3-player, 4-player, trip guide, best ball)
10. **Affiliate page** (/affiliates/)
11. **Email drip sequence** (Cron Trigger + remaining 4 emails)
12. **Technical SEO** (sitemap, schema, OG images, robots.txt)
13. **Cloudflare Worker routing** for all new paths
14. **Lighthouse audit** — target 90+ performance, accessibility, SEO on all pages

---

### Verification Checklist

After building everything:
- [ ] All pages render at 375px, 768px, 1440px
- [ ] Price shows $32 everywhere (not $29)
- [ ] All CTAs say "See It Live" (primary) and "Create Your Outing" (secondary)
- [ ] No "BetWaggle" text anywhere on the site
- [ ] Email capture works and stores to KV
- [ ] Resend welcome email fires on capture
- [ ] Affiliate signup form submits to KV
- [ ] JSON-LD validates at https://search.google.com/test/rich-results
- [ ] Sitemap.xml includes all new URLs
- [ ] Internal links work (no 404s)
- [ ] /demo/ links point to correct relative paths on both domains
- [ ] Service worker caches new pages
- [ ] OG tags render correctly (https://www.opengraph.xyz/)
- [ ] Lighthouse 90+ on performance, accessibility, SEO
- [ ] Course directory and GHIN features prominently highlighted
- [ ] FAQ accordion works with smooth animation
- [ ] Game cards expand/collapse correctly
- [ ] Affiliate page loads and form submits
