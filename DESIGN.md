# Design System -- Waggle

**Locked: 2026-04-04. All UI decisions reference this file. Do not deviate without explicit approval.**

## Product Context

- **What this is:** Premium golf sportsbook for guys trips, scrambles, and member-guests
- **Who it's for:** Golf groups (2-8 players) who want live odds, real-time scoring, and automatic settlement
- **Space:** Golf + sportsbook (DraftKings meets Augusta National)
- **Project type:** Mobile-first web app + marketing site on Cloudflare Workers
- **Brand:** "Waggle" only. Never "BetWaggle". Never "Bet Waggle".
- **Price:** $32/outing everywhere. "$8/person for a foursome."
- **CTAs:** "See It Live" (primary) / "Create Your Outing" (secondary)
- **Footer:** "Waggle by Cafecito AI"

## Aesthetic Direction

**"Clubhouse Dark Mode meets DraftKings"**

The tension between old-money golf tradition (serifs, navy, gold, linen texture) and modern sportsbook energy (live odds, real-time updates, tappable bet slips). The product should feel like the backroom at Bourbon Steak where someone just pulled up a live board on their phone, not a generic mobile app.

- **Direction:** Luxury/Refined with high-octane sportsbook energy
- **Decoration:** Intentional. Subtle linen texture on ivory backgrounds, dark embossed leather texture on betting slips, gold accent borders on cards. Depth via shadows on interactive elements.
- **Mood:** Confident, premium, a little dangerous. The gentleman's guide to high-stakes golf gambling.
- **Materials:** Dark rich backgrounds for action areas (betting, odds, live scores). Crisp heavy-stock paper texture for scorecards. Leather-feel for betting slips. Brass/gold for success states and CTAs.

### The Two Modes

**Clubhouse Mode** (marketing pages, pre-trip dashboard): Ivory backgrounds, navy headers, Georgia body text. Refined, editorial. The gentlemen's lounge.

**Trading Floor Mode** (live scoring, The Bar, game cards, settlement): Dark navy backgrounds, electric green/gold numbers that POP. High contrast. The data should look like a Bloomberg terminal married a DraftKings feed. Monospace numbers. Every dollar amount lights up.

### Outdoor Readability Constraint

This app is used on a golf course under direct sunlight. All contrast ratios must exceed WCAG AAA (7:1 minimum) for critical data: scores, dollars, player names. Dark-on-light AND light-on-dark sections must be readable at arm's length in bright sun.

### Microcopy Tone

Authoritative, knowing, precise. More gentleman's guide to golf gambling than generic tech tutorial.
- "Start Scoring" → "Open the Book"
- "Save Hole 1" → "Lock It In"
- "Submit" → "Set the Board"
- "Share" → "Send the Action"
- Settlement header → "The Ledger"
- Error states → knowing humor ("Even the best scramble teams hit rough patches")

---

## Colors

```css
:root {
  /* Primary palette */
  --navy:          #1B2B4B;   /* Headers, nav bars, dark sections, primary text on light bg */
  --navy-dark:     #0F1A2E;   /* Deepest background (footer, overlays) */
  --navy-mid:      #2A3F66;   /* Hover states on navy, secondary nav */
  --gold:          #C4A35A;   /* Primary CTA, accents, card borders, selected states */
  --gold-light:    #D4B96A;   /* Hover state for gold elements */
  --gold-dim:      #A8894D;   /* Pressed/active state for gold */
  --coral:         #E8735A;   /* Destructive actions, bogey+ scores, error states */
  --coral-light:   #F09080;   /* Hover state for coral */
  --seafoam:       #7ECEC1;   /* Success, birdie scores, positive indicators */
  --seafoam-light: #A5DDD4;   /* Birdie cell background (10% opacity) */
  --ivory:         #FAF8F5;   /* Page background, card backgrounds */
  --ivory-dark:    #F0EDE8;   /* Alternate row backgrounds, section dividers */

  /* Text */
  --text-primary:  #2D3748;   /* Body text */
  --text-heading:  #1A202C;   /* Headings (near-black, not pure black) */
  --text-muted:    #718096;   /* Secondary text, captions, placeholders */
  --text-inverse:  #FAF8F5;   /* Text on dark backgrounds */

  /* Semantic */
  --success:       #48BB78;   /* Positive outcomes, birdie */
  --warning:       #ECC94B;   /* Caution states */
  --error:         #E8735A;   /* Same as coral -- errors and bogey+ */
  --info:          #4299E1;   /* Informational callouts */

  /* Scoring colors (the most important color decisions in the product) */
  --eagle:         #C4A35A;   /* Gold -- eagle or better */
  --birdie:        #48BB78;   /* Green -- birdie */
  --par:           transparent; /* No highlight -- par is the baseline */
  --bogey:         #E8735A;   /* Coral border -- bogey */
  --double-plus:   #C53030;   /* Dark red border -- double bogey or worse */
}
```

### Color Usage Rules

| Context | Background | Text | Accent |
|---------|-----------|------|--------|
| Marketing pages (homepage, /games/) | ivory | text-primary | gold CTAs, navy headers |
| Dashboard / Game Day SPA | ivory | text-primary | navy nav, gold selected tab |
| Dark sections (hero, feature strip, footer) | navy / navy-dark | text-inverse | gold accents |
| Cards (game cards, player cards, bet cards) | white / ivory | text-primary | gold top border (2px) |
| Score cells | ivory (default) | text-heading | Eagle: gold bg. Birdie: green bg. Bogey: coral left-border. Double+: dark red left-border. |
| Error states | coral at 10% opacity | coral | coral border |
| Success states | seafoam at 10% opacity | success | seafoam border |

**Never use:**
- Pure black (#000000) for text. Use --text-heading (#1A202C) at darkest.
- Pure white (#FFFFFF) for backgrounds. Use --ivory (#FAF8F5).
- Neon colors. No #39FF14, no bright blues, no electric purples.
- Gradients on buttons. Flat color with hover state shift.

---

## Typography

```css
:root {
  --font-heading: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body:    Georgia, 'Times New Roman', serif;
  --font-ui:      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-data:    'Tabular Nums', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:    'SF Mono', 'Fira Code', 'Consolas', monospace;
}
```

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| **Display** | Playfair Display | 700 (Bold) | Hero H1, page titles, section heroes |
| **Heading** | Playfair Display | 600 (SemiBold) | H2-H3, card titles, section headers |
| **Subheading** | Playfair Display | 400 (Regular) | H4-H6, supporting headers |
| **Body** | Georgia | 400 (Regular) | Paragraphs, descriptions, long-form content |
| **UI** | System sans-serif | 400/500/600 | Buttons, labels, form inputs, nav items, metadata |
| **Data** | System sans-serif (tabular-nums) | 500 | Scores, odds, money amounts, handicap numbers |
| **Mono** | SF Mono / Fira Code | 400 | Admin PIN display, debug info |

### Type Scale

| Token | Size (mobile) | Size (desktop) | Line Height | Letter Spacing | Usage |
|-------|--------------|----------------|-------------|----------------|-------|
| `display` | 36px | 48px | 1.1 | -0.02em | Hero headlines only |
| `h1` | 28px | 36px | 1.2 | -0.01em | Page titles |
| `h2` | 24px | 28px | 1.3 | 0 | Section headers |
| `h3` | 20px | 24px | 1.3 | 0 | Card titles |
| `h4` | 18px | 20px | 1.4 | 0 | Subsection headers |
| `body` | 16px | 18px | 1.6 | 0 | Content pages (games, guides) |
| `body-sm` | 14px | 16px | 1.5 | 0 | Dashboard text, compact layouts |
| `caption` | 12px | 13px | 1.4 | 0.01em | Metadata, timestamps, helper text |
| `label` | 11px | 12px | 1.3 | 0.05em | Uppercase labels, tab labels |
| `score` | 18px | 20px | 1.0 | 0 | Scorecard cell numbers |
| `odds` | 16px | 18px | 1.0 | 0 | Moneyline odds, spreads |

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
```

Georgia and system fonts require no loading. Playfair Display is the only external font. Budget: ~30KB.

---

## Spacing

```css
:root {
  --space-2xs:  4px;
  --space-xs:   8px;
  --space-sm:   16px;
  --space-md:   24px;
  --space-lg:   32px;
  --space-xl:   48px;
  --space-2xl:  64px;
  --space-3xl:  96px;
}
```

**8px grid.** All spacing values are multiples of 8px (with 4px for tight UI like score cells).

| Context | Spacing |
|---------|---------|
| Between score cells | 2xs (4px) |
| Inside buttons | xs (8px) vertical, sm (16px) horizontal |
| Between form fields | sm (16px) |
| Between cards | md (24px) |
| Between sections | xl (48px) mobile, 2xl (64px) desktop |
| Page margins | sm (16px) mobile, lg (32px) tablet, xl (48px) desktop |

---

## Layout

```css
:root {
  --content-max:  720px;    /* Content pages (games, guides, overview) */
  --page-max:     1200px;   /* Full-width pages (homepage, pricing) */
  --dashboard-max: 480px;   /* Dashboard SPA (phone-width even on desktop) */
}
```

- **Mobile-first.** Everything designed for 375px first, enhanced for larger screens.
- **Breakpoints:** sm (640px), md (768px), lg (1024px), xl (1280px)
- **Dashboard is always phone-width.** Even on desktop, the game day SPA renders in a centered 480px column. This is intentional. Golf scoring happens on phones.

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Score cells, small badges |
| `radius-md` | 8px | Buttons, inputs, small cards |
| `radius-lg` | 12px | Cards, modals, sections |
| `radius-xl` | 16px | Large hero cards, pricing cards |
| `radius-full` | 9999px | Pills, avatar circles, round buttons |

---

## Touch Targets

**Minimum 56px on all tappable elements.** This is non-negotiable. Golf apps are used outdoors with sweaty fingers, in sunlight, while walking.

| Element | Min Height | Min Width | Notes |
|---------|-----------|-----------|-------|
| Buttons | 56px | 120px | Primary CTAs: 56px tall |
| Score cells | 48px | 40px | Tappable scorecard cells |
| Number picker buttons | 56px | 56px | Score entry (1-12) |
| Tab bar items | 56px | -- | Bottom navigation tabs |
| Nav arrows | 48px | 48px | Hole navigation in scorecard |
| Links in body text | 44px | -- | Padded tap area even if text is small |
| Form inputs | 48px | -- | Text fields, dropdowns |

---

## Components

### Buttons

```
PRIMARY (Gold):
  Background: var(--gold)
  Text: white, font-ui 500, 16px
  Height: 56px
  Border-radius: radius-md (8px)
  Hover: var(--gold-light)
  Active: var(--gold-dim)
  No border, no shadow, no gradient.

SECONDARY (Outlined):
  Background: transparent
  Border: 2px solid var(--navy)
  Text: var(--navy), font-ui 500, 16px
  Height: 56px
  Hover: navy at 5% opacity background
  Active: navy at 10% opacity background

DESTRUCTIVE (Coral):
  Background: var(--coral)
  Text: white, font-ui 500, 16px
  Height: 48px (slightly smaller -- destructive actions should be harder to hit)
  Hover: var(--coral-light)

GHOST (Text only):
  Background: transparent
  Text: var(--text-muted), font-ui 400, 14px
  Hover: text-primary
  Used for: "Skip", "Cancel", "Maybe Later"

DISABLED:
  Background: var(--ivory-dark)
  Text: var(--text-muted)
  Cursor: not-allowed
  Opacity: 0.6
```

### Cards

```
BASE CARD:
  Background: white
  Border: 1px solid var(--ivory-dark)
  Border-top: 2px solid var(--gold)   /* Gold top accent -- the Waggle signature */
  Border-radius: radius-lg (12px)
  Padding: var(--space-md) (24px)
  Shadow: none (depth via border, not shadow)

GAME CARD (on /games/ hub):
  Base card + game icon left, title + description right
  Tappable: entire card is a link
  Hover: border-color shifts to gold

PLAYER CARD (on create + dashboard):
  Compact: name, handicap index, remove button
  Height: 48px
  Layout: row, space-between

BET CARD (on Bets tab):
  Matchup title, odds chips, tappable
  Odds chips: navy background, gold text, radius-full, 36px height
  Selected state: gold background, navy text

COURSE CARD (on /courses/):
  Course name (h3), city/state, par, slope, rating
  Tee selector dropdown
```

### Scorecard Table

The single most important component in the product.

```
LAYOUT:
  Horizontal scroll on mobile (holes 1-9, then 10-18)
  Sticky left column (player names)
  Sticky top row (hole numbers + par)
  Font: font-data, score size (18px)

HEADER ROW:
  Background: var(--navy)
  Text: var(--text-inverse), label size (12px), uppercase
  Height: 36px

PAR ROW:
  Background: var(--ivory-dark)
  Text: var(--text-muted), body-sm (14px)
  Height: 32px

SCORE CELLS:
  Default: white background, text-heading, 18px, centered
  Empty: ivory background, subtle "tap" indicator (light dashed border)
  Height: 48px, Width: 40px minimum

SCORE CELL COLORS:
  Eagle or better: gold background (#C4A35A at 20% opacity), gold text
  Birdie: green background (#48BB78 at 15% opacity), green text
  Par: no highlight (transparent background, normal text)
  Bogey: coral left border (3px solid #E8735A)
  Double bogey+: dark red left border (3px solid #C53030)

TOTALS COLUMN (Out / In / Total):
  Background: var(--ivory-dark)
  Font-weight: 600
  Separated by 2px gold border from score columns
```

### Score Entry (Number Picker)

The most critical interactive component. Used between holes on the course.

```
TRIGGER: Tap any empty score cell
APPEARANCE: Inline overlay below the tapped cell (not a full modal)
CONTENT: Number buttons 1 through 12, arranged in 4x3 grid
BUTTON SIZE: 56px x 56px each (touch target requirement)
PAR HIGHLIGHT: The par value for this hole has a gold ring
DEFAULT: Par is pre-selected (gold background) but not submitted until tapped

BEHAVIOR:
  1. Tap cell -> picker appears with slide-down animation (150ms)
  2. Par button highlighted gold
  3. Tap a number -> cell fills immediately
  4. Picker slides to next empty cell (same hole next player, or next hole)
  5. Score saved to localStorage on every entry (zero latency)
  6. Running totals update instantly
  7. Game calculations (Nassau, skins) update instantly

COLORS:
  Number buttons: white background, navy text, radius-md
  Par button: gold ring (2px border)
  Selected: gold background, white text
  Hover: ivory-dark background
```

### Navigation

```
MARKETING PAGES (homepage, /games/, /guides/, /courses/, /pricing/):
  Top nav bar
  Height: 64px
  Background: white
  Logo left (links to /), nav links right
  Mobile: hamburger menu
  Sticky on scroll

DASHBOARD SPA (/:slug/):
  Bottom tab bar (mobile pattern)
  Height: 64px (includes safe area padding on iPhone)
  Background: white
  Border-top: 1px solid var(--ivory-dark)
  4 tabs: Home, Bets, Scorecard, Settlement
  Active tab: gold icon + gold label
  Inactive: text-muted icon + label
  Icon size: 24px
  Label: 11px, uppercase, 0.05em letter-spacing
```

### Bet Slip Drawer

```
POSITION: Sticky bottom, above tab bar
TRIGGER: Tap any odds chip on Bets tab
APPEARANCE: Slides up from bottom (250ms, ease-out)
BACKGROUND: navy-dark
CONTENT:
  - Selected bets as chips (gold background, navy text)
  - Total stake input
  - "Confirm Bets" gold CTA
HEIGHT: Auto (content-driven), max 40vh
DISMISS: Swipe down or tap X
```

### Form Inputs

```
TEXT FIELD:
  Height: 48px
  Background: white
  Border: 1px solid var(--ivory-dark)
  Border-radius: radius-md (8px)
  Padding: 0 var(--space-sm)
  Font: font-ui, 16px (prevents iOS zoom)
  Focus: border-color var(--gold), box-shadow 0 0 0 3px rgba(196,163,90,0.15)
  Error: border-color var(--coral), error message below in coral

SEARCH AUTOCOMPLETE:
  Text field + dropdown results
  Results: white card below input, radius-lg, max-height 240px, scrollable
  Each result: 48px tall, hover: ivory-dark background
  Selected: gold left border

DROPDOWN:
  Same as text field, with chevron icon right
  Options: native <select> on mobile (better UX than custom)
```

---

## Motion & Animation

```css
:root {
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);    /* Enter animations */
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);     /* Exit animations */
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);    /* Move/transform */

  --duration-micro:  100ms;   /* Hover color shifts, focus rings */
  --duration-short:  150ms;   /* Score cell fill, tab switch */
  --duration-medium: 250ms;   /* Drawer open, card expand, picker slide */
  --duration-long:   400ms;   /* Page transitions, settlement reveal */
}
```

| Pattern | Duration | Easing | Usage |
|---------|----------|--------|-------|
| Score cell fill | 150ms | ease-out | Number appears with quick scale-up from 0.8 to 1.0 |
| Score flash (birdie) | 300ms | ease-out | Green pulse on the cell, fades to birdie bg color |
| Score flash (eagle) | 400ms | ease-out | Gold pulse + subtle scale, fades to eagle bg color |
| Number picker open | 150ms | ease-out | Slide down from cell |
| Number picker close | 100ms | ease-in | Slide up and fade |
| Bet slip drawer open | 250ms | ease-out | Slide up from bottom |
| Bet slip drawer close | 200ms | ease-in | Slide down |
| Tab switch | 150ms | ease-in-out | Crossfade content |
| Card expand (FAQ) | 250ms | ease-out | Height animate open |
| Odds change | 200ms | ease-out | Flash gold, slide number up/down |
| Settlement reveal | 400ms | ease-out per row | Staggered: each player row fades in 100ms after previous |
| Haptic feedback | -- | -- | Light haptic on score entry and bet confirmation (navigator.vibrate) |

**No motion:** Score cells have no entrance animation. They just appear. Speed matters more than polish during active scoring.

---

## Settlement Display

```
LAYOUT: Vertical card stack, one card per game format

GAME CARD:
  Title: game name (h3, Playfair)
  Breakdown: per-player results in a compact table
  Amounts: green for positive ($+15), coral for negative ($-15)
  Net row: bold, separated by gold border-top

FINAL LEDGER:
  "Who Owes Who" section
  Each row: "Player A owes Player B $15"
  Amounts in bold, color-coded
  Net check: "Settlement nets to $0.00" in success green
  (If net != $0.00, show error state with coral warning)

SHARE CARD:
  Tappable "Share Settlement Card" button
  Generates a styled image with all results
  Venmo/CashApp deep links for each payment
```

---

## Asset Budget

| Resource | Max Size |
|----------|----------|
| Total page weight | 600KB |
| HTML (per page) | 100KB |
| CSS (external) | 30KB |
| JavaScript (per page) | 200KB |
| Images (per page) | 200KB |
| Fonts (Playfair Display) | 30KB |

## Generated Asset Rule

- GPT-4o image generation is allowed only for decorative UI assets such as hero art, background illustrations, textures, or ambient visual accents.
- Never bake product copy, labels, headlines, buttons, pricing, scores, odds, or any other readable UI text into generated images.
- All user-facing text must remain live HTML/CSS text so it stays accessible, searchable, editable, localizable, and crisp on every screen size.
- If an asset needs typography, logos, badges, or UI copy, compose those layers in HTML/CSS or SVG after the decorative image is placed.
- Treat generated images as background/supporting art, not as the source of information.

---

## Logo

**One logo.** `logo.png` (or `logo.jpg` for compressed contexts). Top left corner. Links to homepage. No variations, no alternatives.

Supplemental files (for OG/social only): `og-card-logo.jpg`, `og-card.svg`, `favicon-180.jpg`

Delete: `bet_waggle_logo_no_background.png`, `waggle_logo.jpg`, `logo-cropped.jpg`, `logo-cropped.png`, `logo-hero.jpg`, `logo-nav.jpg`, `logo-nav.png`

---

## Dark Mode

Not implemented for v1. The dashboard is always light (ivory background). Dark mode adds complexity to the scorecard color system that isn't worth the tradeoff yet.

If added later: reduce saturation 10-20% on all accent colors, swap ivory for navy-dark backgrounds, text-inverse becomes text-primary.

---

## Do's and Don'ts

### Do

- Use ivory (#FAF8F5) for all page backgrounds, never pure white
- Use gold top borders (2px) on cards as the Waggle signature
- Use GPT-4o image generation only for decorative assets, never for UI text
- Use system sans-serif for UI controls (buttons, inputs, tabs, labels)
- Use Georgia for all body text and long-form content
- Use Playfair Display only for headings and display text
- Respect 56px touch targets on every tappable element
- Color-code scores immediately on entry (birdie green, eagle gold)
- Show running totals that update instantly on every score entry
- Use uppercase + letter-spacing for small labels and tab items

### Don't

- Use pure black (#000000) for any text
- Use pure white (#FFFFFF) for any background
- Use gradients on buttons or CTAs
- Use box shadows for card depth (use borders instead)
- Use neon colors anywhere
- Use more than one serif font (Playfair Display is the only display serif)
- Put readable text inside generated images
- Use innerHTML for rendering (DOM creation methods only)
- Use full-width layouts for the dashboard (480px max)
- Show "BetWaggle" or "Bet Waggle" anywhere
- Use stock photography. Illustrations or abstract patterns only.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-04 | Replaced Heritage Sporting Ethos (forest green/neon green) with navy/gold/coral/seafoam palette | Forest green + neon betting green felt like a golf course, not a sportsbook. Navy + gold is the clubhouse bar. |
| 2026-04-04 | Playfair Display + Georgia instead of Newsreader + Manrope | Playfair is more authoritative for display. Georgia is the workhorse serif that renders perfectly everywhere. |
| 2026-04-04 | Dashboard locked to 480px max-width | Golf scoring is a phone activity. Stretching the SPA to desktop width wastes space and breaks the intimate, mobile-native feel. |
| 2026-04-04 | No dark mode in v1 | Scorecard color system (eagle gold, birdie green, bogey coral) needs extensive testing in dark mode. Ship light first. |
| 2026-04-04 | Score entry via inline picker, not full modal | Full modals break flow between holes. Inline picker keeps context and enables faster entry. |
| 2026-04-04 | No gradients, no shadows on buttons | Flat + color shift on hover is faster to render, cleaner to read, and looks more premium than gradient buttons. |
