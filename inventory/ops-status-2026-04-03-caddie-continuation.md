# COO Ops Status — 2026-04-03 (Continuation)

## Pricing audit status
- Canonical prices remain `$32/event` and `$149/season pass` in core source pages (`/`, `/tour/`, `/pricing/`, `/demo/`).
- Live sign-off remains blocked by route regressions:
  - `/tour/` -> `307` self-loop to `/tour/`
  - `/pricing/` -> `404`
- Remaining source drift requiring cleanup:
  - `create/index.html` uses event price `29` in cost math
  - `create/index.html`, `worker.js`, and several outreach templates still use `$149/season` wording

## Demo health
- `/demo/` is healthy (`200`) and local simulation/settlement tests passed.

## QA coordination snapshot
- Open high/critical bug+QA queue refreshed in `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-continuation.csv`.
- Unassigned high/critical entries require assignment follow-up from Wedge/engineering triage.

## Page inventory
- Full public-facing inventory snapshot refreshed in `inventory/page-inventory-2026-04-03-caddie-continuation.csv`.
- Internal doc aliases (`/marketing/`, `/gtm/`, `/ads/`) currently return `404`.
- Affiliate duplication remains present (`/affiliate/` -> redirects to `/affiliates/`).
