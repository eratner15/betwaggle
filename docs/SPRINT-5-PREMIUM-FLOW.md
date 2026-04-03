# SPRINT 5: Make Every Screen Premium — Detailed Plan

## The Problem
The product works functionally but looks like 5 different apps stitched together. The hero card has diagonal gold stripes that look cheap. The player cards are basic. The scorecard is plain white. Settlement is a text box. Every screen needs to feel like ONE premium product.

## The Standard
Every screen should feel like you opened the DraftKings app for golf. Dark green + gold + ivory. Playfair Display headers. No gray borders. No plain white boxes. When a course pro sees this, they should think "this is better than anything I've seen."

---

## SCREEN 1: Trip Page / Pre-Game (what your screenshot shows)

### Current Issues:
- Hero card: diagonal gold stripes are ugly and hard to read
- "YOU ARE INVITED" text is too small and faint
- "Game Day" / countdown area is cluttered
- "Start Scoring" button: wrong green, looks like a form button
- Course section: "On the course" with a tiny flag emoji looks cheap
- "Change Course" link is an afterthought
- "The Field" header: plain text, no Heritage treatment
- Player cards: basic white boxes with thin borders
- FAV badge: tiny, positioned awkwardly behind the odds
- Odds buttons: plain bordered boxes, not DraftKings-style chips
- "Opening Lines" header: plain gold text, no container
- H2H spread cards: functional but flat
- "Prop Bets" header: plain text
- Prop cards: white boxes with gold left-border (boring)
- "Games" section: tiny pill badges
- "Trash Talk" section: plain italic text
- "Add Player" section: GHIN lookup at the bottom of the page (should be higher or collapsible)
- Bottom nav: "The Board" + "Settle" only — too sparse

### What It Should Look Like:
- Hero: REMOVE diagonal stripes entirely. Clean dark green gradient. Event name in Playfair Display 28px. Course name + date below. Countdown number in 64px gold. No busy patterns.
- "Start Scoring" button: Full-width, Burnished Gold (#C5A059) background, dark green text, Playfair Display "Start Scoring", 56px height. This is the primary CTA.
- Course section: Dark green header bar (same as game panels). Course name in Playfair. Slope/rating as gold badges. Hole-by-hole in a collapsible.
- The Field: Already has Heritage header (we just added this). Keep it.
- Player cards: Gold ghost-border. Favorite gets gold glow. Names in Playfair. HI as gold badge. Odds as tappable dark-green chips with gold text.
- Opening Lines: Heritage dark header. Spread cards as dark green with gold numbers.
- Props: Heritage dark header. Prop text in Playfair italic.
- Games: Show as Heritage badge pills with gold borders, not plain text.
- Trash Talk: Dark card with gold accent. Input field styled to match.
- Add Player: Collapse into a "+" button. GHIN search in a modal, not inline.
- Bottom nav: Add icons. Gold highlight on active tab.

### Files to Edit:
- `app/js/views.js` — renderTripPage() starting at line ~8136
- `app/css/styles.css` — bottom nav, button styles

---

## SCREEN 2: Quick Start (create flow after picking Weekend Warrior)

### Current Issues:
- Big empty gap between GHIN search and textarea
- "OR TYPE NAMES BELOW" divider wastes vertical space
- Textarea placeholder text is hard to read on dark bg
- Player preview cards are functional but small
- "OPENING LINES" preview section: wrong background (light on dark)
- Course search section: plain input, no visual hierarchy
- Game format cards: 2-column grid is OK but cards lack visual distinction when selected
- "OPEN THE BOOK" button: good gold color but could be bigger
- Overall: too much scrolling required

### What It Should Look Like:
- Remove the gap between GHIN search and textarea. Stack them tighter.
- Remove "OR TYPE NAMES BELOW" — just show the textarea directly after GHIN search with a thin divider line
- Player preview: show as horizontal scrollable chips (name + HI) instead of 2-column grid
- Course search: add a golf course icon, show selected course as a premium card
- Game cards: selected state should have bright gold border + dark green fill. Unselected should be subtle.
- "OPEN THE BOOK" button: 64px height, full width, pulse animation on gold
- Reduce total scroll distance — this should fit in ~1.5 screens max

### Files to Edit:
- `create/index.html` — renderQuickStartOverlay() function

---

## SCREEN 3: Dashboard (during gameplay — what players see for 4 hours)

### Current Issues:
- This is the most important screen and it needs the most work
- The hero area (event name + pot) needs to be compact, not a full card
- Leaderboard rows need real-time feel (flash on score change)
- Game panels (Skins/Nassau/Wolf) have Heritage headers now but the content inside is still basic
- No visual distinction between "live" data and static data
- The "$0 staked" badge in the header is correct but needs better placement
- Score entry FAB (floating action button) needs to be prominent

### What It Should Look Like:
- Compact header: event name + course in one line. Pot amount as gold badge. No hero card.
- Leaderboard: keep Heritage "The Field" header. Player rows flash gold on score update. Current leader gets persistent gold glow.
- Game panels: Heritage headers are good. Content needs:
  - Skins: gold coin animation on carry, trophy emoji on win
  - Nassau: three stacked mini-cards, press events highlighted in gold
  - Wolf: crown emoji on current wolf, rotation as visual wheel
- Score entry FAB: bottom-right, 64px, gold circle with "+" icon, always visible
- Tab bar: The Board | Bet | Scores | Settle — with icons

### Files to Edit:
- `app/js/views.js` — renderDashboard() (the main render during gameplay)
- `app/css/styles.css` — FAB, animations, tab bar

---

## SCREEN 4: Score Entry

### Current Issues:
- Plain white background, no Heritage theme
- Score buttons are functional but not color-coded
- No haptic feedback visual (no animation on tap)
- Hole number display is small
- Par indicator is easy to miss

### What It Should Look Like:
- Dark green background with ivory text
- Large hole number: "HOLE 7" in Playfair Display 24px
- Par indicator: "PAR 4 • 385 yds" in gold
- Score buttons as large circles (64px):
  - Eagle: gold with sparkle border
  - Birdie: green (#16A34A) with glow
  - Par: ivory/neutral
  - Bogey: red tint
  - Double+: dark red
- Selected score: gold ring highlight
- Auto-advance countdown ring (1.5s) after selection
- Progress strip at top: 18 circles showing completed holes

### Files to Edit:
- `app/js/views.js` — score entry section in renderCasualScorecard()
- `app/css/styles.css` — score button styles

---

## SCREEN 5: The Bar (Betting)

### Current Issues:
- Haven't verified current state — may still be basic
- Odds should be tappable gold chips
- Bet slip should slide up from bottom

### What It Should Look Like:
- Dark green background
- Each matchup as a Heritage card with two players facing each other
- Odds displayed as gold chips: tap to add to bet slip
- Bet slip: slides up from bottom, gold accent, shows running total
- "Place Bet" button: gold, 56px height

### Files to Edit:
- `app/js/views.js` — renderBetting()

---

## SCREEN 6: Settlement

### Current Issues:
- Shows "Settlement available after all holes scored" — plain text box
- No ceremony on completed games
- No share card visible
- No Venmo/CashApp buttons

### What It Should Look Like:
- If round incomplete: show progress bar "12 of 18 holes scored" with list of remaining
- If round complete: ceremony plays (dark overlay, staggered reveal, confetti on winner)
- After ceremony: show settlement card with standings + amounts
- Venmo/CashApp pay buttons for each player who owes
- Share button: "Drop this in the group chat"
- "Create Your Own Event" referral CTA at bottom

### Files to Edit:
- `app/js/views.js` — renderSettlement()
- `app/css/styles.css` — ceremony animations

---

## SCREEN 7: Walkthrough (/walkthrough/)

### Current Issues:
- Need to verify it looks right on mobile
- Slides should auto-advance smoothly

### What It Should Look Like:
- Already built — just verify each slide renders correctly
- Timer bar should be visible gold
- Progress dots should highlight current slide
- Final CTA slide should have prominent buttons

### Files to Edit:
- `walkthrough/index.html` — verify only

---

## EXECUTION ORDER

1. **Trip Page hero + Start Scoring button** (highest visibility — first thing users see)
2. **Quick Start spacing + scroll reduction** (create flow conversion)
3. **Dashboard compact header + leaderboard** (4-hour gameplay screen)
4. **Score entry color coding** (core interaction loop)
5. **Settlement ceremony** (the money moment)
6. **The Bar betting interface** (engagement driver)
7. **Walkthrough verification** (sales tool)

## RULES
- Every edit: verify brace balance before deploying
- Lock views.js after each deploy
- Test on 390x844 viewport (iPhone 14 size)
- No agent edits to views.js, app.js, betting.js
- One screen at a time — deploy and verify before moving to next
