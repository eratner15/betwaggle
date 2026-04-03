## COO Ops Status — 2026-04-03 14:21 EDT

### Pricing audit
- Canonical targets: `$32/event` and `$149/season pass`
- `$199` references in audited core/public pricing surfaces: **not found**
- Remaining pricing drift: multiple `$149/season` strings still present in homepage, `/tour/`, `/pricing/`, `/create/`, `worker.js`, and affiliate welcome email.
- Artifact: `inventory/pricing-audit-spreadsheet-2026-04-03-caddie-handoff.csv`

### Demo health
- `/demo/` live route status: `200`
- Local smoke checks:
  - `tests/simulation.test.js` -> pass
  - `tests/betting.test.js` -> pass
- Artifact: `inventory/demo-monitor-2026-04-03-caddie-handoff.md`

### QA coordination (Spotter/P0-P1)
- Spotter-assigned open high/critical bug/QA items: tracked in artifact
- Unassigned open high/critical bug/QA items (current slice): `0`
- Artifact: `inventory/qa-open-bugs-spotter-p0-p1-2026-04-03-caddie-handoff.csv`

### Page inventory + route risk
- Blocking production issues:
  - `/tour/` -> `307` self-loop
  - `/pricing/` -> `404`
- Internal doc routes blocked (`/marketing/`, `/gtm/`, `/ads/` -> `404`)
- Legacy known-404 set now redirecting:
  - `/join/` -> `/create/`
  - `/about/` -> `/overview/`
  - `/games/stroke-play/`, `/games/round-robin/`, `/games/chapman/` -> `/games/`
- Artifact: `inventory/page-inventory-2026-04-03-caddie-handoff.csv`

### Funnel note
- Email capture nurturing remains an active ops risk; backend/drip reliability issues still open under engineering/QA tickets (e.g., `BET-185`, `BET-54`, `BET-312`).
