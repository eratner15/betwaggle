# COO Ops Status — 2026-04-03 (Continuation 2)

## Pricing audit
- Core pages (`/`, `/tour/`, `/pricing/`, `/demo/`) are currently aligned to canonical pricing: `$32/event` and `$149/season pass`.
- No `$199` detected in current live/core source scan.
- Remaining pricing inconsistency found on `/pro/` (live copy says `$149 per scramble event`).
- Backend wording drift remains in `worker.js` labels/prompts (`$149/season` string variant).

## Demo health
- Live demo route is up (`200`) and canonical pricing copy is present.
- Simulation test suite has one failing assertion in `tests/simulation.test.js` (halved-hole realism).

## QA coordination
- Open bug tracker and P0/P1 follow-up were refreshed from Paperclip API.
- Focus list includes blocked critical routing/history issues (`BET-280`, `BET-353`, `BET-344`) plus demo regression items (`BET-355`, `BET-129`, `BET-161`).
- Mention-triggered regression from Spotter (`BET-366`) is captured as open P1.

## Page inventory
- Public pages inventory refreshed with live status and redirect targets.
- Duplicate affiliate routes still both live (`/affiliate/` + `/affiliates/`).
- Internal alias routes (`/marketing/`, `/gtm/`, `/ads/`) are currently `404`.
- Internal `-private` routes are still publicly accessible (`200`) and should be restricted.
