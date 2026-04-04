# WAGGLE MASTER REBUILD — Claude Code Prompt v4 (with gstack)

**Repo: `github.com/eratner15/betwaggle`**
**Deploy: Cloudflare Workers via `wrangler deploy`**

---

## PREREQUISITE: INSTALL GSTACK

Before running ANY part of this prompt, install gstack — Garry Tan's skill pack that turns Claude Code into a structured dev team. This is non-negotiable for this rebuild. The previous 218 commits of unstructured Claude Code sessions created the spaghetti we're now fixing. gstack prevents that from happening again.

```bash
# Install gstack globally
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup

# Also vendor it into the project repo so it persists
cd ~/betwaggle  # or wherever your repo is cloned
cp -Rf ~/.claude/skills/gstack .claude/skills/gstack
rm -rf .claude/skills/gstack/.git
```

Then create or update the project's `CLAUDE.md` file at the repo root:

```markdown
# Waggle — betwaggle.com

## Project
Golf sportsbook web app. Pure HTML/CSS/JS on Cloudflare Workers. No frameworks.
Production URL: https://betwaggle.com
Staging: local via `wrangler dev`
Deploy: `wrangler deploy`

## Skill Routing
When the user's request matches an available skill, ALWAYS invoke it using the Skill tool as your FIRST action.

- Bugs, errors, "why is this broken", 500 errors → /investigate
- QA, test the site, find bugs, "does this work" → /qa
- Ship, deploy, push, create PR → /ship
- Land and monitor production → /land-and-deploy
- Design system, brand, visual polish → /design-consultation or /design-review
- Product ideas, scoping, "is this worth building" → /office-hours
- Code review, check my diff → /review
- Security check, audit → /cso
- Be careful with destructive ops → /careful
- Freeze a directory while debugging → /freeze

## Design System
Colors: navy (#1B2B4B), gold (#C4A35A), coral (#E8735A), seafoam (#7ECEC1), ivory (#FAF8F5)
Typography: Playfair Display (headings), Georgia (body), system sans-serif (UI)
Spacing: 8px grid. Touch targets: 56px minimum. Mobile-first.
Asset budget: 600KB max page weight.

## Critical Invariants
1. Settlement nets to $0.00 across all players, all games, always
2. Price is $32/outing everywhere (divisible by 4: $8/person for a foursome)
3. CTAs: "See It Live" (primary) / "Create Your Outing" (secondary)
4. Brand is "Waggle" — never "BetWaggle"
5. Course search returns results
6. Score entry works: tap cell → enter number → calculations update
7. One logo, top left, links to homepage
8. Works offline via localStorage + service worker
9. Every /games/ page has JSON-LD schema (FAQPage + HowTo)
10. Email capture stores to KV and fires welcome email via Resend

## Available gstack skills
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /design-html, /design-review,
/review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa,
/qa-only, /investigate, /document-release, /codex, /cso, /autoplan,
/careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /retro, /learn

If gstack skills aren't working, run: cd .claude/skills/gstack && ./setup
```

**Verify gstack is working** before proceeding:
```bash
claude
# Then type: /qa
# It should activate the QA skill. If it does, you're ready.
# Exit and proceed with the rebuild.
```

---

## THE SITUATION

The betwaggle.com codebase is spaghetti. 218 commits of incremental Claude Code sessions have produced beautiful individual pages that don't connect. The app has ~28 top-level directories, many orphaned experiments. Core functionality is broken:

- **Course search doesn't auto-populate** on /create/ or /courses/
- **Scoring doesn't work** — you click "Start Scoring" and can't enter anything
- **The dashboard (Game Day page) is messy** — two logos, a staking badge in the top right that says "$0 staked", and a cluttered layout
- **Bets Available looks bad** — the cards are functional but not polished
- **The opening lines on /create/ show handicap spreads** but the GHIN lookup doesn't actually pull from the GHIN API
- **Many directories are dead code**: /b/, /cards/, /mclemore/, /pro/, /register/, /share/, /tour/, /walkthrough/, /partner/ — unclear what's active vs abandoned
- **Both betwaggle.com and cafecito-ai.com/waggle/ must stay in sync** but the demo page hardcodes betwaggle.com links

### CODEX TEARDOWN: 17 Findings (Verified Accurate)

A `/codex` audit confirmed the technical debt is structural, not cosmetic. These findings are **confirmed accurate** and must be addressed in the rebuild:

**Architecture:**
1. `worker.js` is a **520KB god-object** with ~191 pathname conditionals mixing routing, auth, HTML rendering, Stripe, GHIN scraping, affiliate payouts, CRM, AI calls, and D1/KV persistence. One change can break unrelated paths.
2. Static assets routed through the worker via `run_worker_first`, then marked `no-cache, no-store`. Browser can't cache, worker gets parsed on every asset request.

**Security (URGENT — fix before launch):**
3. Auth secrets in URL query params (`pin`, `token`) — end up in browser history, logs, analytics, Referer headers.
4. 4-digit admin PIN via `Math.random()` — not serious auth for settling bets and processing refunds. Per-IP rate limit doesn't stop distributed guessing.
5. Admin session tokens stored unhashed in KV — no IP binding, no rotation, no revocation. One leaked token = full admin.
6. CORS `Access-Control-Allow-Origin: *` on admin-bearing APIs that accept `X-Admin-Pin` and `X-Admin-Token` headers.
7. Hardcoded commissioner emails, legacy PIN fallbacks, seed endpoints returning admin PINs in production code.
8. No CSP anywhere. Inline scripts + `innerHTML` + no `Content-Security-Policy` = one interpolation mistake becomes XSS.
9. "Magic link" admin flow looks half-built — stores code in KV, returns `sent: true`, but no visible delivery path. Dead auth surface area.

**Data Model:**
10. KV + D1 split-brain by design. Event config in both, email captures in both, affiliate indexes in KV. D1 insert is fire-and-forget with `.catch(() => {})`.
11. No schema management. No migrations, no index definitions. Runtime fallbacks for "no such table" and `ON CONFLICT` mismatches — schema drift papered over in app logic.
12. No indexing strategy. `SELECT *` everywhere, ad hoc filters on courses_leads, referrals, affiliates, events — relying on low volume, not design.

**Error Handling:**
13. Silent `catch {}` blocks AND raw `e.message` in responses. Worst of both: hides defects from you, leaks internals to attackers.

**Frontend:**
14. 109KB single-file SPA with inline CSS, inline JS, direct DOM mutation, `innerHTML` rendering. No component boundaries, no cache busting strategy.

**Performance:**
15. 520KB worker parsed across isolates + giant route matching + KV/D1/third-party fetches + auto-seeding demo data on request entry = cold-start and tail-latency spikes.
16. `workers_dev: true` alongside production bindings — increases chance of deploying test code against prod data.

**Category Verdicts:**
- **Architecture:** Not sustainable. Blast radius, regression rate, cold-start cost all scaling with file size.
- **Security:** SQLi risk low (bindings used). Real problems: weak admin auth, URL secrets, permissive CORS, no CSP, inconsistent escaping.
- **Performance:** Self-inflicted damage from run_worker_first + worker-mediated static assets + anti-caching headers.
- **Data Model:** KV+D1 duplication is a drift machine. No migrations, no indexes.
- **Frontend:** Maintainable only until the next real feature wave.

## THE GOAL

Build and grow Waggle (betwaggle.com) into the #1 social golf betting platform, reaching $50K MRR by serving scrambles, member-guests, and guys trips. Acquire 500 paying events/month at $32/event through organic viral growth, SEO content, and affiliate partnerships with trip organizers, course pros, and golf content creators.

## THE APPROACH: STRUCTURED REBUILD WITH GSTACK GUARDRAILS

The previous approach (raw `--dangerously-skip-permissions` sessions with no structure) created the mess we're in. This time, every phase uses gstack skills to enforce discipline:

1. **`/investigate`** to audit — diagnoses problems without accidentally "fixing" them
2. **`/design-consultation`** to lock the design system — prevents visual drift
3. **Build with `/careful` active** — warns before destructive commands
4. **`/qa` after every phase** — opens real browser, tests deployed site, files + fixes bugs
5. **`/review` before every deploy** — catches race conditions, missing error handling
6. **`/ship` to deploy** — structured PR flow, not raw pushes
7. **`/cso` before launch** — security audit on email capture, KV, affiliate tracking

---

## ARCHITECTURE DIRECTIVES (Codex Remediation Plan)

The rebuild must address every Codex finding. These are not suggestions — they are requirements.

### Worker Architecture (Findings #1, #2, #15, #16)

**Kill the god-object.** The 520KB `worker.js` with 191 conditionals is the root cause of most bugs. Rebuild as:

```
worker.js          — Router only. <50 lines. Matches pathname, delegates to handler modules.
handlers/
  api.js           — All /api/* endpoints (email-capture, courses, ghin, affiliate-signup)
  pages.js         — HTML page serving (static files, not worker-rendered)
  admin.js         — Admin endpoints (score entry, settlement, line management)
  auth.js          — Authentication logic (see security directives below)
```

**Static asset serving:**
- Remove `run_worker_first` for static assets. Let Cloudflare's default asset handling serve HTML/CSS/JS/images directly.
- Remove `no-cache, no-store` headers on static assets. Set proper `Cache-Control` with content hashing for cache busting.
- Only route through the worker for `/api/*` endpoints and dynamic routes (`/g/{outing_id}`).

**Disable `workers_dev: true`** in `wrangler.jsonc` for production. Use separate environments:
```jsonc
{
  "name": "waggle",
  "workers_dev": false,  // NEVER true in production
  "env": {
    "staging": { "workers_dev": true }
  }
}
```

### Security (Findings #3, #4, #5, #6, #7, #8, #9)

**Auth secrets out of URLs (Finding #3):**
- Admin PIN and session tokens must NEVER appear in query params
- Use `Authorization` header or `HttpOnly` cookies instead
- Audit every link and redirect for leaked secrets

**Replace 4-digit PIN (Finding #4):**
- Admin auth: 8+ character passphrase set by the outing creator at creation time
- Use `crypto.subtle.digest('SHA-256', ...)` to hash, not `Math.random()`
- Rate limit: 5 attempts per 15 minutes per IP AND per outing ID
- Lockout after 10 failed attempts — require email verification to reset

**Session tokens (Finding #5):**
- Hash tokens before storing in KV: `SHA-256(token + outing_id + salt)`
- Bind to IP (or at minimum, user-agent)
- Auto-expire after 24 hours
- Revoke all sessions on PIN change

**Lock down CORS (Finding #6):**
- Remove `Access-Control-Allow-Origin: *` from ALL admin-bearing APIs
- Whitelist only: `betwaggle.com`, `cafecito-ai.com`, `localhost:8787` (dev)
- Admin APIs: same-origin only, no CORS at all

**Remove hardcoded secrets (Finding #7):**
- Delete all hardcoded commissioner emails from source code
- Remove legacy PIN fallbacks
- Remove seed endpoints that return admin PINs
- Move all secrets to Cloudflare Worker secrets (not env vars, not source code)

**Content Security Policy (Finding #8):**
- Add CSP header to every response:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.resend.com
```
- Eliminate ALL `innerHTML` usage. Replace with `textContent` or DOM creation methods.
- No inline `<script>` tags. All JS in external files.

**Remove dead auth code (Finding #9):**
- Delete the half-built magic link flow entirely
- If email-based admin auth is wanted later, build it properly from scratch
- Audit KV for orphaned magic link codes and delete them

### Data Model (Findings #10, #11, #12)

**Pick one source of truth (Finding #10):**
- **D1 is the primary database** for all structured data (events, scores, bets, affiliates, emails)
- **KV is for caching and ephemeral data** only (session tokens, rate limit counters, course search cache)
- Remove all fire-and-forget `.catch(() => {})` patterns. If D1 write fails, the operation fails. Surface the error.

**Schema management (Finding #11):**
- Create a `/migrations/` directory with numbered SQL files:
```
migrations/
  001_create_events.sql
  002_create_scores.sql
  003_create_bets.sql
  004_create_emails.sql
  005_create_affiliates.sql
  006_create_sessions.sql
```
- Each migration runs via `wrangler d1 execute` during deploy
- Remove ALL runtime "no such table" fallbacks. If the table doesn't exist, the deploy is broken.

**Indexing (Finding #12):**
- Add indexes to every table for common query patterns:
```sql
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_scores_event_id ON scores(event_id);
CREATE INDEX idx_emails_source ON emails(source);
CREATE INDEX idx_affiliates_ref_code ON affiliates(ref_code);
CREATE INDEX idx_bets_event_id ON bets(event_id);
```
- Replace `SELECT *` with explicit column lists everywhere

### Error Handling (Finding #13)

- **No silent `catch {}` blocks.** Every catch must at minimum log to `console.error` with context.
- **No raw `e.message` in HTTP responses.** Return generic error messages to clients:
  ```javascript
  // BAD
  catch (e) { return new Response(e.message, { status: 500 }); }
  
  // GOOD
  catch (e) {
    console.error(`[${request.url}] ${e.message}`, e.stack);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  ```
- Create a shared error handler utility used by all route handlers

### Frontend (Finding #14)

- **Break the 109KB single-file SPA into separate files:**
  - `app.js` — core app controller + routing
  - `scorecard.js` — score entry logic
  - `bets.js` — bet slip + odds display
  - `settlement.js` — settlement calculations
  - `dashboard.js` — home tab + player management
  - `styles.css` — external stylesheet (not inline)
- **Eliminate all `innerHTML` usage.** Use DOM creation methods or a minimal template function that auto-escapes.
- **Add cache busting:** Append content hashes to CSS/JS filenames or use query string versioning (`app.js?v={hash}`)

---

**gstack skill: `/investigate`**

Start Claude Code and run `/investigate` with this context:

> Investigate the entire betwaggle.com codebase. I need a complete audit before rebuilding. Map every directory, identify what's deployed vs dead code, find where each feature breaks. Write findings to AUDIT.md.

The `/investigate` skill will auto-freeze to each module it's examining, preventing accidental changes. Let it run through the full repo.

Additionally, run these manual commands to gather raw data:

```bash
# Clone if not already
git clone https://github.com/eratner15/betwaggle.git
cd betwaggle

# Map the directory structure
find . -name "index.html" | head -50
find . -name "*.js" -not -path "./node_modules/*" | head -80
find . -name "*.css" -not -path "./node_modules/*" | head -30

# Read key config files
cat wrangler.jsonc
cat worker.js
cat DESIGN.md
cat TODOS.md
cat CHANGELOG.md
cat VERSION

# Read existing plans
cat waggle-claude-code-prompt-v2.md
cat waggle-paperclip-company-plan-v2.md

# Check deployed state
cat sitemap.xml
cat robots.txt
```

Read EVERY `index.html` in the repo. Pay special attention to:
- `create/index.html` — the "Open the Book" page
- `app/index.html` — the game day dashboard (if exists)
- `demo/index.html` — the Cabot Citrus demo
- `courses/index.html` — the course directory
- `index.html` — the homepage
- `games/` — SEO content pages (may be partially built)
- `affiliates/` and `affiliate/` — two directories, which is active?
- `overview/index.html` — the GM Operations Guide

**Deliverable: AUDIT.md** must include:
- Which directories are active and deployed
- Which directories are dead code to archive
- Which features work end-to-end
- Which features are broken and WHERE exactly they break (file + line if possible)
- The Cloudflare Worker routing logic (from worker.js)
- KV namespaces and external API integrations in wrangler.jsonc
- List of all logo files and which one to keep
- Any hardcoded domain references (betwaggle.com in cafecito paths, etc.)

---

## PHASE 0.5: DESIGN SYSTEM LOCK

**gstack skill: `/design-consultation`**

Before writing any feature code, run `/design-consultation`:

> Build the design system for Waggle, a premium golf sportsbook. Lock it into DESIGN.md so it can't drift. The aesthetic is clubhouse meets sportsbook: navy/gold/ivory with Playfair Display headings. Every component must feel like it belongs in the same app.

The `/design-consultation` skill will:
1. Research the space (golf apps, sportsbook UIs)
2. Propose a design direction
3. Write a comprehensive DESIGN.md with component specs

Make sure DESIGN.md covers these components:
- Buttons (primary gold, secondary outlined, destructive coral)
- Cards (game cards, player cards, bet cards, course cards)
- Form inputs (text fields, number selectors, search autocomplete, dropdowns)
- Scorecard table (the most complex component — must spec colors for birdie/eagle/bogey)
- Navigation (bottom tab bar for the dashboard, top nav for marketing pages)
- Typography scale (H1-H6, body, caption, label)
- Spacing and layout grid
- Color usage rules (when to use navy bg vs ivory bg)
- Touch target sizing (56px minimum for all tappable elements)
- Animation patterns (expand/collapse, score entry feedback, bet slip drawer)

**After DESIGN.md is written, run `/design-review`:**

> Review the design system in DESIGN.md against the current deployed site at betwaggle.com. Identify every deviation. List them in order of visual impact.

This creates the baseline for consistent UI across the rebuild.

---

## PHASE 1: THE CORE USER FLOW

The product has ONE critical path:

```
Homepage → Create Outing → Game Day Dashboard → Score Entry → Settlement
```

Everything else (SEO, email, affiliates) is amplification. If this path doesn't work, nothing else matters.

### Execution approach for Phase 1:
- Build each sub-phase (1A, 1B, 1C, 1D)
- After each sub-phase, run **`/qa`** to test in a real browser
- Before deploying each sub-phase, run **`/review`** on the diff
- Deploy with **`/ship`** (not raw wrangler deploy)

---

### 1A. Homepage (/)

The homepage is the MARKETING page. It sells the product.

**Hero Section:**
- H1: "Run Your Golf Trip Like a Vegas Sportsbook."
- Subhead: "Live odds on every phone. Scores update hole by hole. Settlement is automatic."
- Primary CTA: **"See It Live →"** (links to /demo/) — Gold button, large, dominant
- Secondary CTA: **"Create Your Outing"** (links to /create/) — Outlined button, smaller
- NO price in the hero. The hero sells the experience.
- Animated sportsbook mockup (CSS-only score ticker animation)

**Feature Strip (immediately below hero, navy background):**

Card 1 — **30,000+ Courses Preloaded**
"Every course in America. Full scorecards with par, stroke index, slope, and rating. Search, select, play."
Visual: Stylized course card mock (e.g., "TPC Sawgrass — Stadium · Par 72 · Slope 155 · Rating 76.4")
CTA: "Find Your Course →" → /courses/

Card 2 — **GHIN Handicaps Auto-Pull**
"Enter a GHIN number, get their official index instantly. No typing, no guessing, no sandbaggers."
Visual: Mock showing GHIN input → auto-populated index
CTA: "Create Your Outing →" → /create/

**Pricing Section:**
- Free tier: $0, casual rounds, all 8 formats, live scoring
- Buddies Trip: **$32 per outing** — subtext: "$8/person for a foursome · $4/person for 8"
- Member-Guest: $149 per event, unlimited players
- ALL CTAs say "Create Your Outing"
- FAQ accordion below pricing:
  - "What counts as one outing?" → "One outing covers your entire weekend — unlimited rounds, all game formats, all players."
  - "Do all players need to pay?" → "No. One person pays $32. Everyone else joins free via a shared link."
  - "Can I try it free first?" → "Yes. Free rounds include all 8 formats with live scoring. Paid adds GHIN lookup, AI pairings, live odds, and settlement."
  - "What if we lose cell service?" → "The app caches everything offline. Scores sync when signal returns."

**Game Format Section:** Expandable cards linking to /games/{name}/

**Footer:** "Waggle" only. Links: See It Live, Create Your Outing, Find a Course, Game Guides, GM Guide, Affiliates

**After building the homepage:**
```
/qa
> Test the homepage at betwaggle.com. Check all CTAs link correctly,
> pricing shows $32, no "BetWaggle" text anywhere, responsive at
> 375px/768px/1440px. File bugs and fix them.
```

---

### 1B. Create Your Outing (/create/)

The "Open the Book" page. Most critical page on the site. Must be SIMPLE and FAST.

**4 steps on ONE page (no page reloads):**

**Step 1: Add Players**
- Input: "Last name" + "GHIN # (optional)" + "Search" button
- GHIN lookup calls Worker endpoint: `GET /api/ghin/{ghin_number}`
- Auto-populate handicap index. Fallback to manual entry if API fails.
- Players appear as cards: "Ratner · HI 15" with X to remove
- Support 2-8 players
- "Opening Lines" auto-generates matchup spreads from handicap differentials

**Step 2: Select Course**
- Autocomplete search from 30K+ course database
- **THIS MUST ACTUALLY WORK.** Shares same data source as /courses/
- Worker endpoint: `GET /api/courses?q={search_term}` returns top 10 matches
- On selection: show course name, par, slope, rating, tee dropdown
- "Skip — pick at the course" option

**Step 3: Pick Your Games**
- Multi-select game cards: Nassau, Skins, Wolf, Vegas, Stableford, Banker, Bloodsome, Stroke Play
- Tap to select (gold border). Stake input for each selected game.

**Step 4: Launch**
- Summary card: players, course, games, estimated pot
- **"Open the Book →"** button
- Creates outing in localStorage (free) or KV (paid)
- Redirects to Game Day Dashboard at `/g/{outing_id}`
- Generates shareable URL

**Data architecture:**
```javascript
{
  id: "abc123",
  created_at: "2026-04-04T10:00:00Z",
  course: {
    name: "TPC Sawgrass", tees: "Blue",
    par: [4,4,5,3,4,4,3,5,4, 4,3,4,5,4,4,3,4,5],
    slope: 155, rating: 76.4
  },
  players: [
    { name: "Ratner", ghin: "1234567", handicap: 15.0, courseHandicap: 17 },
    { name: "Johnson", ghin: "7654321", handicap: 13.0, courseHandicap: 15 },
    { name: "Steve", ghin: null, handicap: 17.0, courseHandicap: 19 }
  ],
  games: {
    nassau: { enabled: true, stake: 10 },
    skins: { enabled: true, stake: 5 },
    wolf: { enabled: false },
    vegas: { enabled: false },
    stableford: { enabled: false },
    banker: { enabled: false },
    bloodsome: { enabled: false },
    strokePlay: { enabled: false }
  },
  scores: {
    "Ratner": [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
    "Johnson": [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
    "Steve": [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  },
  bets: [],
  status: "active"
}
```

**After building the create flow:**
```
/qa
> Test the create flow at betwaggle.com/create/. Add 3 players with
> handicaps. Search for "TPC Sawgrass" and verify course auto-populates.
> Select Nassau and Skins. Click "Open the Book" and verify it creates
> an outing and redirects to the dashboard. File bugs and fix them.
```

---

### 1C. Game Day Dashboard (/g/{outing_id})

What players see when they open the shared link. Must feel like a SPORTSBOOK.

**Header:**
- Outing name (auto: "Golf Game · Apr 4") or custom name
- Course name + par
- ONE Waggle logo (top left). No duplicates. No BetWaggle.
- **Remove "$0 staked" badge.** Replace with subtle "Pot: $60" inside main content.

**Tab Navigation (bottom bar, mobile-first):**

**Tab 1: Home**
- Hero card: outing name, date, course, player list with handicaps
- Active games as pills: "Nassau $10" "Skins $5"
- Estimated pot total
- "Start Scoring →" button (admin only)
- Trash talk section
- "Share This Page" button

**Tab 2: Bets**
- Nassau: Front 9 / Back 9 / Total — tappable buttons that open bet slip
- Skins: "Skins Winner — Most skins at end of round"
- Opening Lines: H2H matchup cards with handicap spreads (tappable)
- Prop Bets: Over/Under gross scores, birdie props, skins leader
- Outright Winner: Player cards with moneyline odds
- ALL odds are tappable → adds to sticky bottom bet slip drawer

**Tab 3: Scorecard**
- Standard scorecard: Front Nine / Back Nine tables
- Player names left, holes 1-18 across top, par row at top
- **Score entry: Tap empty cell → inline number picker (1-12) → cell fills → next cell auto-focuses**
- Color coding: green = birdie, blue = eagle, red border = bogey+
- Running totals: Out, In, Total
- Real-time game calculation updates on every score entry

**Tab 4: Settlement**
- Shown after all 18 scored (or manually triggered)
- Per-game breakdown: Nassau (front/back/overall/presses), Skins (who/which holes/values), etc.
- Final ledger: "Player A owes Player B $15"
- **Net settlement = $0.00 always** (critical invariant)
- "Share Settlement Card" button

**After building the dashboard:**
```
/qa
> Test the game day dashboard. Create an outing, then open the dashboard.
> Verify: one logo only, no "$0 staked" badge, all 4 tabs work, score
> entry allows tapping cells and entering numbers, entering a full round
> of scores triggers settlement calculations. Test on mobile viewport.
```

---

### 1D. Score Entry (THE #1 BROKEN FEATURE)

This gets its own section because it's the most important thing to fix.

**Exact behavior:**
1. Creator taps "Start Scoring" on dashboard
2. Scorecard tab activates with empty cells
3. Tap any empty cell → inline number selector appears
4. Number selector: buttons 1-12, par for that hole highlighted as default
5. Tap a number → cell fills → focus moves to next empty cell (same hole next player, or next hole)
6. After each score:
   - Running total updates instantly
   - Game calculations update (Nassau match status, skins, etc.)
   - Bets tab updates with new odds
   - Dashboard updates
7. Scores save to localStorage IMMEDIATELY (offline-first)
8. If KV-backed, scores sync to Cloudflare KV in background

**Performance requirement:** Score entry must be fast enough to use between holes on the course. No spinners, no delays, no page reloads. Everything in-memory with localStorage persistence.

**After building score entry, this is the most important QA:**
```
/qa
> Critical test: Go to an outing dashboard, tap Scorecard tab, tap a
> cell for Hole 1 / Player 1. Verify a number picker appears. Enter a
> score. Verify the cell fills, the running total updates, and focus
> moves to the next cell. Enter scores for all players on holes 1-3.
> Verify Nassau standings update. Verify skins tracking updates.
> Test with airplane mode on — verify scores persist in localStorage.
```

---

## PHASE 2: COURSE DATABASE + GHIN

### 2A. Course Search

The /courses/ page AND /create/ course selector must share the same search.

- Course data in Cloudflare KV (namespace: WAGGLE_COURSES) or Worker endpoint
- Endpoint: `GET /api/courses?q={search_term}` → top 10 matching courses
- Each record: name, city, state, tees [{name, par[], slope, rating}]
- Search on course name, city, state
- Response time <200ms

**Audit the existing course data first** — find where it lives (KV? JSON in repo? Worker?). Whatever exists, make the search work end-to-end.

### 2B. GHIN Integration

1. Worker endpoint: `GET /api/ghin/{ghin_number}`
2. Proxy to GHIN API → return: player name, handicap index, home club
3. Cache in KV to avoid rate limits
4. **If GHIN API requires auth or is inaccessible**, implement clean manual fallback

**After building course + GHIN:**
```
/qa
> Test course search: go to /courses/, search "Pebble Beach", verify
> results appear with par/slope/rating. Then go to /create/, search
> "Bethpage", verify it auto-populates. Test GHIN: enter a GHIN number,
> verify handicap auto-fills or manual fallback appears gracefully.
```

---

## PHASE 3: CLEANUP + DEPLOY

**gstack skill: `/careful`** — activate this before touching the file system.

### Dead Code Archival
Run `/careful` first, then:

```bash
mkdir -p archive
# Move confirmed dead directories
mv b/ archive/ 2>/dev/null
mv cards/ archive/ 2>/dev/null
mv mclemore/ archive/ 2>/dev/null
mv pro/ archive/ 2>/dev/null
mv register/ archive/ 2>/dev/null
mv share/ archive/ 2>/dev/null
mv tour/ archive/ 2>/dev/null
mv walkthrough/ archive/ 2>/dev/null
mv .stitch-cards/ archive/ 2>/dev/null

# Consolidate affiliate/ vs affiliates/ (keep affiliates/)
mv affiliate/ archive/ 2>/dev/null

# Check partner/ — if affiliates/ replaces it, archive
mv partner/ archive/ 2>/dev/null

# Delete Windows Zone.Identifier artifacts
find . -name "*.Zone.Identifier" -delete
find . -name "*:Zone.Identifier" -delete

# Audit docs/ and pricing/ before archiving — read them first
```

### Brand Consolidation
- Remove ALL "BetWaggle" references from every file
- Keep ONE `logo.png`. Delete: bet_waggle_logo_no_background.png, waggle_logo.jpg, logo-hero.jpg, logo-nav.jpg, logo-nav.png, logo-cropped.jpg, logo-cropped.png
- Footer: "Waggle by Cafecito AI"
- Fix demo page links that hardcode betwaggle.com (should use relative paths)

### Security Audit

**gstack skill: `/cso`**

> Run a security audit against the Codex findings. Specifically verify:
>
> Finding #3: No auth secrets in URL query params anywhere
> Finding #4: Admin PIN is 8+ chars, hashed with crypto.subtle, rate-limited
> Finding #5: Session tokens hashed in KV, IP-bound, auto-expire 24hr
> Finding #6: CORS locked to betwaggle.com + cafecito-ai.com only, no wildcard
> Finding #7: No hardcoded emails, PINs, or seed endpoints in production code
> Finding #8: CSP header on every response, no innerHTML usage, no inline scripts
> Finding #9: Dead magic link auth code fully removed
> Finding #10: No fire-and-forget .catch(() => {}) on D1 writes
> Finding #13: No silent catch blocks, no raw e.message in responses
>
> Also audit: email capture (injection, validation), KV storage (access
> controls, data exposure), affiliate tracking (ref parameter manipulation),
> GHIN API proxy (rate limiting, auth token exposure), and user-generated
> content (trash talk, player names, bet descriptions).

### Deploy

**gstack skill: `/ship`**

> Ship the Phase 1-3 changes. Run tests, audit the diff, and deploy to
> Cloudflare Workers. Verify betwaggle.com serves all routes correctly.

Then verify with `/qa`:
```
/qa
> Full site QA of betwaggle.com. Test every page: homepage, /create/,
> /courses/, /demo/, /overview/, /games/ (if built). Check for 404s,
> broken links, console errors, responsive layout issues. Verify $32
> pricing, "Waggle" branding, no "BetWaggle" text anywhere.
```

---

## PHASE 4: SEO CONTENT HUB (/games/)

Build 14 pages under /games/ targeting golf betting search terms. Each page is standalone HTML with:
- Premium editorial design (Georgia body, Playfair Display headings, navy/gold/ivory)
- JSON-LD structured data: FAQPage + HowTo schemas
- Internal cross-links to related games, /create/, /demo/
- Email capture form at bottom
- Breadcrumbs, sticky TOC (desktop sidebar / mobile collapsible)
- 1,500-2,500 words of genuinely useful content

**Pages:**
```
/games/                          — Hub with game selector quiz
/games/nassau/                   — Nassau rules, pressing, variations
/games/skins/                    — Skins with carryovers
/games/wolf/                     — Wolf rotation and selection
/games/vegas/                    — Vegas two-digit scoring
/games/bingo-bango-bongo/        — BBB three-point system
/games/bloodsome/                — Bloodsome team format
/games/banker/                   — Banker/Quota points system
/games/stableford/               — Stableford anti-blowup
/games/match-play/               — Match play fundamentals
/games/best-ball-golf-betting/   — Best ball team format
/games/3-player-golf-games/      — Threesome formats
/games/4-player-golf-games/      — Foursome formats
/games/golf-trip-betting-guide/  — Complete trip planning guide
```

Content source: the Peel & Eat book. Rewrite in your own voice.

**After building each batch of game pages, run `/design-review`:**
```
/design-review
> Review the /games/ pages against DESIGN.md. Verify typography,
> colors, spacing, and component styles are consistent with the
> rest of the site. Flag deviations.
```

Then `/qa`:
```
/qa
> Test the /games/ hub and individual game pages. Verify: internal links
> work, JSON-LD validates, email capture form submits, breadcrumbs are
> correct, TOC scrolls to sections, responsive layout works at all
> breakpoints. Check that each page has unique meta descriptions.
```

---

## PHASE 5: EMAIL PIPELINE

### Storage: Cloudflare KV
Namespace: `WAGGLE_EMAILS`
Key: `email:{address}`
Value: `{ email, source, game_interest, course_interest, opted_in, created_at, drip_step, converted }`

### Capture Points:
1. Free tier gate on /create/ (soft gate with "Skip" link)
2. Bottom of every /games/ page: "Get the complete strategy guide → [email]"
3. After course search on /courses/: "Planning an outing at [Course]?"

### Sending: Resend (resend.com)
- Domain: betwaggle.com
- API key: Worker secret `RESEND_API_KEY`
- From address: tips@betwaggle.com

### Worker Endpoint:
`POST /api/email-capture` — validate email, store in KV, trigger welcome email

### 5-Email Drip (Cloudflare Workers Cron Trigger, daily):
1. **Day 0 (immediate):** "Your golf group is about to get serious" — intro + demo link
2. **Day 3:** "The Nassau: Why every trip needs this game" — /games/nassau/ link
3. **Day 7:** "We already loaded your course's scorecard" — 30K courses + GHIN highlight
4. **Day 14:** "Your trip is coming — here's the game plan" — /games/golf-trip-betting-guide/
5. **Day 21:** "The group chat isn't a scoreboard" — last nudge, demo + create CTA

### After building email pipeline:
```
/cso
> Security review of the email capture system. Check: input validation
> (XSS, injection), rate limiting on /api/email-capture, Resend API
> key not exposed client-side, unsubscribe flow works, GDPR compliance
> (can delete user data from KV).
```

```
/qa
> Test email capture on /create/, /games/nassau/, and /courses/.
> Submit a test email. Verify it appears in Cloudflare KV. Verify
> the Resend welcome email sends. Check the "Skip" link works on
> /create/. Verify the unsubscribe link in the email works.
```

---

## PHASE 6: AFFILIATES (/affiliates/)

Build `/affiliates/` page:
- H1: "Partner with Waggle — Earn on Every Outing"
- 3 tiers: Starter ($8, 25%), Pro ($10, 31%), Ambassador ($12, 37%)
- 4 audiences: trip organizers, content creators, course pros, league organizers
- Signup form → KV namespace `WAGGLE_AFFILIATES`
- Link format: `betwaggle.com/create/?ref={affiliate_id}`
- Track `ref` param in create flow

```
/qa
> Test the affiliates page. Submit a test application. Verify it stores
> in KV. Then create an outing using a ?ref= parameter and verify the
> ref is tracked with the outing data.
```

---

## PHASE 7: FINAL QA + LAUNCH

### Full-Site QA

**gstack skill: `/qa`**

```
/qa
> Complete QA of betwaggle.com. Test EVERY page and user flow:
>
> 1. Homepage: CTAs work, $32 pricing, feature strip, FAQ accordion,
>    game cards expand, no "BetWaggle" anywhere
> 2. /create/: Full flow — add 3 players, GHIN lookup, course search,
>    select games, launch outing
> 3. Dashboard: One logo, no staking badge, all tabs work
> 4. Scorecard: Enter scores for all players on all 18 holes
> 5. Settlement: Verify net = $0.00, share card works
> 6. /courses/: Search returns results, course details display
> 7. /demo/: Links point to correct domain (not hardcoded)
> 8. /games/: Hub and all individual pages load, internal links work
> 9. /affiliates/: Form submits, tracking works
> 10. Email: Capture works, welcome email sends
>
> Test at 375px, 768px, and 1440px viewports.
> Test in airplane mode (offline functionality).
> Run Lighthouse and report scores.
> File every bug found and fix it.
```

### Security Final Check

**gstack skill: `/cso`**

```
/cso
> Final security audit before launch. Run against ALL 17 Codex findings:
>
> Architecture: worker.js is modular (<50 lines router), no god-object
> Security: No URL secrets (#3), strong admin auth (#4), hashed sessions
>   (#5), locked CORS (#6), no hardcoded secrets (#7), CSP header (#8),
>   dead auth code removed (#9)
> Data: D1 is single source of truth (#10), migrations exist (#11),
>   indexes on all tables (#12)
> Errors: No silent catches, no leaked e.message (#13)
> Frontend: No innerHTML, external JS/CSS files (#14)
> Performance: No run_worker_first on static, proper caching (#15),
>   workers_dev false in prod (#16)
>
> Also: OWASP Top 10, STRIDE threat model on admin flows,
> rate limiting on all public endpoints, XSS vectors in
> user-generated content.
```

### Engineering Review

**gstack skill: `/review`**

```
/review
> Review the complete diff since the rebuild began. Check for:
> dead code, console.logs left in, race conditions in score entry,
> N+1 query patterns in KV access, missing error handling,
> accessibility issues, performance bottlenecks.
```

### Ship

**gstack skill: `/ship`** then **`/land-and-deploy`**

```
/ship
> Ship the complete Waggle rebuild to Cloudflare Workers.
> Run all checks, create PR, verify staging.

/land-and-deploy
> Merge and deploy to production. Monitor for errors.
```

### Post-Launch Retro

**gstack skill: `/retro`**

```
/retro
> Run a retrospective on the Waggle rebuild. What shipped, what
> broke, what we learned. Update CHANGELOG.md and TODOS.md.
```

---

## EXECUTION ORDER (Final)

| Step | Phase | gstack Skill | What |
|------|-------|-------------|------|
| 1 | 0 | `/investigate` | Audit entire repo → AUDIT.md |
| 2 | 0.5 | `/design-consultation` | Lock design system → DESIGN.md |
| 3 | 1D | build + `/qa` | Fix score entry (the #1 broken feature) |
| 4 | 1B | build + `/qa` | Rebuild /create/ flow (players → course → games → launch) |
| 5 | 1C | build + `/qa` | Clean up Game Day Dashboard |
| 6 | 1A | build + `/qa` | Homepage overhaul ($32, CTAs, feature strip, FAQ) |
| 7 | 2 | build + `/qa` | Course search API + GHIN proxy |
| 8 | 3 | `/careful` + `/cso` | Dead code cleanup, brand consolidation, security audit |
| 9 | — | `/ship` | Deploy Phase 1-3 |
| 10 | 4 | build + `/design-review` + `/qa` | SEO content hub (/games/) |
| 11 | 5 | build + `/qa` + `/cso` | Email pipeline (KV + Resend + drip) |
| 12 | 6 | build + `/qa` | Affiliates page + tracking |
| 13 | 7 | `/qa` + `/cso` + `/review` | Full-site QA, security, code review |
| 14 | 7 | `/ship` + `/land-and-deploy` | Final deploy + production monitoring |
| 15 | 7 | `/retro` | Post-launch retrospective |

---

## DESIGN SYSTEM REFERENCE

```css
:root {
  /* Colors */
  --navy: #1B2B4B;
  --navy-dark: #0F1A2E;
  --gold: #C4A35A;
  --gold-light: #D4B96A;
  --coral: #E8735A;
  --seafoam: #7ECEC1;
  --ivory: #FAF8F5;
  --text-primary: #2D3748;
  --text-muted: #718096;

  /* Typography */
  --font-heading: 'Playfair Display', serif;
  --font-body: 'Georgia', 'Times New Roman', serif;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Spacing (8px grid) */
  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 32px;
  --space-xl: 48px;
  --space-2xl: 64px;
  --space-3xl: 96px;

  /* Touch targets */
  --touch-min: 56px;

  /* Content widths */
  --content-max: 720px;
  --page-max: 1200px;
}
```

- Mobile-first. Everything must work at 375px.
- Body text: 16px minimum mobile, 18px content pages
- Touch targets: 56px minimum
- Asset budget: 600KB max page weight
- No frameworks. Pure HTML/CSS/JS.
- localStorage for offline-first, Cloudflare KV for server persistence

---

## CRITICAL INVARIANTS

1. **Settlement nets to $0.00** — across all players, all games, always
2. **$32 price everywhere** — not $29, not "per event" but "per outing"
3. **"See It Live" / "Create Your Outing"** — primary/secondary CTAs always
4. **Brand is "Waggle"** — never "BetWaggle", never "Bet Waggle"
5. **Course search returns results** — the #1 technical feature
6. **Score entry works** — tap cell, enter number, calculations update
7. **One logo** — top left, links to homepage, no duplicates
8. **Works offline** — scores persist in localStorage, sync when online
9. **Every /games/ page has JSON-LD** — FAQPage + HowTo
10. **Email capture stores to KV and fires welcome email** — no silent failures
11. **`/qa` runs after every phase** — no deploying untested code ever again
12. **DESIGN.md is the source of truth** — all UI decisions reference it
13. **worker.js is a router only** — <50 lines, delegates to handler modules (Codex #1)
14. **No auth secrets in URLs** — no PIN/token in query params, ever (Codex #3)
15. **No innerHTML anywhere** — DOM creation methods or auto-escaped templates only (Codex #8)
16. **D1 is the single source of truth** — KV is cache only, no split-brain (Codex #10)
17. **No silent catch blocks** — every error logged with context, generic messages to clients (Codex #13)
18. **workers_dev: false in production** — staging env only (Codex #16)
