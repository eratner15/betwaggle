# Viral UX Sprint 3 Implementation Matrix

Source spec: `docs/viral-ux-sprint-3-game-flow-spec.md`

## Scope status

| Spec area | Status | Implementation notes |
| --- | --- | --- |
| 1) Scoring Cockpit canonical flow | Implemented | Inline score surface is canonical; FAB/modal paths are normalized to inline composer behavior via app runtime shim in `app/index.html`. |
| 1.2 Persistent progress strip | Implemented | Progress strip copy/state (`Hole X of Y`, completed/remaining, waiting/missing, ready-to-save state) is now enforced by runtime shim fallback in `app/index.html` and remains present in protected core render path. |
| 1.3 Validation + first-invalid focus | Implemented | Input validation/focus guard enforced by shim in `app/index.html`; save prevented until valid. |
| 1.4 Save + auto-advance + queued/offline state | Implemented | Save/auto-advance behavior exists in protected core render/state paths; shim now also enforces a visible sync-state chip (`Queued` / `Syncing` / `Synced`) in `app/index.html`. |
| 1.5 Mobile-first controls | Implemented | Sticky save bar behavior + minimum CTA height enforced by shim; mobile inline input target set to 56px in `app/css/styles.css`. |
| 2.1 Round complete transition panel | Implemented | `Round Complete` + `Review Settlement` + `Edit Last Hole` panel already present in protected core render path (`app/js/views.js`). |
| 2.2 Settle Round helper copy | Implemented | Helper copy is injected below `Settle Round` controls by shim (`app/index.html`). |
| 2.3 Blocked settlement summary | Implemented | Incomplete-round settlement blocker summary exists in protected core settlement render path; shim now adds explicit `Remaining: ...` fallback copy on `#settle` when blocked state is detected. |
| 3) Settlement action-first hierarchy | Implemented | Event header, payment rows, share/export CTAs, and details accordion ordering exist in protected core settlement render path; shim adds payment-attempt status chips (`Opened Venmo` / `Copied payment details`) in `app/index.html`. |
| 4) State/error matrix behaviors | Implemented (major states) | Core state transitions are in protected JS; shim augments save validation and telemetry path consistency. |
| 5) Telemetry schema | Implemented | Client emission in `app/index.html`; backend route + normalization in `worker.js` (`/api/ux-telemetry`). |
| 9) Feature flag / rollout | Implemented | Runtime shim now defaults to disabled unless `ux_sprint3_gameflow` is explicitly enabled in state config (or query override `?ux_sprint3_gameflow=1`), keeping Sprint 3 behavior behind the intended flag gate. |

## Files touched for Sprint 3 closeout (this lane)

- `app/index.html` (runtime UX/telemetry shim hardening + progress strip/sync chip/payment status chips + blocked settlement summary fallback + strict feature-flag gate)
- `app/css/styles.css` (mobile touch-target enforcement for inline score inputs)
- `worker.js` (UX telemetry endpoint + payload normalization already present)

## Protected-core constraints

The spec names direct edits in:

- `app/js/views.js`
- `app/js/app.js`

These files are currently read-only for this agent lane. Where direct edits were not allowed, equivalent behavior was implemented via the runtime shim path in `app/index.html` and documented here.
