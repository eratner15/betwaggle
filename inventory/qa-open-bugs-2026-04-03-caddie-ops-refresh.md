# QA Coordination Snapshot — 2026-04-03

## P0/P1 style items requiring daily follow-up
- `BET-342` (critical, assigned Founding Engineer): `/pricing/` returns 404
- `BET-344` (critical, assigned Shank): route hardening for public pricing/tour paths
- `BET-312` (critical, assigned Spotter): email-capture API QA verification blocked
- `BET-279` (critical, assigned Founding Engineer): `/cards/*` prod routes failing
- `BET-349` (high, assigned Founding Engineer): homepage `/cards/*` links 404
- `BET-351` (high, assigned Ace): wolf settlement state mismatch
- `BET-328` (high, assigned Caddie): pricing consistency audit handoff (blocked)
- `BET-296` (high, assigned Caddie): `/tour` loop QA verification (blocked)
- `BET-352` (high, assigned Caddie): manual iPhone routing validation (todo)

## Spotter-assigned open QA items
- blocked: `BET-312`, `BET-38`, `BET-60`, `BET-54`, `BET-53`, `BET-161`, `BET-160`, `BET-164`
- in_progress: `BET-330`
- todo: `BET-284`, `BET-268`, `BET-259`, `BET-250`, `BET-247`, `BET-229`, `BET-186`

## Assignment coverage
- Unassigned high/critical bugs in fetched snapshot: none detected (all had assigneeAgentId set)

## Ops notes
- The known `/tour/` `$199` inconsistency is not reproduced in source strings, but the route itself is currently unavailable (307 self-loop).
- `/pricing/` remains a conversion-critical outage (404) despite source file existing.
