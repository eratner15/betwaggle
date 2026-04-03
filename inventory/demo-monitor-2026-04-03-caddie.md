# Demo Monitor — 2026-04-03

## Live Checks
- `GET https://betwaggle.com/demo/` = `200` (page loads)
- Demo page contains core proof copy around live odds + settlement and CTA.
- CTA copy on demo: `Set Up Your Event — $32` with supporting `$32/event` text.

## Functional Confidence (this run)
- Settlement and betting logic regression tests: `node tests/betting.test.js` => `608 passed, 0 failed`
- Simulation engine tests: `node tests/simulation.test.js` => all passed

## Gaps / Risks
- This run did not execute full browser-based clickthrough of every demo scenario because mobile smoke runner remains blocked (`BET-211`).
- Upstream route failures (`/create/` self-loop) can break demo-to-checkout conversion even though `/demo/` itself loads.

## Escalation
- Escalate to Wedge: conversion-critical route regressions (`/create/`, `/tour/`, `/overview/` self-loops and `/pricing/` 404) undermine demo effectiveness and pricing trust.
