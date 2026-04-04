# Waggle Core Workflow Spec

**Date:** 2026-04-04
**Status:** IN PROGRESS
**Rule:** Each step must work end-to-end before starting the next. No polish, no skipping.

---

## The Flow

```
CREATE → COURSE → GAMES → LAUNCH → SCORE → CALCULATE → SETTLE
```

---

## Step 1: Course Selection → Scorecard Loading

**Goal:** When a user selects a course, the full scorecard (18 pars, stroke index, slope, rating) flows into the event config and is available to the scoring engine.

**Current state:** Course search returns results from D1 (17K courses), but only 16 have scorecard data. When a course without scorecard data is selected, pars default to all 4s or are empty. The scoring engine needs real pars to calculate handicap strokes, Nassau segments, Stableford points, and birdie/eagle highlighting.

**What must happen:**

1. `/api/courses/search?q=` returns courses with `has_scorecard` flag
2. When user selects a course, `/api/courses/{id}` returns full data including `pars[]` and `strokeIndex[]`
3. If course has no scorecard in D1, show a "Set Pars" UI where user can enter par for each hole (quick: just front 9 + back 9 totals, or hole-by-hole)
4. Selected course pars flow into `config.coursePars` and `config.courseHcpIndex` at event creation
5. On the dashboard, pars are available to the scoring engine at `config.coursePars[holeNum - 1]`

**Acceptance test:**
- Create outing → search "Pebble Beach" → select it → pars array has 18 real values
- Create outing → search "Scottsdale" (no scorecard) → UI lets you enter pars → pars saved
- On dashboard, scorecard header row shows correct par for each hole
- Handicap strokes are calculated correctly from slope + rating + player HI

---

## Step 2: Score Entry for All Players

**Goal:** Any player with the event link can enter scores. Not just admin.

**Current state:** "Start Scoring" button only appears for admin (authenticated with PIN). Regular players see "Waiting for first tee..." The premium inline scorecard and modal both require admin state.

**What must happen:**

1. Any player on the event page can tap the "Score" tab in the bottom nav
2. Scorecard shows all holes with par row and player rows
3. Any player can tap a cell and enter a score (1-12 number picker)
4. Score saves immediately to localStorage (offline-first)
5. Score syncs to server via `POST /:slug/api/hole`
6. Server accepts scores from any authenticated session (not just admin PIN)
7. After each score entry, running totals update and game engines fire

**Auth model change:**
- Admin PIN: still required for settlement, refunds, event config changes
- Score entry: open to anyone with the event link (or require player identity selection first)
- The "Who are you?" picker already exists. Use that as the auth gate for scoring.

**Acceptance test:**
- Open event link as non-admin → tap Score tab → see scorecard with all holes
- Tap hole 1, player 1 cell → number picker appears → enter 4 → cell fills
- Score persists on page reload (localStorage)
- Score syncs to server (check KV)
- Second player on different phone sees the score update

---

## Step 3: Score → Game Engine → Card Update Loop

**Goal:** Every score entry triggers the server-side game engines. The dashboard game cards update in real-time to show current standings.

**Current state:** The server-side engines (wggRunSkins, wggRunNassau, etc.) all fire on `POST /:slug/api/hole`. The client syncs game state after score entry. Game cards render from `state._gameState`. This chain works but needs verification with real scoring flow.

**What must happen:**

1. After score entry, client calls `POST /:slug/api/hole` with `{holeNum, scores}`
2. Server runs all enabled game engines against the new scores
3. Server saves updated `gameState` to KV
4. Client syncs via `GET /:slug/api/state` and `GET /:slug/api/game-state`
5. Dashboard re-renders with updated game cards
6. Each game card shows correct data:
   - **Nassau:** Front/Back/Total standings, press indicators
   - **Skins:** Pot multiplier, won/carried per hole, winner names
   - **Wolf:** Holes won per player, current wolf rotation
   - **Vegas:** Team scores
   - **Stableford:** Points per player
   - **Match Play:** UP/DN/AS status, dormie detection
   - **Banker:** Running score, current banker
   - **BBB:** Points per player
   - **Bloodsome:** Net scores

**Acceptance test:**
- Enter scores for holes 1-3 for all players
- After each hole: verify Nassau card updates front 9 standings
- After each hole: verify Skins card shows winner or carry
- Verify running totals in scorecard match expected math
- Verify game cards appear on Home tab (not just in scorecard view)

---

## Step 4: Settlement

**Goal:** After 18 holes (or manual trigger), the settlement tab shows who owes who, with per-game breakdowns, and the net always equals $0.00.

**Current state:** `computeRoundPnL` in views.js handles all 11 game formats. Settlement view exists. Net-zero invariant should hold but needs verification with real scoring.

**What must happen:**

1. After all 18 holes scored, "Settle" tab becomes active in bottom nav
2. Settlement page shows per-game breakdown:
   - Nassau: front winner, back winner, overall winner, press results
   - Skins: who won how many, at what pot level
   - Each game: individual P&L per player
3. Final ledger: "Player A owes Player B $X" for each debt
4. Net across all players = $0.00 (critical invariant)
5. "Share Settlement Card" generates shareable image
6. Venmo/CashApp deep links for each payment

**Acceptance test:**
- Complete 18 holes of scoring with 3-4 players
- Verify each game's settlement math by hand for at least one game
- Verify total P&L sums to $0.00
- Verify settlement card generates and is shareable
- Edge case: all players tie on a hole (skins carry)
- Edge case: nassau press at hole 7, verify press settles separately

---

## Execution Order

| # | Step | Depends On | Files |
|---|------|-----------|-------|
| 1 | Course → scorecard pipeline | Nothing | worker.js, create/index.html, app/js/views.js |
| 2 | Player score entry | Step 1 (needs pars) | worker.js, app/js/app.js, app/js/views.js |
| 3 | Score → engine → cards | Step 2 (needs scores) | worker.js, app/js/views.js |
| 4 | Settlement | Step 3 (needs game state) | app/js/views.js |

**Each step: build → test manually → verify → move on.**
