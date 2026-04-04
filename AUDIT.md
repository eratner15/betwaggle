# Waggle Codebase Audit

**Date:** 2026-04-04
**Version:** 0.20.0.0 (VERSION file says 0.20.0.0, CHANGELOG documents through 0.21.0.0)
**Repo:** github.com/eratner15/betwaggle
**Branch:** master
**Total commits:** 218+

---

## 1. Architecture: The God-Object

`worker.js` is **10,715 lines / 520KB**. It contains 172 pathname-based route conditionals mixing:
- HTML page serving
- API endpoints (courses, GHIN, email, affiliates, outreach, checkout, billing, admin)
- Stripe webhook handling
- Multi-tenant event API (`/:slug/api/*`)
- SPA shell rendering (inline HTML templates)
- Demo data seeding (13 seed functions imported from `worker-seeds.js`, 1,126 lines)
- Course search, GHIN proxy, AI advisor, push notifications
- Full checkout/billing flow
- Affiliate tracking + payout system
- Campaign/outreach management
- Lead enrichment

Additionally, `worker-seeds.js` adds 1,126 lines of seed data.

**Routing structure (worker.js):**
1. Lines 1-300: Utility functions, escaping, normalization, randomPin
2. Lines 300-760: API routes (`/api/courses/search`, `/api/ghin/*`, `/api/email-capture`, `/api/my-events`, `/api/ux-telemetry`, `/api/invite-telemetry`, `/api/unsubscribe`, checkout/success UI)
3. Lines 760-900: Multi-tenant event API (`/:slug/api/*`), join routes, friendly redirects, SPA slug matching
4. Lines 896-1200: Create event, subscribe, billing portal, checkout, Stripe, admin refund, marketing/ads APIs, affiliate APIs
5. Lines 1200-1400: Partner API, recap, advisor, history, GHIN lookup, season, courses CRUD, tour/pricing/games redirects, legacy waggle/golf redirects, seed endpoints
6. Lines 1400-1630: Force-reseed endpoints (return admin PINs!), remaining API 404, static asset serving
7. Lines 1630-10715: Handler functions (inline HTML generation, Stripe integration, email sending, settlement math, GHIN lookup, course search, push notifications, affiliate registration, lead management, outreach, etc.)

**Verdict:** Unsustainable. Every change risks breaking unrelated features. The exclusion list for the SPA slug match (line 808) has 30+ entries and must be updated every time a new top-level route is added.

---

## 2. Directory Map: Active vs Dead

### Active & Deployed (referenced in worker.js routing)

| Directory | Purpose | Size | Status |
|-----------|---------|------|--------|
| `app/` | Game Day SPA (dashboard, scorecard, bets, settlement) | 167KB app.js + 57KB index.html | **Active, primary product** |
| `create/` | "Open the Book" outing creation wizard | 185KB index.html (!) | **Active** |
| `courses/` | Course directory page | 18KB | **Active** |
| `demo/` | Demo event showcase page | 20KB | **Active** |
| `games/` | SEO content hub (15 game format pages) | Multiple pages | **Active** |
| `guides/` | Long-form SEO guides (4 guides) | Multiple pages | **Active** |
| `overview/` | GM Operations Guide | Single page | **Active** |
| `affiliates/` | Affiliate signup + dashboard | Two HTML files | **Active** |
| `my-events/` | "Find My Event" page | Single page | **Active** |
| `admin/outreach/` | Campaign management dashboard | Single page | **Active** |
| `pricing/` | Pricing page | Single page | **Active** |
| `data/` | Course leads JSON, outreach logs | 76KB | **Active (API data)** |
| `emails/` | Drip + outreach email templates | Multiple files | **Active** |
| `scripts/` | Build/enrichment/outreach scripts | 4 JS files | **Active (ops tooling)** |
| `tests/` | Regression tests (betting, checkout, data, nassau, simulation) | 5 test files | **Active** |

### Dead Code (archive candidates)

| Directory | Purpose | Evidence | Recommendation |
|-----------|---------|----------|----------------|
| `b/` | Unknown (68KB) | Single index.html, not referenced in worker routing | **Archive** |
| `cards/` | Stitch game cards (172KB) | 7 card pages, replaced by `/games/` content + `/app/` formats | **Archive** |
| `mclemore/` | McLemore Club trip page (112KB) | Custom trip landing, hardcoded to specific venue | **Archive** |
| `pro/` | Course pro landing page (52KB) | Has affiliate signup, but superseded by `/affiliates/` | **Archive** |
| `register/` | Player self-registration (32KB) | Still served by worker at `/:slug/register` (line 813-814) | **Keep** (used for team registration) |
| `share/` | Event sharing page (32KB) | Referenced in worker but functionality unclear | **Review, likely archive** |
| `tour/` | Product tour page (28KB) | Worker redirects `/tour` to serve static HTML | **Review** |
| `walkthrough/` | 60-second walkthrough (32KB) | Recent (TODOS mentions it), may still be useful | **Review** |
| `partner/` | Partner/course pro portal (40KB) | Worker serves it + has full partner API (`/api/partner/*`) | **Keep** (active partner portal) |
| `.stitch-cards/` | Stitch design card exports | Design artifacts, not deployed | **Archive** |
| `affiliate/` | Legacy affiliate directory | Worker blocks most paths (line 1239), only `/affiliate/generate/` is kept | **Archive** (consolidate to `affiliates/`) |
| `docs/` | Strategy/planning docs | Not deployed, reference material | **Keep in repo, don't deploy** |

### Other directories

| Directory | Purpose | Notes |
|-----------|---------|-------|
| `.claude/` | Claude Code config | Internal tooling |
| `.context/` | Context files | Internal tooling |
| `.gstack/` | gstack config | Internal tooling |
| `.wrangler/` | Wrangler build artifacts | Auto-generated |

---

## 3. Broken Features

### 3A. Course Search — WORKS (with caveats)

The course search API at `/api/courses/search?q=` exists and is called from:
- `create/index.html` (lines 660, 1862, 2691) — multiple duplicate search implementations
- `courses/index.html` (lines 229, 312)
- `app/js/app.js` (line 3942)

The worker handler (line 376) fetches from a GolfCourse.com API with fallback to local course data. **The search works when the external API is reachable.** When it fails, there's a hardcoded fallback array of ~10 courses (line 379-432).

**Issue:** The `create/index.html` has THREE separate `searchCourses()` function definitions (lines 1856, 2691, and in the Quick Start overlay), suggesting copy-paste duplication across different sections of the same file.

### 3B. Score Entry — PARTIALLY WORKS

The score entry system in `app/js/app.js` has:
- `setScorecardScore(playerName, score)` at line 953
- `setScoreModalHole(h)` at line 2382
- `setScoreModalScore(player, val)` at line 2389
- Auto-advance logic at line 2498

Score entry uses a modal with number buttons (1-12). The core math works per the test suite. **However, the entry UX has known issues:**
- TODOS mentions "Score entry — premium circles (eagle gold, birdie green), haptic feedback, auto-advance" as recently shipped
- The `app/index.html` is 57KB with 3 innerHTML usages — score rendering is inline HTML

### 3C. Dashboard — Known UI Issues

Per the TODOS and rebuild plan:
- **Duplicate logos** — not confirmed in code audit but flagged by user
- **"$0 staked" badge** — search confirms staking display exists in the SPA
- The dashboard is served by worker.js rendering inline HTML for the event shell, then loading the SPA JS

### 3D. GHIN Lookup — WORKS (conditionally)

`handleGhinLookup()` at worker.js line 1807 has THREE fallback strategies:
1. **GHIN Official API** (line 1824) — requires `env.GHIN_TOKEN` secret. Uses `https://api2.ghin.com/api/v1/golfers.json`
2. **GHIN Self-Lookup** (line 1853) — uses golfer login endpoint with GHIN# as email and last name as password
3. **Manual fallback** (line 1882) — returns a link to ghin.com

**Issue:** If `GHIN_TOKEN` is not set AND user doesn't provide a last name, it goes straight to manual fallback. The self-lookup strategy uses `password: lastName` which is a GHIN API quirk that may break.

Also: a separate GHIN search handler exists at line 437 (`/api/ghin/search`) and line 9720 (GHIN helper section) with a **hardcoded Google API key** at line 9738: `'x-goog-api-key': 'AIzaSyBxgTOAWxiud0HuaE5tN-5NTlzFnrtyz-I'`

---

## 4. Security Issues

### 4A. Admin PIN — Weak (Codex Finding #4) ✓ CONFIRMED

```javascript
// worker.js line 301
function randomPin() { return String(1000 + Math.floor(Math.random() * 9000)); }
```

4-digit numeric PIN generated with `Math.random()` (not cryptographically secure). Used for admin auth on every event.

### 4B. Admin PIN Exposed in API Responses (Codex Finding #7) ✓ CONFIRMED

- `worker.js line 1593`: Seed endpoint returns `adminPin` in JSON response
- `worker.js line 1511`: Event config includes `adminPin`
- `worker.js line 3774`: Checkout success page renders PIN in HTML
- `worker.js line 3990`: PIN displayed in checkout confirmation

The config.json endpoint (line 863) does strip `adminPin` before serving to clients — good. But the seed endpoints don't.

### 4C. CORS Wildcard on Everything (Codex Finding #6) ✓ CONFIRMED

`applyApiCorsHeaders()` at line 198 sets `Access-Control-Allow-Origin: *` on ALL API responses, including admin-bearing APIs that accept `X-Admin-Pin` and `X-Admin-Token` headers (line 208).

Additionally, ~30 individual endpoints hardcode `'Access-Control-Allow-Origin': '*'` in their response headers.

### 4D. No CSP Headers (Codex Finding #8) ✓ CONFIRMED

Zero `Content-Security-Policy` headers anywhere in the codebase. Only reference is in the rebuild plan.

### 4E. innerHTML Usage (Codex Finding #8) ✓ CONFIRMED

**196 innerHTML occurrences across 21 files:**
- `create/index.html`: 50 occurrences (worst offender)
- `app/js/app.js`: 30 occurrences
- `app/js/views.js`: 18 occurrences
- `admin/outreach/index.html`: 12 occurrences
- `courses/index.html`: 10 occurrences
- `mclemore/index.html`: 12 occurrences
- Others: scattered across partner, pro, my-events, affiliates, register pages

### 4F. Silent Catch Blocks (Codex Finding #13) ✓ CONFIRMED

~50 silent catch blocks in worker.js including:
- `catch {}` (empty, lines 75, 613, 833, 1721, 1821, etc.)
- `.catch(() => {})` (fire-and-forget, 20+ occurrences on KV operations)
- `catch (_) {}` (suppressed, lines 2430, 3116, 3125, 3209, 3829, 5100)

Also: 25 occurrences of `e.message` or `err.message` in HTTP responses (leaks internals).

### 4G. Hardcoded Secrets ✓ CONFIRMED

- **Google API key** at worker.js line 9738: `'x-goog-api-key': 'AIzaSyBxgTOAWxiud0HuaE5tN-5NTlzFnrtyz-I'`
- **HMAC signing key** hardcoded as string literals: `'waggle-pin-check'` (line 7330) and `'waggle-auth-check'` (line 7418)
- Legacy PIN fallback: `env.LEGACY_MG_PIN` (line 7325)

### 4H. Auth Tokens in Headers (Not URLs) — PARTIALLY FIXED

The PIN is sent via `X-Admin-Pin` header (line 7327), not in URL query params. The auth token is via `X-Admin-Token` header (line 7336). This is better than URL params, but the PIN itself is still only 4 digits.

---

## 5. Data Model: KV + D1 Split-Brain (Codex Finding #10) ✓ CONFIRMED

### KV (MG_BOOK) — 493 references in worker.js

Used for:
- Event config: `config:{slug}`
- Scores: `{slug}:scores`
- Players: `{slug}:players`
- Bets: `{slug}:bets`
- Game state: `{slug}:game-state`
- Feed: `{slug}:feed`
- Settings: `{slug}:settings`
- GHIN cache: `ghin:cache:{number}`
- Push subscriptions: `{slug}:push-subs`
- Email captures: `email:{address}`
- Leads: `lead:{id}`, `leads:index`
- Campaigns: `campaign:{id}`, `campaigns:index`
- Invite telemetry: `invite-metric:{action}:{slug}`
- Pending checkouts: `pending-checkout:{email}`
- Affiliate data

### D1 (WAGGLE_DB) — Used for:

- `events` table (slug, config JSON, status, created_at)
- `courses_leads` table (lead management for outreach)
- `referrals` table (affiliate tracking)
- `affiliates` table (total_earned tracking)
- `ads_library` table (ad creative storage)

### Split-Brain Evidence

- Event creation writes to BOTH KV and D1 (worker.js line 1709-1713), with D1 write as fire-and-forget: `.run().catch(() => {})` (line 4559)
- Event config lives primarily in KV (`config:{slug}`), D1 stores a copy in `events.config` JSON column
- Affiliate data: registration in KV (`affiliate:*` keys) AND D1 (`affiliates` table)
- Email captures: some in KV (`email:*` keys), some in D1 as part of event/lead records

### No Schema Management (Codex Finding #11) ✓ CONFIRMED

- Zero `.sql` files in the repo
- Zero `/migrations/` directory
- No migration tooling
- D1 schema defined implicitly by runtime `CREATE TABLE IF NOT EXISTS` patterns (not even present in source — schema must have been created manually via wrangler CLI)
- The single schema reference at line 2434: `"Persist to D1 without schema changes by updating events.config JSON payload"`

### No Indexing Strategy (Codex Finding #12) ✓ CONFIRMED

No `CREATE INDEX` statements anywhere in the codebase. `SELECT *` used throughout.

---

## 6. Frontend Analysis

### File Sizes (the bloat)

| File | Size | Contents |
|------|------|----------|
| `create/index.html` | **185KB** | Entire create wizard, 3 duplicate course search functions, inline CSS + JS |
| `app/js/app.js` | **167KB** | Core SPA logic, scorecard, betting, settlement, dashboard |
| `index.html` | **109KB** | Homepage, all inline |
| `app/index.html` | **57KB** | SPA shell with inline styles |
| `worker.js` | **520KB** | Everything else |

Total active code: ~1MB+ of JS/HTML served through the worker.

### Frontend Architecture

- `app/` directory has proper JS module separation: `app.js`, `betting.js`, `data.js`, `views.js`, `views-shared.js`, `storage.js`, `sync.js`, `morph.js`, `formats/*`
- External CSS at `app/css/styles.css`
- Service worker at `app/sw.js`
- But `create/index.html` and `index.html` are monolithic single-file pages with everything inline

### Cache Busting: None

Worker.js line 860: `hdrs.set('Cache-Control', 'no-cache, no-store, must-revalidate')` on ALL static assets served through `/:slug/*`. No content hashing, no versioned filenames.

---

## 7. Brand Issues

### "BetWaggle" References

**647 occurrences across 96 files.** Major offenders:
- `worker.js`: 93 occurrences (meta tags, OG tags, emails, error messages, hardcoded URLs)
- `index.html`: 5 occurrences
- `games/*`: 9-17 occurrences per page
- `guides/*`: 8-23 occurrences per page
- Email templates: 2-9 per template
- All outreach/marketing materials

Many are in `<title>`, `og:site_name`, footer text, and meta descriptions.

### Logo Files (13 files, 1.6MB total)

| File | Size | Keep? |
|------|------|-------|
| `logo.png` | 473KB | **Primary — keep** |
| `logo.jpg` | 50KB | Keep (compressed variant) |
| `logo-cropped.png` | 370KB | Redundant |
| `logo-cropped.jpg` | 102KB | Redundant |
| `bet_waggle_logo_no_background.png` | 236KB | **Delete** ("BetWaggle" branding) |
| `waggle_logo.jpg` | 292KB | Redundant |
| `logo-hero.jpg` | 6KB | Redundant (size variant) |
| `logo-nav.jpg` | 1.4KB | Redundant (size variant) |
| `logo-nav.png` | 2.3KB | Redundant (size variant) |
| `og-card.jpg` | 53KB | Keep (OG image) |
| `og-card-logo.jpg` | 26KB | Keep (OG variant) |
| `og-card.svg` | 1.3KB | Keep (vector) |
| `favicon-180.jpg` | 11KB | Keep (favicon) |

**Recommendation:** Keep `logo.png`, `logo.jpg`, `og-card-logo.jpg`, `og-card.svg`, `favicon-180.jpg`. Delete the rest.

### Hardcoded Domain References

`betwaggle.com` is hardcoded in:
- Worker.js redirects (lines 345, 774, 803, etc.)
- Email templates (footer links)
- OG meta tags
- Demo page links
- Affiliate tracking URLs
- Checkout success redirects

These should use relative paths where possible, or a config variable for the domain.

---

## 8. Configuration Issues

### workers_dev: true (Codex Finding #16) ✓ CONFIRMED

`wrangler.jsonc` line 3: `"workers_dev": true` — means the worker is also deployed to `betwaggle.*.workers.dev`, which could serve test code against production D1/KV bindings.

### run_worker_first: true (Codex Finding #2) ✓ CONFIRMED

`wrangler.jsonc` assets config: `"run_worker_first": true` — every request (including static HTML, CSS, JS, images) hits the 520KB worker first. This kills Cloudflare's edge caching for static assets and increases cold-start latency.

### no-cache on static assets (Codex Finding #15) ✓ CONFIRMED

Worker.js line 860: Every static asset served through `/:slug/*` gets `Cache-Control: no-cache, no-store, must-revalidate`. Browsers re-download everything on every page load.

### Missing Secrets

`wrangler.jsonc` lists bindings for D1, KV, email, and AI, but secrets are configured via `wrangler secret put`. Based on code references, these secrets are expected:
- `GHIN_TOKEN` — GHIN API auth (may not be set, fallback exists)
- `RESEND_API_KEY` — Email sending
- `STRIPE_SECRET_KEY` — Payments
- `ANTHROPIC_API_KEY` — AI advisor
- `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` — Push notifications
- `LEGACY_MG_PIN` — Legacy admin PIN fallback

---

## 9. Codex Finding Verification Summary

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | God-object worker.js | **CONFIRMED** | 10,715 lines, 172 pathname conditionals |
| 2 | run_worker_first kills caching | **CONFIRMED** | wrangler.jsonc line 7 |
| 3 | Auth secrets in URL params | **PARTIALLY FIXED** | PIN/token now in headers, not URL. But PIN shown in seed API responses |
| 4 | 4-digit PIN via Math.random() | **CONFIRMED** | Line 301 |
| 5 | Unhashed session tokens in KV | **PARTIALLY FIXED** | HMAC comparison exists (line 7330-7332), but signing key is hardcoded string |
| 6 | CORS wildcard everywhere | **CONFIRMED** | applyApiCorsHeaders() line 202 + ~30 inline `*` headers |
| 7 | Hardcoded secrets | **CONFIRMED** | Google API key line 9738, HMAC keys lines 7330/7418 |
| 8 | No CSP, innerHTML everywhere | **CONFIRMED** | 0 CSP headers, 196 innerHTML occurrences |
| 9 | Dead magic link auth | **NOT VERIFIED** | Need deeper audit |
| 10 | KV + D1 split-brain | **CONFIRMED** | 493 KV refs, D1 as secondary with fire-and-forget writes |
| 11 | No schema management | **CONFIRMED** | Zero SQL files, zero migrations |
| 12 | No indexing strategy | **CONFIRMED** | Zero CREATE INDEX, SELECT * everywhere |
| 13 | Silent catches + leaked e.message | **CONFIRMED** | ~50 silent catches, 25 e.message in responses |
| 14 | 109KB single-file SPA | **WORSE** | Homepage is 109KB, create is 185KB, app.js is 167KB |
| 15 | Cold-start + anti-caching | **CONFIRMED** | 520KB worker + no-cache headers on static assets |
| 16 | workers_dev: true in prod | **CONFIRMED** | wrangler.jsonc line 3 |

---

## 10. Test Coverage

5 test files exist:
- `tests/betting.test.js` — betting math
- `tests/checkout-guard.test.js` — checkout flow
- `tests/data.test.js` — data layer
- `tests/nassau-tie-regression.test.js` — nassau edge case
- `tests/simulation.test.js` — demo simulation

No test runner config found in repo root. Tests appear to be standalone.

---

## 11. What Actually Works End-to-End

Based on code analysis (not live testing):

| Feature | Status | Notes |
|---------|--------|-------|
| Homepage loads | ✅ Works | 109KB inline page |
| Create outing | ⚠️ Partial | Course search works (API dependent), GHIN works (token dependent), wizard UX is complex (185KB page with 3 duplicate search functions) |
| Demo page | ✅ Works | Shows 6+ demo events with auto-seeding |
| Game Day Dashboard | ⚠️ Partial | SPA loads, but UI issues (duplicate logos, staking badge reported) |
| Score entry | ⚠️ Partial | Modal-based entry works, auto-advance implemented, but UX reported as broken |
| Settlement | ⚠️ Partial | Math engine has tests, net-zero invariant likely holds, share card exists |
| Course search | ⚠️ Conditional | Depends on external API + fallback array |
| GHIN lookup | ⚠️ Conditional | 3-tier fallback (API token → self-lookup → manual) |
| Email capture | ✅ Works | KV storage + Resend integration |
| Affiliate tracking | ✅ Works | Ref param tracking, commission calculation, payout system |
| Game format pages | ✅ Works | 15 static content pages under /games/ |
| Guide pages | ✅ Works | 4 guides under /guides/ |
| Checkout/billing | ✅ Works | Stripe integration with webhooks |

---

## 12. Recommendations for Rebuild (Priority Order)

1. **Split worker.js** into router + handler modules (Finding #1)
2. **Fix run_worker_first** — let Cloudflare serve static assets directly (Finding #2, #15)
3. **Set workers_dev: false** in production (Finding #16)
4. **Replace 4-digit PIN** with proper auth (Finding #4)
5. **Lock down CORS** — whitelist origins only (Finding #6)
6. **Add CSP headers** and eliminate innerHTML (Finding #8)
7. **Pick D1 as source of truth**, KV for cache only (Finding #10)
8. **Create migrations directory** with SQL schema files (Finding #11)
9. **Add indexes** to all D1 tables (Finding #12)
10. **Remove hardcoded secrets** (Google API key, HMAC signing keys) (Finding #7)
11. **Fix silent catches** — log with context, generic error responses (Finding #13)
12. **Break up monolithic HTML files** — create/index.html (185KB) and index.html (109KB)
13. **Brand consolidation** — remove 647 "BetWaggle" references, consolidate to 5 logo files
14. **Archive dead directories** — b/, cards/, mclemore/, .stitch-cards/, affiliate/
15. **Add proper cache busting** — content hashes on JS/CSS filenames
