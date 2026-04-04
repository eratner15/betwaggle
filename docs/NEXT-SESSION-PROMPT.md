# Next Session Prompt — Copy/Paste This

## Prompt:

We are building betwaggle.com — a social golf betting platform. I need you to continue the Sprint 5 premium flow redesign.

Read the master plan at /home/eratner/betwaggle/docs/MASTER-PLAN.md and the sprint 5 plan at /home/eratner/betwaggle/docs/SPRINT-5-PREMIUM-FLOW.md for full context.

## What's Already Done:
- Phase 1 (cleanup): 258 junk files deleted, all pages verified 200, core JS locked
- Screen 1 (Trip Page): Dark green hero, gold Start Scoring button, Heritage course section
- Screen 1b (Identity Picker): Dark overlay with blur, Playfair names, gold HI badges
- Screen 2 (Quick Start): Gap fixed, tight spacing, GHIN dropdown hidden when empty
- Screen 3 (Dashboard): Already has Heritage compact header, game panels, gold FAB
- Screen 4 (Scorecard): Heritage dark header added
- Screen 5 (Settlement): Heritage header partially added — needs verification across code paths

## What's Left in Phase 2:
1. Screen 5 (Settlement) — verify Heritage header renders in all modes, improve the "incomplete round" progress display
2. Screen 6 (The Bar / Betting) — verify current state, add gold odds chips if needed
3. Screen 7 (Walkthrough) — verify slides render correctly at 390px mobile

## What's Left After Phase 2:
- Phase 3: Run /simplify, final cleanup
- Phase 4: Launch FL outreach to 51 courses (email system works, drip automation deployed, leads ready)
- Phase 5: Agent rules — Paperclip/Codex agents can do content and QA only, NO code writes

## Critical Rules:
- views.js, app.js, betting.js are chmod 444 — unlock before editing, lock after
- wrangler.jsonc MUST have `routing: { run_worker_first: true }` inside `assets`
- Verify brace balance (opens == closes) before EVERY deploy of views.js
- Test on 390x844 viewport
- Deploy command: `source ~/.nvm/nvm.sh && nvm use 20 && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt CLOUDFLARE_API_TOKEN=_aWVT9W6jGvJvfzdRER67eDxmGxrCxILZhqOCdHp CLOUDFLARE_ACCOUNT_ID=f7a9b24f679e1d3952921ee5e72e677e npx wrangler deploy`

## Key Files:
- `app/js/views.js` — ALL rendering (9384 lines, locked chmod 444)
- `app/js/app.js` — app logic (locked)
- `app/js/betting.js` — odds/settlement (locked)
- `worker.js` — API endpoints (~10K lines)
- `create/index.html` — create flow + Quick Start
- `app/index.html` — SPA shell with tab bar
- `app/css/styles.css` — all CSS
- `DESIGN.md` — Heritage Sporting Ethos design system
- `.stitch-cards/` — premium card HTML prototypes

## Heritage Design Tokens:
- Deep Forest Green: #1B3022
- Burnished Gold: #C5A059
- Ivory Linen: #FCF9F4
- Neon Betting Green: #39FF14 (LIVE indicators only)
- Font Display: 'Playfair Display', serif
- Font Body: 'Inter', sans-serif
- Font Mono: 'SF Mono', monospace
- Border: rgba(197,160,89,0.15)
- Card radius: 0.75rem
- Touch targets: 56px minimum

## Outreach Status:
- 51 FL courses + 30 TX courses with emails in data/
- 7 state email sequences in emails/outreach/
- Email sends from evan@cafecito-ai.com via Resend (works, tested)
- Drip automation: Day 4 + Day 10 follow-ups fire via cron
- Admin dashboard: betwaggle.com/admin/outreach/ (PIN: 4321)
- Marketing PIN: 4321

## Start with:
"Continue Sprint 5 — pick up at Screen 5 Settlement verification"
