# Waggle v2 — TODOS

## P0: Ship Blockers (before marketing push)

### DONE — verify these work end-to-end
- [x] Demo event seeded with celebrity data (betwaggle.com/api/seed-demo)
- [x] Stripe checkout flow ($32 Buddies / $149 Member-Guest)
- [x] Promo codes (FIRSTTRIP 50%, FREETRIAL 100%, GOLF2026 25%, BUDDIES 30%)
- [x] QR code on success page
- [x] Commissioner dashboard (/my-events/)
- [x] Spectator mode (?spectator=true)
- [x] FAQ accordion working
- [x] All pages using new logo
- [x] SSL configured (Full Strict + Always HTTPS)
- [x] Resend DNS records (SPF + DKIM)
- [ ] Verify Resend domain actually verified in Resend dashboard
- [ ] Verify welcome email actually delivers (send test)
- [ ] Verify Stripe webhook fires on real payment (test mode checkout)
- [ ] hello@betwaggle.com email routing configured in CF dashboard
- [x] Test full flow: create outing → pay → get success page → share link → player joins → score holes → settle — **Partially completed v0.20.0 (2026-04-01)**: free tier E2E tested (create → score → skins → settle). Found/fixed P0 generateMatches crash. Paid tier (Stripe) not yet tested.

---

## P0.5: Code Quality (completed 2026-03-26)
- [x] Meta Pixel — reads from env.META_PIXEL_ID, no more hardcoded placeholder
- [x] Demo auto-spectate — demo events bypass "Who are you?" modal
- [x] Service worker cache versioning (CACHE_VERSION const, stale cache cleanup on activate)
- [x] Rate limit POST /bet — 30 bets/hr per IP (KV-backed, 429 response)
- [x] Betting engine test suite — 572 tests (ML table symmetry, odds roundtrip, settlement, vig, edge cases)
- [x] Live odds engine — getLiveMatchMoneyline() adjusts odds mid-round based on holes played + score differential
- [x] Pricing page (/pricing) — 3-tier comparison (Weekend Warrior / Buddies / Member-Guest)
- [x] Affiliate dashboard UI (/affiliate/dashboard) — stats, referral history, payout requests
- [x] Worker.js modularization (5500 lines → lib/ modules) — **Completed v0.20.0 (2026-04-01)**: extracted worker-seeds.js (1,059 lines, 13 seed functions), reduced worker.js to 6,828 lines

---

## P1: Critical Architecture (v2 sprint)

### ~~Durable Objects migration (KV concurrency)~~
**Status:** MITIGATED — KV write mutex + merge-not-overwrite pattern added to score POST. Short-lived lock key (5s TTL) serializes writes, scores are merged not replaced. Full DO migration deferred until concurrent user load justifies it.

### ~~DOM diffing (performance)~~
**Status:** DONE — Lightweight morphdom alternative implemented (`app/js/morph.js`). First render uses full innerHTML, subsequent re-renders diff only changed nodes. Preserves scroll position, focus, and animations.

### WebSocket real-time push
**Problem:** 30s polling means scores take up to 30s to appear on other devices. The .live-dot pulses but the data is stale.
**Fix:** Cloudflare Durable Objects + WebSocket connections. When a score is submitted, push to all connected clients instantly.
**Effort:** L (human: 2 weeks / CC: ~4 hours)
**Risk:** Requires Durable Objects (bundle with that migration).
**Depends on:** Full Durable Objects migration.

---

## P1: User Experience (v2 sprint)

### ~~Trophy Room (permanent event URLs)~~
**Status:** DONE — POST `/:slug/api/event/freeze` endpoint freezes events into read-only "complete" state with `frozenAt` timestamp.

### ~~Event cloning~~
**Status:** DONE — GET `/:slug/api/event/clone-config` returns sanitized config. Create wizard supports `?clone=SLUG` param, pre-fills all fields with "(Copy)" suffix and green banner.

### ~~Co-organizer support~~
**Problem:** Single admin PIN per event. If commissioner loses PIN, no recovery. Can't invite a co-organizer.
**Fix:** Allow multiple admin emails per event. Each gets their own magic link. Commissioner can invite co-admins from the admin panel.
**Effort:** M (human: 1 week / CC: ~1 hour)
**Depends on:** Magic link auth (done).
**Status:** DEFERRED — not blocking launch.

### ~~Bulk player import on existing events~~
**Status:** DONE — POST `/:slug/api/event/bulk-import-players` accepts JSON array or CSV. Admin UI has collapsible "Paste multiple players" textarea on The Board.

---

## P2: Growth & Marketing

### ~~Settlement card AI recap in share text~~
**Status:** DONE — Already implemented in shareSettlement() handler. Fetches recap and appends to share text.

### ~~Formal invitation generator~~
**Status:** DONE — "Share with Group" now uses formal invitation text as default share body (event name, tagline, stakes, date, URL).

### Google Ads + Meta Pixel activation
**Problem:** Placeholder IDs (AW-PLACEHOLDER, PIXEL_PLACEHOLDER) in the code. No real tracking yet.
**Fix:** When Evan creates Google Ads + Meta Business Manager accounts, replace placeholder IDs. Wire conversion events.
**Effort:** S (CC: ~5 min per platform)
**Depends on:** Ad account creation (Evan).

### Affiliate payout dashboard
**Problem:** Affiliate tracking works in KV but no visual dashboard for affiliates to see their stats.
**Fix:** Build /affiliate/dashboard page — login with affiliate email, see referrals, commissions, payout history.
**Effort:** M (human: 3 days / CC: ~30 min)
**Depends on:** Affiliate system (done).

### ~~Email drip testing~~
**Problem:** 5-email drip sequence is coded but never been tested end-to-end. Cron runs weekly.
**Fix:** Manually trigger each drip email, verify delivery, check formatting, test unsubscribe.
**Effort:** S (CC: ~15 min)
**Depends on:** Resend domain verification.
**Status:** BLOCKED — needs Resend domain verification first.

---

## P2: Polish & Edge Cases

### ~~GHIN lookup caching~~
**Status:** DONE — KV cache with 24h TTL on GHIN number lookups. Key: `ghin:cache:{ghinNum}:{lastName}`.

### ~~Payment failure recovery~~
**Problem:** If Stripe checkout fails mid-payment, the temp config in KV expires after 2 hours. No recovery path.
**Fix:** Show a "Resume checkout" option on the create wizard if a pending temp config exists. Store temp ID in sessionStorage.
**Effort:** S (CC: ~20 min)
**Depends on:** Nothing.
**Status:** Already implemented — abandoned cart banner checks localStorage for `waggle_last_email` and pings `/api/pending-checkout`.

### ~~Refund flow~~
**Status:** DONE — POST `/:slug/api/admin/refund` endpoint calls Stripe Refunds API. Stores refund record in KV.

### ~~Event expiration / cleanup~~
**Status:** DONE — Cron job lists all configs, archives events older than 90 days to D1 `archived_events` table, deletes KV keys. New events get `expiresAt` field (90 days). Skips completed/trophy and demo events.

### ~~Scroll position preservation~~
**Status:** DONE — Already implemented in route(). Captures scrollY and activeElement before re-render, restores after. Now also preserved by morphdom diffing.

### ~~Haptic feedback expansion~~
**Status:** DONE — Added vibrate(30) to fileDispute, shareSettlement, and exportSettlementCard handlers.

---

## P3: Future Vision

### Native iOS/Android wrapper
**Problem:** PWA works but no App Store presence. Some users expect an app.
**Fix:** Capacitor or TWA wrapper around the existing web app. Same codebase, App Store distribution.
**Effort:** XL (human: 3 weeks / CC: ~1 day)
**Depends on:** Product-market fit confirmation.

### League mode (recurring events)
**Problem:** Each outing is standalone. Golf leagues play weekly with season standings.
**Fix:** Season entity that links multiple outings. Cumulative leaderboard, season champion, weekly auto-create.
**Effort:** L (human: 2 weeks / CC: ~3 hours)
**Depends on:** Event system (done). Season endpoints partially exist.

### Multi-language support
**Problem:** English only. Golf is global.
**Fix:** i18n framework for UI strings. Start with Spanish (large US golf market).
**Effort:** L (CC: ~2 hours for extraction + translation)
**Depends on:** Product-market fit.

### Course partnership program
**Problem:** 30K courses loaded but no relationship with course operators.
**Fix:** Course pro dashboard — let courses offer Waggle to their member-guests. White-label option. Revenue share.
**Effort:** XL (business development + engineering)
**Depends on:** Proven traction.

---

## Completed (all sessions)
- [x] betwaggle.com standalone worker deployed
- [x] 9 SEO game guides with JSON-LD
- [x] Email capture + 5-email drip pipeline
- [x] Affiliate page + signup flow
- [x] Promo code system (4 codes)
- [x] QR code on success page
- [x] Commissioner dashboard /my-events/
- [x] Event editing (add/remove players, update games, complete)
- [x] Spectator mode (?spectator=true)
- [x] Formal invitation text generator + default share
- [x] Commissioner referral program ($8 credits)
- [x] Viral settlement share modal (auto-present after round)
- [x] Google Ads + Meta Pixel placeholders wired
- [x] Stripe webhook signature enforcement
- [x] Player approval email notifications
- [x] Round-mode What-If analysis → "The Bar" tab
- [x] Demo exit button
- [x] Feed leader card
- [x] Country club CSS overhaul (paper texture, monospace odds, gold accents, ticker feed)
- [x] Prestige language (The Board, Action, My Lines, Open the Book)
- [x] Venmo deep links in share text
- [x] Page Visibility sync (prevents stacked intervals)
- [x] New logo across all 21 pages
- [x] FAQ accordion fixed (inline specificity override)
- [x] Mobile share with URL parameter
- [x] Design review: color rhythm, AI slop removal, section differentiation
- [x] Action Layer: props backend, double-or-nothing, side bets, Action Card
- [x] "The Bar" tab: par-out projections, trash talk chirps, momentum tracker
- [x] Sportsbook Board: P&L front and center, color-coded win/loss, press button, ticker
- [x] Flash updates: gold row flash + haptic on data change
- [x] Demo events: buddies trip + scramble with pre-seeded scores
- [x] KV concurrency: write mutex + merge-not-overwrite on score POST
- [x] Narrative feed: sportsbook-style auto-generated entries with dollar amounts
- [x] DOM diffing: morphdom alternative for surgical re-renders
- [x] GHIN lookup caching (24h TTL)
- [x] Refund endpoint (Stripe Refunds API)
- [x] Event expiration/cleanup (90-day cron + D1 archive)
- [x] Trophy Room / freeze endpoint
- [x] Event cloning (API + create wizard ?clone=SLUG)
- [x] Bulk player import (CSV/paste + admin UI)
- [x] Haptic feedback expansion
- [x] Scroll position preservation (+ morphdom)
- [x] Settlement AI recap in share text
