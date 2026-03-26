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
- [ ] Test full flow: create outing → pay → get success page → share link → player joins → score holes → settle

---

## P1: Critical Architecture (v2 sprint)

### Durable Objects migration (KV concurrency)
**Problem:** Cloudflare KV is eventually consistent. Two carts submitting scores simultaneously can overwrite each other. Current mitigation: timestamp-based conflict detection + dispute resolution UI.
**Fix:** Migrate live game state (scores, bets, game-state) to Cloudflare Durable Objects for single-threaded, transactional writes. Keep KV for configs and static data.
**Effort:** L (human: 2 weeks / CC: ~4 hours)
**Risk:** Architecture change — needs careful migration path. Events created before migration need backward compat.
**Depends on:** Nothing — can be done independently.

### DOM diffing (performance)
**Problem:** views.js re-renders entire innerHTML every 30s sync. On mobile: destroys scroll position, cancels touch highlights, drains battery.
**Fix:** Implement targeted DOM updates — only mutate elements whose data changed. Options: (A) morphdom library, (B) manual ID-targeted updates for scores/standings, (C) virtual DOM (preact/htm).
**Effort:** M (human: 1 week / CC: ~2 hours)
**Risk:** Low if using morphdom (drop-in). High if manual (lots of IDs to track).
**Depends on:** Nothing.

### WebSocket real-time push
**Problem:** 30s polling means scores take up to 30s to appear on other devices. The .live-dot pulses but the data is stale.
**Fix:** Cloudflare Durable Objects + WebSocket connections. When a score is submitted, push to all connected clients instantly.
**Effort:** L (human: 2 weeks / CC: ~4 hours)
**Risk:** Requires Durable Objects (bundle with that migration).
**Depends on:** Durable Objects migration.

---

## P1: User Experience (v2 sprint)

### Trophy Room (permanent event URLs)
**Problem:** After an event ends, the URL still shows the live sportsbook UI. No way to "lock" it as a permanent record.
**Fix:** When commissioner marks event complete, freeze the URL into a read-only "Trophy Room" state. Show final standings, settlement, AI recap, memorable moments. This becomes a digital monument — guys link back to it for years.
**Effort:** M (human: 1 week / CC: ~1 hour)
**Depends on:** Event completion flow (already built — POST /event/complete).

### Event cloning
**Problem:** Commissioner runs the same trip every year. No way to duplicate an event with same players/games/course.
**Fix:** "Clone this event" button on /my-events/ that pre-fills the create wizard with last year's config.
**Effort:** S (human: 2 days / CC: ~20 min)
**Depends on:** Commissioner dashboard (done).

### Co-organizer support
**Problem:** Single admin PIN per event. If commissioner loses PIN, no recovery. Can't invite a co-organizer.
**Fix:** Allow multiple admin emails per event. Each gets their own magic link. Commissioner can invite co-admins from the admin panel.
**Effort:** M (human: 1 week / CC: ~1 hour)
**Depends on:** Magic link auth (done).

### Bulk player import on existing events
**Problem:** Can only add players one at a time after event creation (POST /event/add-player). Large groups (20+) need CSV/paste import.
**Fix:** Add CSV/paste import to the admin player management tab (same parser as create wizard).
**Effort:** S (human: 2 days / CC: ~15 min)
**Depends on:** Event editing (done).

---

## P2: Growth & Marketing

### Settlement card AI recap in share text
**Problem:** The AI recap (getRecap) generates great narrative but it's buried. Not included in the share payload.
**Fix:** After round completes, auto-fetch recap and append a 1-2 sentence snippet to the settlement share text. "Tiger closed out the front with a clutch birdie on 9. Rory's skins haul was the story of the day."
**Effort:** S (human: 1 day / CC: ~15 min)
**Depends on:** AI recap endpoint (done), settlement share (done).

### Formal invitation generator
**Problem:** Success page has "Copy Formal Invitation" but the auto-share flow (iMessage) doesn't use it.
**Fix:** Make the formal invitation the DEFAULT share text when commissioner taps "Share with Group" on success page. Not the raw URL.
**Effort:** S (CC: ~10 min)
**Depends on:** Nothing.

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

### Email drip testing
**Problem:** 5-email drip sequence is coded but never been tested end-to-end. Cron runs weekly.
**Fix:** Manually trigger each drip email, verify delivery, check formatting, test unsubscribe.
**Effort:** S (CC: ~15 min)
**Depends on:** Resend domain verification.

---

## P2: Polish & Edge Cases

### GHIN lookup caching
**Problem:** Every GHIN search hits the API. If the app re-renders or multiple users search the same name, it hits the API repeatedly.
**Fix:** Cache GHIN lookups in KV with 24h TTL. Key: `ghin:cache:{name_hash}`.
**Effort:** S (CC: ~10 min)
**Depends on:** Nothing.

### Payment failure recovery
**Problem:** If Stripe checkout fails mid-payment, the temp config in KV expires after 2 hours. No recovery path.
**Fix:** Show a "Resume checkout" option on the create wizard if a pending temp config exists. Store temp ID in sessionStorage.
**Effort:** S (CC: ~20 min)
**Depends on:** Nothing.

### Refund flow
**Problem:** No way to refund if event is cancelled. Stripe charge exists but no admin endpoint to trigger refund.
**Fix:** Add POST /api/admin/refund endpoint that calls Stripe Refunds API. Commissioner-only, requires event slug + reason.
**Effort:** S (CC: ~20 min)
**Depends on:** Nothing.

### Event expiration / cleanup
**Problem:** Events persist in KV forever. Old events from months ago still accessible.
**Fix:** Add a `expiresAt` field to event config. Cron job cleans up events older than 90 days (or moves to D1 archive). Show "This event has ended" page for expired slugs.
**Effort:** M (CC: ~30 min)
**Depends on:** Nothing.

### Scroll position preservation
**Problem:** Every 30s sync re-renders innerHTML, destroying scroll position.
**Fix:** Before re-render, capture `scrollTop`. After render, restore it. Also preserve focused input state.
**Effort:** S (CC: ~10 min)
**Depends on:** Nothing. Quick win while DOM diffing is a bigger project.

### Haptic feedback expansion
**Problem:** Haptic only on score submit and bet placement. Missing on: press accepted, dispute resolved, settlement exported.
**Fix:** Add navigator.vibrate(30) to press, dispute, and export handlers.
**Effort:** S (CC: ~5 min)
**Depends on:** Nothing.

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

## Completed (this session)
- [x] betwaggle.com standalone worker deployed
- [x] 9 SEO game guides with JSON-LD
- [x] Email capture + 5-email drip pipeline
- [x] Affiliate page + signup flow
- [x] Promo code system (4 codes)
- [x] QR code on success page
- [x] Commissioner dashboard /my-events/
- [x] Event editing (add/remove players, update games, complete)
- [x] Spectator mode (?spectator=true)
- [x] Formal invitation text generator
- [x] Commissioner referral program ($8 credits)
- [x] Viral settlement share modal (auto-present after round)
- [x] Google Ads + Meta Pixel placeholders wired
- [x] Stripe webhook signature enforcement
- [x] Player approval email notifications
- [x] Round-mode What-If analysis
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
