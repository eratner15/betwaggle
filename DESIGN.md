# Design System Document: The Heritage Sporting Ethos

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Clubhouse"**

This design system is a transition from the ephemeral nature of mobile apps to the permanence of a private club. We are not building a generic betting interface; we are crafting an editorial dashboard that feels as though it were printed on heavy-stock linen and bound in leather. 

The system breaks the "template" look by favoring intentional asymmetry—using large, high-contrast serif displays offset against hyper-clean data visualizations. We avoid the rigid, boxy constraints of standard bootstrap grids in favor of layered surfaces that mimic physical card-stock on a felt table. The visual soul of the experience lies in the tension between the "Old World" (Serif typography, Ivory Linen textures) and the "High-Performance" (Neon betting accents, Glassmorphic overlays).

---

## 2. Colors & Surface Architecture

The palette is rooted in tradition but punctuated by the urgency of live sports.

### Color Tokens (Material Design Mapping)
*   **Primary (`#1B3022`):** "Deep Forest Green" – Used for high-authority headers, primary CTAs, and navigation bars.
*   **Secondary (`#C5A059`):** "Burnished Gold" – Reserved for accents, 1px borders, and status-level indicators.
*   **Tertiary (`#39FF14`):** "Neon Betting Green" – Used sparingly for "LIVE" indicators and winning probability shifts.
*   **Surface (`#FCF9F4`):** "Ivory Linen" – The base of the entire experience.

### The "No-Line" Rule
Standard UI relies on gray dividers to separate content. In this system, **1px solid gray borders are prohibited for sectioning.** Boundaries must be defined through:
1.  **Background Shifts:** Use `surface-container-low` for sidebars and `surface-container-lowest` for main content areas.
2.  **Tonal Transitions:** A section should end where the linen texture subtly changes depth.

### Surface Hierarchy & Nesting
Treat the UI as stacked sheets of fine paper. 
*   **Level 0 (Surface):** The main "table" background.
*   **Level 1 (Surface-Container-Low):** Large content sections.
*   **Level 2 (Surface-Container-Highest):** Floating cards or "Exclusive" highlight modules.
*   **Nesting:** A `secondary_container` card (Gold tint) should only ever sit on a `primary` or `surface` background to maintain high-end contrast.

### The "Glass & Gradient" Rule
For high-tech betting overlays, use **Glassmorphism**:
*   Apply a `surface` color at 60% opacity with a `20px` backdrop blur.
*   CTAs should use a subtle linear gradient from `primary` (#1B3022) to `primary_container` (#304D39) at a 135-degree angle to provide a "sheen" reminiscent of polished leather.

---

## 3. Typography

The typographic hierarchy is designed to feel like a premium sports journal.

| Level | Token | Font Family | Style | Intent |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Newsreader | High-Contrast Serif | Hero scores & Tournament titles. |
| **Headline** | `headline-md`| Newsreader | Semi-Bold Serif | Section headers (e.g., "The Bar"). |
| **Title** | `title-lg` | Manrope | Geometric Sans | Card titles and player names. |
| **Body** | `body-md` | Manrope | Regular Sans | Detailed odds and descriptive text. |
| **Label** | `label-sm` | Inter | All-Caps Bold | UI Metadata (e.g., "BETTING ODDS"). |

**Editorial Note:** Always pair a `display-lg` serif header with a `label-sm` sans-serif sub-header in "Burnished Gold" to establish an authoritative, curated look.

---

## 4. Elevation & Depth

We eschew "material" shadows for **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by placing `surface-container-lowest` cards on top of `surface-container-low` sections. This creates a "soft lift" that feels architectural rather than digital.
*   **Ambient Shadows:** When a card must float (e.g., a betting slip), use an extra-diffused shadow: `box-shadow: 0 12px 40px rgba(27, 48, 34, 0.06)`. Note the shadow is a tinted version of our Deep Forest Green, not black.
*   **The "Ghost Border":** For card containment, use the `secondary` (Gold) token at **15% opacity**. It should feel like a watermark, not a fence.
*   **Glassmorphism:** Use semi-transparent layers for "Live Stats" that slide over the leaderboard. This keeps the user grounded in the game while providing a futuristic betting surface.

---

## 5. Components

### Buttons
*   **Primary:** `primary` background, `on_primary` text. No border. `xl` roundedness (0.75rem).
*   **Secondary:** `surface` background with a `1px` solid `secondary` (Gold) border.
*   **Action (Betting):** `tertiary_fixed` (Neon Green) only for "Place Bet" or "Live" actions to ensure outdoor visibility.

### Cards & Leaderboards
*   **Cards:** Forbid divider lines. Use `spacing-6` (2rem) of vertical white space to separate players.
*   **Leaderboard Rows:** Use alternating background shifts between `surface` and `surface-container-low`.
*   **Signature Element:** Every card should feature a `1px` Gold corner accent or a thin Gold top-border to signify "Member-Only" quality.

### Inputs & Betting Slips
*   **Fields:** Use `surface_container_highest` for the input well. 
*   **Focus State:** A `1px` solid Gold border with a 4% Gold outer glow.
*   **Odds Chips:** Use `secondary_fixed` for neutral odds and `tertiary_fixed` for favored "Live" odds.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts (e.g., a left-aligned header with a right-aligned decorative gold line).
*   **Do** prioritize "Paper White" (`surface`) for large areas to ensure readability in bright, outdoor golf environments.
*   **Do** use `title-sm` (Manrope) for all numerical data to ensure clarity.

### Don't
*   **Don't** use 100% black text. Always use `on_surface` (#1C1C19) or `on_surface_variant`.
*   **Don't** use standard `0.25rem` border-radii for everything. Use `xl` (0.75rem) for cards and `full` for betting chips to create a sophisticated, tailored feel.
*   **Don't** use drop shadows on text. If visibility is an issue on images, use a subtle `primary` gradient overlay behind the text.