# Changelog

All notable changes to BetWaggle are documented in this file.

## [0.20.0.0] - 2026-04-01

### Added
- **5 Stitch game cards** at `/cards/` — Skins, Nassau, Wolf, Match Play, Scramble with Heritage Greens design
- **"Play Free" CTAs** on every card page linking to `/create/?format=[game]&tier=free`
- **Outdoor Mode** — sun/moon toggle in header switches to high-contrast dark theme for on-course sunlight. Persisted in localStorage.
- **Format-specific game panels** on Board tab:
  - Skins Tracker with carryover badges and skins leaderboard
  - Nassau Status with three-bet layout, leader margins, and press tracking
  - Wolf Rotation with player bar, pick history, and Wolf Hammer countdown
  - Scramble: Team Skins overlay, CTP/Long Drive preview, Prize Pool summary
- **4 new game-specific demos**: demo-skins (Pinehurst), demo-nassau (Baltusrol), demo-wolf (Merion), demo-match-play (Oakmont)
- **Upgraded score entry** — 52px buttons, 48px nav arrows, 28px hole header, collapsible stats
- **Score change CSS animations** — flash-green/red/gold on updates, slide-up for new elements
- **views-shared.js** — shared utility module (escHtml, getSkinsHoles, renderSkinsPanel, course helpers)
- **worker-seeds.js** — 13 seed functions extracted from worker.js (1,059 lines)
- **WebSocket scaffolding** in sync.js — feature-flagged client-side connection with auto-reconnect
- **Regression test suite** — 16 tests for generateMatches() edge cases
- **Demo page** upgraded with all 6 dashboards + 5 game card previews

### Fixed
- **P0: generateMatches() crash** on empty pairings — broke ALL Weekend Warrior events
- **Create flow ?format= param** — auto-selects correct game, opens Quick Start overlay
- **Outdoor Mode** — all hardcoded #FFFFFF backgrounds replaced with CSS custom property vars
- **AI Slop cleanup** — colored left-borders replaced with top accent borders
- **WebSocket** gated behind feature flag to prevent console noise before server support
- **Homepage touch targets** — links padded to 44px minimum
- **Admin PIN storage** — saved to localStorage on event creation

### Changed
- **Font unification** — Playfair Display as the one serif across all pages (was Newsreader on cards)
- **Format panel headers** bumped from 15px to 16px with letter-spacing
- **Format panel spacing** uses CSS scale vars (--space-3, --space-4)
- **renderSkinsPanel()** extracted as shared function (DRY — removed 120 lines of duplication)
- **worker.js** reduced from 7,876 to 6,828 lines via modularization
