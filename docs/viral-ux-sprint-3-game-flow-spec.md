# Viral UX System Spec (Sprint 3)

Owner: Design Engineer  
Issue: BET-23  
Parent: [BET-5](/BET/issues/BET-5)

## Objective

Eliminate high-friction moments in live score entry and round settlement so a group can move from "first score entered" to "round settled + shared" without confusion, double-entry, or dead ends.

This sprint targets existing round-mode surfaces in:

- `app/js/views.js`
  - `renderCasualScorecard()`
  - `renderPremiumScorecard()`
  - `renderSettlement()`
  - `renderScoreEntryOverlay()`
- `app/js/app.js`
  - `inlineScore*` handlers
  - `submitHoleScores()` and `inlineScoreSave()`
  - `settleRound()`

## Current-State Friction Audit

### P0 Friction 1: Two competing score-entry patterns

Current behavior:

- Inline scorecard entry (`renderPremiumScorecard`) and modal entry (`renderScoreEntryOverlay`) both exist.
- Round-mode users can enter through different controls (`#score-fab`, overlay, table inputs), creating uncertainty around the primary path.

Observed risk:

- Users don't know where "official" scoring happens.
- Increased chance of duplicate or partial entry in fast pace live rounds.

### P0 Friction 2: Ambiguous progression from scoring to settlement

Current behavior:

- Users see "View Settlement" only after round-complete conditions, but in-flight there is weak guidance on what remains.
- Settlement auto-share modal appears after completion, but pre-completion state does not clearly indicate remaining required actions.

Observed risk:

- Commissioners stall after entering many holes because completion criteria is implicit.
- More support loops around "why no settlement yet?"

### P1 Friction 3: Dense scorecard cards create scan fatigue on mobile

Current behavior:

- Multi-table scorecard with style-rich cells can become visually heavy at 320-390px widths.
- Key progress info (holes remaining, completion status, who is missing) is distributed across sections.

Observed risk:

- Slower scoring during live play and more miss-taps.

### P1 Friction 4: Settlement card is comprehensive but not action-prioritized

Current behavior:

- Settlement includes many game modules (Skins/Nassau/Wolf/etc.) before or around payout action.
- The highest-intent action (pay now/share now) competes with informational blocks.

Observed risk:

- Users fail to complete payment sharing loop in group chat.

## Design Principles (Sprint 3)

1. One primary action per stage.
2. Completion visibility always-on (what's done, what's left, what's blocked).
3. Mobile-first input speed (tap confidence over data density).
4. Settlement first, details second.

## Before vs After Flows

## Before (today)

1. Enter score via inline table or open modal.
2. Save hole.
3. Repeat until done.
4. Discover settlement entry after completion.
5. Share/export from settlement view.

## After (Sprint 3)

1. **Score tab opens into one canonical "Scoring Cockpit" state.**
2. User sees persistent progress strip: `Hole X of Y`, `N holes left`, `missing players`.
3. User enters scores in a single primary composer and taps `Save Hole X`.
4. After save, UI auto-advances to next hole and confirms `Saved • Hole X complete`.
5. At completion, UI transitions to `Round Complete` state with one primary CTA: `Review Settlement`.
6. Settlement opens in action-first mode: `Who pays who` and `Share Results` are topmost.

## Sprint 3 UX Spec

## 1) Scoring Cockpit (Primary Round Entry Surface)

### 1.1 Canonical entry

- Keep one primary score-entry path in round mode: inline premium scorecard in `renderPremiumScorecard()`.
- Keep modal path as fallback only (device-constrained or explicit quick action).
- `#score-fab` must always deep-link to the same active hole composer state.

### 1.2 Persistent progress strip (new)

Placement: directly above score matrix.

Content:

- `Hole {currentHole} of {holesPerRound}`
- `{completedHoles} complete • {remainingHoles} left`
- `Missing: {playerShortNames}` when current hole incomplete

Behavior:

- Updates immediately on each score input.
- Turns green check state when all players are valid for current hole.

Copy:

- Incomplete: `Waiting on 2 scores`
- Ready: `All scores in • ready to save`

### 1.3 Input constraints and validation

- Accept integer 1-15 only.
- Reject out-of-range values inline with helper text under input:
  - `Enter 1-15`
- Disable save until all required players are valid.
- On invalid submit attempt, scroll/focus first invalid input.

### 1.4 Save and auto-advance

On success:

- Toast: `Hole {n} saved`
- Auto-advance to next unscored hole.
- Preserve manual override to jump holes.

On failure (network):

- Non-blocking warning: `Offline — score queued`
- Surface sync state chip: `Queued` / `Syncing` / `Synced`

### 1.5 Mobile vs desktop behavior

Mobile:

- Sticky bottom action bar with primary button `Save Hole {n}`.
- Min target 44x44, primary button min height 48.
- Horizontal scroll safe area for hole columns.

Desktop:

- Progress strip + save button pinned to top of score card container.
- Keyboard support: Enter saves when form valid.

## 2) Round Completion + Settlement Transition

### 2.1 Completion gate clarity

When last required hole is saved:

- Replace save bar with completion state panel:
  - Title: `Round Complete`
  - Subtitle: `All {holesPerRound} holes scored`
  - Primary CTA: `Review Settlement`
  - Secondary CTA: `Edit Last Hole`

### 2.2 Settle Round (admin round mode)

In admin score rows (`renderAdminScores`):

- Keep `Settle Round` only when all matches scored and not final.
- Add helper copy under button:
  - `Finalizes remaining matches and settles active bets.`

### 2.3 Empty/incomplete settlement states

If settlement opened before complete:

- Display explicit blocker summary:
  - `Settlement available after all holes are scored.`
  - `Remaining: Hole 14 (2 players), Hole 15 (1 player)`

## 3) Settlement Card Prioritization

### 3.1 Action-first hierarchy (top)

Order at top of `renderSettlement()`:

1. Event header
2. `Who pays who` module
3. Primary action row:
   - `Share Results`
   - `Export Card`
4. Secondary details accordion:
   - `Skins`
   - `Nassau`
   - `Wolf`
   - Other game modules

### 3.2 Payment action affordance

- Keep Venmo/Cash App CTA pair for each payout row.
- Add explicit status chip after tap attempt:
  - `Opened Venmo`
  - `Copied payment details`

### 3.3 Copy standards

Primary verbs:

- `Save Hole`
- `Review Settlement`
- `Share Results`
- `Export Card`
- `Pay with Venmo`
- `Pay with Cash App`

Tone:

- Sentence case
- 1-4 words for button labels
- No internal terms (avoid "compute", "sync mutation", etc.)

## 4) States and Error Handling Matrix

### 4.1 Score entry states

- `idle`: no edits yet on hole.
- `editing`: at least one value changed.
- `invalid`: one or more inputs out of range/missing.
- `ready_to_save`: all players valid.
- `saving`: API in flight.
- `saved`: success toast + auto-advance.
- `queued_offline`: local queue with sync chip.
- `save_error`: retriable failure with `Try again`.

### 4.2 Settlement states

- `blocked_incomplete_round`
- `ready_with_payouts`
- `ready_no_payout_changes` (all even)
- `share_in_progress`
- `share_failed` (fallback copy link)

## 5) Telemetry Spec (Required)

Emit these events to validate friction reduction.

## 5.1 Score flow events

- `score_entry_opened`
  - props: `event_slug`, `hole`, `entry_surface` (`inline|modal|fab`), `device_type`
- `score_input_changed`
  - props: `event_slug`, `hole`, `player_count_filled`, `player_count_total`
- `score_save_attempted`
  - props: `event_slug`, `hole`, `is_valid`, `is_offline`
- `score_save_succeeded`
  - props: `event_slug`, `hole`, `latency_ms`, `auto_advanced`
- `score_save_failed`
  - props: `event_slug`, `hole`, `error_code`, `is_retry`
- `round_completed`
  - props: `event_slug`, `holes_per_round`, `duration_sec_from_first_save`

## 5.2 Settlement events

- `settlement_viewed`
  - props: `event_slug`, `holes_played`, `has_payouts`
- `settlement_payment_cta_clicked`
  - props: `event_slug`, `provider` (`venmo|cashapp`), `amount`
- `settlement_shared`
  - props: `event_slug`, `method` (`native_share|image_export|copy_link`)

## 5.3 KPI targets

- `score_save_failed / score_save_attempted` < 2%
- Median `score_save_succeeded.latency_ms` < 1200ms
- `round_completed` rate per started round +15% vs baseline
- `settlement_shared` within 5 min of `round_completed` +20% vs baseline

## 6) FE Implementation Task Map

1. `FE-1` Scoring Cockpit unification
- Files: `app/js/views.js`, `app/js/app.js`
- Deliverables: canonical score entry path, progress strip, save-state messaging

2. `FE-2` Validation + focus management
- Files: `app/js/views.js`, `app/js/app.js`
- Deliverables: input constraints, first-invalid focus, clear error copy

3. `FE-3` Completion transition panel
- Files: `app/js/views.js`
- Deliverables: deterministic `Round Complete` transition with primary CTA

4. `FE-4` Settlement prioritization
- Files: `app/js/views.js`
- Deliverables: action-first reorder + details accordion behavior

5. `FE-5` Telemetry wiring
- Files: `app/js/app.js`, `app/js/views.js`, analytics adapter file (existing tracking util)
- Deliverables: event emission for section 5 schema

## 7) Acceptance Criteria

1. Round mode exposes one primary score-entry path and explicit progress visibility.
2. Save is disabled until all required inputs are valid; invalid attempts focus first error.
3. After final hole save, user sees a direct transition to `Review Settlement`.
4. Settlement top section prioritizes payout and sharing actions before detailed game modules.
5. Telemetry events in section 5 are emitted with required properties.
6. No regressions in existing game computations (Skins/Nassau/Wolf/vegas/stroke).

## 8) QA Checklist (Desktop + Mobile)

### 8.1 Scoring flow

- [ ] iOS Safari: score hole, auto-advance, and save state behave correctly.
- [ ] Android Chrome: sticky save bar remains visible and tappable.
- [ ] Desktop Chrome: keyboard entry + Enter save works only when valid.
- [ ] Invalid values show inline guidance and prevent submission.
- [ ] Offline mode queues score and shows sync status.

### 8.2 Completion + settlement

- [ ] Final hole completion always reveals `Review Settlement` CTA.
- [ ] Incomplete rounds show blocker summary in settlement view.
- [ ] `Who pays who` appears above secondary game modules.
- [ ] Share/export actions remain functional in all supported browsers.

### 8.3 Payments + share

- [ ] Venmo deep link attempts app open and falls back safely.
- [ ] Cash App link opens correctly.
- [ ] Share Results works with native share and fallback copy path.

### 8.4 Regression checks

- [ ] Existing admin `Settle Round` still finalizes scored matches.
- [ ] Existing game result math is unchanged when input scores are identical.
- [ ] No visual clipping at 320px, 375px, 768px, and 1024px widths.

## 9) Rollout Notes

- Ship behind a feature flag: `ux_sprint3_gameflow`.
- Soft launch to new round-mode events only for first 1 week.
- Validate KPI movement before broad rollout.
