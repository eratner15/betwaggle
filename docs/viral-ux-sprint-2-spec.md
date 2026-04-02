# Viral UX System Spec (Sprint 2)

Owner: Design Engineer  
Issue: BET-16  
Parent: [BET-5](/BET/issues/BET-5)

## Objective

Define implementation-ready UX specs for the viral loop:
1. Invite/share from event creation and in-event admin surfaces.
2. Join flow for invited players.
3. Post-game replay/reinvite loop after settlement.

This spec targets existing surfaces in:
- `create/index.html`
- `register/index.html`
- `app/js/views.js`
- `app/js/app.js`

## Prioritized Recommendations (By Expected Impact)

1. **P0: Tighten invite copy and CTA hierarchy in create success state**
Impact: Highest activation lift. Current invite text is long and not scannable in group chat.

2. **P0: Add explicit post-settlement "Run It Back" reinvite CTA**
Impact: Highest retention lift. Settlement is already a high-intent moment.

3. **P1: Reduce join friction with clearer trust + effort cues on register page**
Impact: Medium-high activation lift from invited players.

4. **P1: Improve mobile-first layout rhythm for invite and settlement cards**
Impact: Medium conversion lift, especially in iMessage/group chat handoff.

5. **P2: Add replay-oriented copy variants (trip/day-2/rematch modes)**
Impact: Medium retention lift; mostly copy and light state wiring.

## 1) Invite/Share Flow Spec

### Current Entry Points
- Create success card: `create/index.html` (Share button + QR + join URL)
- Admin panel link copy: `app/js/views.js` (`joinUrl` block)

### Desired Behavior

#### 1.1 CTA Stack (Create Success)
Desktop:
- Primary CTA: `Share Invite`
- Secondary CTA: `Copy Link`
- Tertiary CTA: `Show QR`

Mobile:
- Primary full-width button fixed in card: `Share Invite`
- Secondary inline actions below: `Copy` and `QR`

Implementation notes:
- Keep existing `shareUrl(u)` but change label text and button ordering.
- Ensure `navigator.share` path is first on mobile, clipboard fallback second.

#### 1.2 Invite Message Copy Hierarchy
Update generated share text to this order:
1. Hook line: `You're in: {eventName}`
2. Stakes line: `Stakes: {game/bet summary}`
3. Urgency line: `Join in 30 sec. No app needed.`
4. URL line only (final line)

Rules:
- Max 5 lines total.
- First line under 42 chars for chat preview truncation.
- Remove filler phrasing.

#### 1.3 Trust and Clarity Row
In create success state, add a 3-chip proof row under primary CTA:
- `No app download`
- `Works on any phone`
- `Live scores + instant settle`

Visual spec:
- Chip font: 12px/600
- Radius: pill
- Horizontal scroll on mobile if needed; no wrapping into 3+ lines.

## 2) Join Flow Spec (`register/index.html`)

### 2.1 Above-the-fold Hierarchy
Top order on load:
1. Event name
2. Date + course meta
3. Single-sentence value prop: `Register your team in under a minute.`
4. Form start

Change request:
- Reduce visual dominance of fee box unless fee > 0.
- Keep fee visible but demote with smaller vertical padding and less contrast.

### 2.2 Form Friction Reductions
- Keep required labels explicit but shorten helper text.
- Add inline microcopy under captain email:
  - `Used for updates and payout reminders only.`
- Auto-focus first empty required field after validation failure.
- Sticky submit bar on mobile after first scroll past button:
  - Text: `Register Team`
  - Preserve existing submit behavior.

### 2.3 Social Proof Block
When teams exist, move count summary above form card:
- `X teams already in`
- Optional first 3 team names (truncated) below.

Goal: establish momentum before form completion.

## 3) Post-Game Replay/Reinvite Spec

### Current Entry Points
- Settlement share actions in `app/js/views.js` and `app/js/app.js` (`shareSettlement()`)

### 3.1 New "Run It Back" CTA Cluster
Placement: settlement completion panel, directly below existing share results action.

Buttons:
- Primary: `Run It Back`
- Secondary: `Replay With Same Group`

Behavior:
- `Run It Back` opens prefilled create flow (`/create?clone={slug}`) for next round.
- `Replay With Same Group` triggers invite copy using existing player roster and prior stakes.

### 3.2 Replay Copy Template
Default replay message:
1. `Run it back at {eventName}?`
2. `Same group, same format, new round.`
3. `Tap to join the replay:`
4. URL

### 3.3 Replay State Badge
On settlement card/share text, append short badge:
- `Round complete. Replay open.`

Use only when replay link exists.

## 4) Responsive Behavior Requirements

### Mobile (primary)
- Primary CTA min height: 48px
- Minimum tappable target: 44x44
- Single-column stacks for invite + join sections
- Avoid side-by-side primary actions

### Desktop
- Keep concise action grouping; max 3 visible primary actions per module
- Preserve information density but maintain visual reading order from left-to-right

## 5) Copy System Rules

### Primary CTA verbs
Use only:
- `Share Invite`
- `Join Event`
- `Share Results`
- `Run It Back`

### Secondary CTA verbs
Use only:
- `Copy Link`
- `Show QR`
- `Preview`

### Tone constraints
- No internal jargon.
- Sentence case only.
- Keep every CTA to 1-3 words.

## 6) Engineering Visual QA Checklist

Use this checklist before CEO review.

### Invite/Share QA
- [ ] Create success page shows CTA order: Share Invite, Copy Link, Show QR.
- [ ] Share payload follows 4-line hierarchy and includes URL last.
- [ ] Mobile share uses native sheet when available.
- [ ] Clipboard fallback confirms with visible success feedback.
- [ ] Proof chips remain readable at 320px width.

### Join QA
- [ ] Register page value prop is visible above form on first paint.
- [ ] Fee block is visually de-emphasized when fee is non-critical.
- [ ] Validation sends focus to first invalid required field.
- [ ] Sticky mobile submit appears only after scroll threshold.
- [ ] Team momentum block renders correctly when at least one team exists.

### Replay/Reinvite QA
- [ ] Settlement surface includes Run It Back CTA cluster.
- [ ] Run It Back deep-links to clone flow with current event slug.
- [ ] Replay invite message uses replay template and correct URL.
- [ ] Replay badge appears only when replay entry point is enabled.
- [ ] Share Results action remains functional and unchanged in fallback path.

### Cross-device QA
- [ ] iOS Safari + Chrome Android + desktop Chrome pass core flow.
- [ ] No CTA truncation at 320px, 375px, 768px, 1024px.
- [ ] All new controls pass keyboard focus visibility and tab order.

## 7) Acceptance Criteria

This sprint is complete when:
1. Invite flow copy/CTA hierarchy is updated and implemented on create/admin surfaces.
2. Join page friction improvements are implemented with no regression to submit flow.
3. Settlement includes replay/reinvite CTA and template copy path.
4. QA checklist is fully green in engineering self-test before CEO signoff.
